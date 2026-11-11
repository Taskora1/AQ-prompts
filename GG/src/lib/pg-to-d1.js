// Postgres (Neon) -> SQLite (Cloudflare D1) SQL translator.
//
// The app's call sites keep writing Postgres-dialect SQL (see src/lib/db.js):
// `$n` placeholders, `::` casts, `ILIKE`, `NOW()`, `JSONB_AGG`, `FOR UPDATE`,
// `= ANY(...)`, and so on. On the D1 backend this module rewrites each
// statement into SQLite dialect before it is prepared. On the Neon backend
// the SQL passes through untouched, so the same call sites work on both
// backends and the rollback path needs no code change.
//
// Design rules:
// - Only code is rewritten. String literals, quoted identifiers and comments
//   are masked out first, so a `$1` or `::text` inside a literal is never
//   touched (e.g. the `\y...\y` regex literal, or a `?` inside a prompt).
// - Anything this module does not know how to translate throws a
//   PgToD1Error instead of producing silently wrong SQL. The throw lists
//   the construct, so a new Postgres-ism fails loudly at the call site
//   instead of corrupting a query.
// - Timestamps: Neon stores timestamptz as ISO 8601 text in D1
//   (e.g. `2026-11-11T13:30:11.955Z`, see the data track's conversion log),
//   so NOW() translates to strftime() in the same ISO shape. A space-shaped
//   `datetime('now')` would sort/compare wrong against ISO values
//   (the separator differs at position 10), so never use it here.

export class PgToD1Error extends Error {
  constructor(message) {
    super(message);
    this.name = 'PgToD1Error';
  }
}

const ISO_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

// ---------------------------------------------------------------------------
// Masking: split SQL into code vs literal/comment spans.
// ---------------------------------------------------------------------------

function maskSql(sql) {
  const code = new Array(sql.length).fill(true);
  let i = 0;
  const n = sql.length;
  const mark = (from, to) => {
    for (let j = from; j < to; j += 1) code[j] = false;
  };
  while (i < n) {
    const ch = sql[i];
    // Line comment -- ... (not -- inside a string; strings are handled below
    // because the scanner only reaches here outside a string).
    if (ch === '-' && sql[i + 1] === '-') {
      let j = i + 2;
      while (j < n && sql[j] !== '\n') j += 1;
      mark(i, j);
      i = j;
      continue;
    }
    // Block comment /* ... */
    if (ch === '/' && sql[i + 1] === '*') {
      let j = sql.indexOf('*/', i + 2);
      j = j === -1 ? n : j + 2;
      mark(i, j);
      i = j;
      continue;
    }
    // Single-quoted string '...' ('' is an escaped quote).
    if (ch === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { j += 2; continue; }
          j += 1;
          break;
        }
        j += 1;
      }
      mark(i, j);
      i = j;
      continue;
    }
    // Double-quoted identifier "..." ("" is an escaped quote).
    if (ch === '"') {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') { j += 2; continue; }
          j += 1;
          break;
        }
        j += 1;
      }
      mark(i, j);
      i = j;
      continue;
    }
    // Dollar-quoted string $tag$ ... $tag$ (including $$ ... $$).
    if (ch === '$') {
      const tag = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$/)
        || sql.slice(i).match(/^\$\$/);
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        const j = end === -1 ? n : end + tag[0].length;
        mark(i, j);
        i = j;
        continue;
      }
    }
    i += 1;
  }
  return code;
}

function isCodeAt(code, index) {
  return index >= 0 && index < code.length && code[index];
}

// Apply `regex` (global) to `text`, but only to matches that start in code.
// A match may span a string literal in the middle (e.g. the FILTER clause
// in `COALESCE(AVG(rating) FILTER (WHERE status = 'approved'), 0)` or the
// `'24 hours'` in `NOW() - INTERVAL '24 hours'`): the literal is part of
// the construct being rewritten. A match starting inside a literal is
// never rewritten, so `$1` or `::text` inside a prompt string is safe.
function replaceInCode(text, code, regex, replacer) {
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  let out = '';
  let last = 0;
  let match;
  re.lastIndex = 0;
  while ((match = re.exec(text)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    if (!isCodeAt(code, from)) continue;
    out += text.slice(last, from);
    out += replacer(match, from);
    last = to;
    if (match[0].length === 0) re.lastIndex += 1;
  }
  out += text.slice(last);
  return out;
}

// Find the index of the `)` matching the `(` at `openIndex` (code only;
// parens inside literals/comments do not count).
function matchingCloseParen(text, code, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    if (!isCodeAt(code, i)) continue;
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Split the text inside a call's parens into top-level arguments
// (commas at depth 0 in code only). `openIndex` is the index of `(`,
// `closeIndex` the index of the matching `)`. Returns [{from, to}] spans
// relative to `text` (trimmed of surrounding whitespace).
function splitTopLevelArgs(text, code, openIndex, closeIndex) {
  const args = [];
  let depth = 0;
  let start = openIndex + 1;
  for (let i = openIndex + 1; i < closeIndex; i += 1) {
    if (!isCodeAt(code, i)) continue;
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') depth -= 1;
    else if (text[i] === ',' && depth === 0) {
      args.push({ from: start, to: i });
      start = i + 1;
    }
  }
  args.push({ from: start, to: closeIndex });
  return args.map(({ from, to }) => {
    let a = from;
    let b = to;
    while (a < b && /\s/.test(text[a])) a += 1;
    while (b > a && /\s/.test(text[b - 1])) b -= 1;
    return { from: a, to: b };
  });
}

// Find the first top-level comma at depth 1 after `openIndex` (the `(`).
function firstTopLevelComma(text, code, openIndex, closeIndex) {
  let depth = 0;
  for (let i = openIndex + 1; i < closeIndex; i += 1) {
    if (!isCodeAt(code, i)) continue;
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') depth -= 1;
    else if (text[i] === ',' && depth === 0) return i;
  }
  return -1;
}

function sliceTrimmed(text, from, to) {
  let a = from;
  let b = to;
  while (a < b && /\s/.test(text[a])) a += 1;
  while (b > a && /\s/.test(text[b - 1])) b -= 1;
  return text.slice(a, b);
}

// The raw contents of a single-quoted SQL string literal (no quotes,
// '' unescaped to '). `text` is the literal including its quotes.
function unquoteLiteral(literal) {
  if (literal.length >= 2 && literal.startsWith("'") && literal.endsWith("'")) {
    return literal.slice(1, -1).replace(/''/g, "'");
  }
  return literal;
}

// ---------------------------------------------------------------------------
// Phase A: code-only textual rewrites (no value knowledge needed).
// ---------------------------------------------------------------------------

function applyPhaseA(sql) {
  let text = sql;

  // -- 0. DDL-only translations (CREATE/ALTER). Detected on the first word.
  const firstWord = (text.trim().match(/^[A-Za-z]+/) || [''])[0].toUpperCase();
  const isDdl = firstWord === 'CREATE' || firstWord === 'ALTER';
  if (isDdl) {
    text = applyDdlTranslations(text);
  }

  // -- 1. AVG(...)::numeric(p, s)::text -> printf('%.2f', ...) ----------
  // Postgres formats the average to 2 decimals as text; SQLite's AVG
  // returns a bare float, so format it the same way.
  {
    const re = /COALESCE\(\s*AVG\(([^()]*)\)(\s+FILTER\s*\([^()]*\))?,\s*0\s*\)::numeric\(\s*\d+\s*,\s*\d+\s*\)::text/gi;
    text = replaceInCode(text, maskSql(text), re, (m) => `printf('%.2f', COALESCE(AVG(${m[1]})${m[2] || ''}, 0))`);
  }

  // -- 2. NOW() + ($n * INTERVAL '1 second') ---------------------------
  // e.g. broker token expiry. The modifier is an expression, which SQLite
  // accepts: datetime('now', '+' || 3600 || ' seconds').
  {
    const re = /NOW\(\)\s*\+\s*\(\s*\$(\d+)\s*\*\s*INTERVAL\s*'1 second'\)/gi;
    text = replaceInCode(text, maskSql(text), re, (m) => `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+' || $${m[1]} || ' seconds')`);
  }

  // -- 3. NOW() +/- INTERVAL 'literal' ----------------------------------
  {
    const re = /NOW\(\)\s*([+-])\s*INTERVAL\s*'([^']+)'/gi;
    text = replaceInCode(text, maskSql(text), re, (m) => `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '${m[1]}${m[2]}')`);
  }

  // -- 4. NOW() -----------------------------------------------------------
  {
    const re = /NOW\(\)/gi;
    text = replaceInCode(text, maskSql(text), re, () => ISO_NOW);
  }

  // -- 5. (expr)::timestamp AT TIME ZONE 'UTC' -> (expr) -----------------
  // Only used as `(LEFT(date::text, 10)::date)::timestamp AT TIME ZONE
  // 'UTC'` (blog related-posts ordering): the date part alone orders the
  // same way once the LEFT() below becomes substr(). The `::date` cast is
  // removed by the generic cast rule.
  {
    const re = /\)::timestamp AT TIME ZONE 'UTC'/gi;
    text = replaceInCode(text, maskSql(text), re, () => ')');
  }

  // -- 6. 'epoch'::timestamptz -> the epoch as ISO text ------------------
  // A bare 'epoch' string would sort AFTER every real timestamp (its first
  // letter beats '2'), so it must become the epoch instant itself. The
  // literal is part of the match, so this is a dedicated scan rather
  // than a replaceInCode pattern (those must start in code). Other
  // ::timestamptz casts (e.g. p.created_at::timestamptz, a no-op on a
  // column that is already a timestamp) are left for the generic cast
  // removal in step 16.
  {
    const re = /'epoch'::timestamptz\b/gi;
    let searchFrom = 0;
    for (;;) {
      re.lastIndex = searchFrom;
      const match = re.exec(text);
      if (!match) break;
      const code = maskSql(text);
      const castIndex = match.index + "'epoch'".length;
      if (!isCodeAt(code, castIndex)) {
        // The match sits inside a string literal, not a real cast.
        searchFrom = match.index + 1;
        continue;
      }
      text = text.slice(0, match.index) + "'1970-01-01T00:00:00.000Z'" + text.slice(match.index + match[0].length);
      searchFrom = match.index + 1;
    }
  }

  // -- 7. Site-reviews URL normalisation: split_part / regexp_replace ---
  // These are the only split_part / regexp_replace uses in the app
  // (site-reviews-db.js normalises a social URL before comparing it).
  //   split_part(X, DELIM, 1) -> text before the first DELIM (or all of X).
  //   regexp_replace(X, '^https://www[.]', 'https://', 'i')
  //     -> strip a www. prefix, case-insensitively.
  //   regexp_replace(X, '/+$', '') -> rtrim(X, '/').
  // Innermost call first (the last occurrence in the text), so nested
  // calls resolve from the inside out. Any other shape throws.
  text = translateSplitPart(text);
  text = translateRegexpReplace(text);

  // -- 8. Whitespace-collapsing REGEXP_REPLACE ---------------------------
  // BTRIM(REGEXP_REPLACE(E, WS, ' ', 'g')) -> trim(E, <whitespace chars>):
  // collapsing every whitespace run to one space and then trimming spaces
  // is exactly "E has a non-whitespace character". The bare form
  // REGEXP_REPLACE(E, WS, ' ', 'g') -> E: the only bare uses feed a
  // description that JS collapses with cleanText() afterwards
  // (prompts-db.js getTrendingPromptsByIds), so dropping the SQL-side
  // collapse changes nothing downstream. Any other pattern throws.
  text = translateWhitespaceRegexpReplace(text);

  // -- 9. LEFT(X, n) -> substr(X, 1, n) ----------------------------------
  text = translateLeft(text);

  // -- 10. JSONB_AGG / ARRAY_AGG -> NULLIF(json_group_array(...), '[]') --
  // Postgres' aggregate returns NULL over zero rows; SQLite's
  // json_group_array returns '[]', which would defeat the COALESCE
  // fallbacks (e.g. to the legacy p.categories column). NULLIF restores
  // the NULL. A trailing FILTER clause stays attached to the aggregate.
  text = translateJsonAggregates(text);

  // -- 11. Small function/operator renames --------------------------------
  {
    let code = maskSql(text);
    text = replaceInCode(text, code, /\bjsonb_typeof\s*\(/gi, () => 'json_type(');
    code = maskSql(text);
    text = replaceInCode(text, code, /\boctet_length\s*\(/gi, () => 'length(');
    code = maskSql(text);
    text = replaceInCode(text, code, /\bBTRIM\s*\(/gi, () => 'trim(');
    code = maskSql(text);
    // ->> '0' / -> '0' (quoted digit key) -> ->> 0 / -> 0. Postgres
    // coerces a digit key to an array index, but SQLite's ->/->> only
    // does that for an INTEGER key: with a text key on an array, newer
    // SQLite returns NULL (3.53 does; 3.45 still coerced). Every
    // digit-key site in this codebase addresses a JSON array
    // (image_alt_texts ->> '0'), so the integer form is the faithful
    // one. Non-numeric keys ('slug', 'social_url', ...) are object
    // keys and are left alone.
    text = replaceInCode(text, code, /(->>?)\s*'(\d+)'/g, (m) => `${m[1]} ${m[2]}`);
    code = maskSql(text);
    // to_jsonb(site_reviews)->>'col' is just the column itself.
    text = replaceInCode(text, code, /to_jsonb\(\s*[\w.]+\s*\)\s*->>\s*'([^']+)'/gi, (m) => m[1]);
    code = maskSql(text);
    // Postgres "C" collation is byte order; SQLite's BINARY is the same.
    text = replaceInCode(text, code, /COLLATE\s+"C"/gi, () => 'COLLATE BINARY');
    code = maskSql(text);
    // Schema-qualified public.* tables: D1 has no schemas; the D1 schema
    // holds them unqualified (site_reviews, ...).
    text = replaceInCode(text, code, /\bpublic\./gi, () => '');
    code = maskSql(text);
    // information_schema probe (categories-db.js) -> pragma_table_info.
    text = replaceInCode(
      text,
      code,
      /SELECT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+information_schema\.columns\s+WHERE\s+table_schema\s*=\s*'public'\s+AND\s+table_name\s*=\s*'categories'\s+AND\s+column_name\s*=\s*'library_type'\s*\)\s+AS\s+supported/gi,
      () => "SELECT EXISTS (SELECT 1 FROM pragma_table_info('categories') WHERE name = 'library_type') AS supported",
    );
  }

  // -- 12. FOR UPDATE / FOR SHARE -> removed ------------------------------
  // Single-writer SQLite + D1 batch atomicity make row locks unnecessary,
  // and the old code already ran them as no-ops on the Neon HTTP driver.
  {
    const re = /\s+FOR\s+(UPDATE|SHARE)(\s+OF\s+[\w".]+)?/gi;
    text = replaceInCode(text, maskSql(text), re, () => '');
  }

  // -- 13. ILIKE -> LIKE ---------------------------------------------------
  // SQLite LIKE is case-insensitive for ASCII by default, which is what
  // the app's searches rely on. Non-ASCII case folding differs from
  // Postgres ILIKE (e.g. 'Ä' vs 'ä'); search terms here are ASCII.
  {
    const re = /\bILIKE\b/gi;
    text = replaceInCode(text, maskSql(text), re, () => 'LIKE');
  }

  // -- 14. expr ~* '\y(a|b|c)\y' -> word-boundary GLOBs -------------------
  // D1 has no REGEXP. The single ~* site (sitemap adult-context flag)
  // matches whole words; translateRegexMatch() covers the four word
  // positions with GLOB character classes (see that function).
  text = translateRegexMatch(text);

  // -- 15. md5(id || ':' || seed) -> deterministic seeded hash -----------
  // SQLite has no md5(). The seeded "random" orderings need a
  // deterministic per-seed shuffle: the same seed must always give the
  // same order, and a different seed (even an adjacent one) must give a
  // genuinely different order — the weekly cron and the sort=random pages
  // rely on that ("a different seed picks a different set").
  // A plain additive seed, ((id * K + seed) % M), fails the second part:
  // it only rotates one fixed cyclic order (a uniform shift preserves
  // relative order except for wraps). A multiplier that is itself a
  // Knuth-mix of the seed re-permutes instead: the seed is reduced mod M,
  // multiplied by the Knuth constant (which spreads adjacent seeds
  // across the whole range), and folded into an odd multiplier, so
  // (id * K(seed)) % M is a different permutation for each seed.
  // Bounds: the seed arrives as a JS safe integer (up to 2^53, from
  // Math.random() * MAX_SAFE_INTEGER); abs(seed % M) * 2654435761 stays
  // under 2^63, and id * K stays under 2^63 for any realistic id, so
  // SQLite's 64-bit integer arithmetic never overflows. One seed residue
  // in ~2.1 billion makes K a multiple of M (all values tie at 0 and the
  // order falls back to row order); that is benign and not worth a CASE.
  {
    const re = /md5\(\s*([\w.]+)\.id::text\s*\|\|\s*':'\s*\|\|\s*\$(\d+)::text\s*\)/gi;
    text = replaceInCode(text, maskSql(text), re, (m) => `((${m[1]}.id * (2654435761 + ((abs($${m[2]} % 2147483647) * 2654435761) % 2147483647) * 2)) % 2147483647)`);
  }

  // -- 16. ::type casts -> removed -----------------------------------------
  // SQLite is dynamically typed; the values keep their JS types. Casts are
  // stripped textually, so '[]'::jsonb -> '[]', COUNT(*)::int -> COUNT(*),
  // $1::bigint[] -> $1 (the array itself is expanded in phase B).
  // ::numeric is deliberately NOT stripped here: the only numeric casts in
  // the app are the AVG(...)::numeric(3, 2)::text shapes handled in step 1.
  // Any other ::numeric (which rounds its value) must throw in the guards
  // below instead of silently changing precision.
  {
    const re = /::(?!numeric\b)[A-Za-z_][A-Za-z0-9_]*(\s*\([^()]*\))?(\[\])?/g;
    let previous;
    do {
      previous = text;
      text = replaceInCode(text, maskSql(text), re, () => '');
    } while (text !== previous);
  }

  // -- 17. Guards: anything left that has no SQLite form throws. ---------
  {
    const code = maskSql(text);
    const guard = (pattern, label) => {
      const hit = replaceInCode(text, code, pattern, () => '\u0000');
      if (hit !== text) {
        throw new PgToD1Error(`No SQLite equivalent for ${label} in: ${sql.trim().slice(0, 200)}`);
      }
    };
    guard(/::[A-Za-z_]/g, 'a leftover :: cast');
    guard(/\bjsonb_to_recordset\s*\(/gi, 'jsonb_to_recordset (rewrite the call site in JS)');
    guard(/\bjsonb_array_elements_text\s*\(/gi, 'jsonb_array_elements_text (rewrite the call site in JS)');
    guard(/\bUNNEST\s*\(/gi, 'UNNEST (rewrite the call site in JS)');
    guard(/\bARRAY\s*\[/gi, 'a Postgres ARRAY[...] literal');
    guard(/\bDISTINCT\s+ON\b/gi, 'DISTINCT ON');
    guard(/\bpg_advisory_[a-z_]+\s*\(/gi, 'pg_advisory_* lock');
    guard(/\bgen_random_uuid\s*\(/gi, 'gen_random_uuid (generate the UUID in JS)');
    guard(/\bdate_trunc\s*\(/gi, 'date_trunc');
    guard(/\bto_char\s*\(/gi, 'to_char');
    guard(/\binformation_schema\b/gi, 'information_schema');
    guard(/::numeric/gi, '::numeric cast (only the AVG(...)::numeric(3, 2)::text shape is translated)');
    guard(/\bREGEXP_REPLACE\s*\(/gi, 'REGEXP_REPLACE (only whitespace-collapse shapes are translated)');
    guard(/\bregexp_replace\s*\(/gi, 'regexp_replace (only the site-reviews shapes are translated)');
    guard(/\bsplit_part\s*\(/gi, 'split_part (only the field-1 shape is translated)');
    guard(/~[*~]/g, '~* / ~ regex match (only the \\y(a|b)\\y shape is translated)');
  }

  return text;
}

function applyDdlTranslations(sql) {
  let text = sql;
  const apply = (re, replacer) => {
    text = replaceInCode(text, maskSql(text), re, replacer);
  };
  // Array column with an empty-array default: Postgres '{}' is an array
  // literal; the D1 column holds JSON text, so the default is '[]'.
  apply(/(\b\w+)\s+\w+\[\]\s+DEFAULT '\{\}'/gi, (m) => `${m[1]} TEXT DEFAULT '[]'`);
  apply(/\bSERIAL\s+PRIMARY\s+KEY\b/gi, () => 'INTEGER PRIMARY KEY AUTOINCREMENT');
  apply(/\bSERIAL\b/gi, () => 'INTEGER');
  apply(/\bTIMESTAMPTZ\b/gi, () => 'TEXT');
  apply(/\bJSONB\b/gi, () => 'TEXT');
  apply(/\b\w+\[\]/g, () => 'TEXT');
  apply(/\bDEFAULT NOW\(\)/gi, () => `DEFAULT (${ISO_NOW})`);
  apply(/\bADD COLUMN IF NOT EXISTS\b/gi, () => 'ADD COLUMN');
  return text;
}

// -- split_part(X, DELIM, 1) ----------------------------------------------
function translateSplitPart(sql) {
  let text = sql;
  for (;;) {
    const code = maskSql(text);
    const re = /\bsplit_part\s*\(/gi;
    let last = null;
    let match;
    re.lastIndex = 0;
    while ((match = re.exec(text)) !== null) {
      let inCode = true;
      for (let j = match.index; j < match.index + match[0].length; j += 1) {
        if (!isCodeAt(code, j)) { inCode = false; break; }
      }
      if (inCode) last = match;
    }
    if (!last) return text;
    const callStart = last.index;
    const openIndex = text.indexOf('(', callStart);
    const closeIndex = matchingCloseParen(text, code, openIndex);
    if (closeIndex === -1) throw new PgToD1Error(`Unbalanced split_part( in: ${sql.trim().slice(0, 200)}`);
    const args = splitTopLevelArgs(text, code, openIndex, closeIndex);
    if (args.length !== 3) throw new PgToD1Error(`split_part needs 3 arguments in: ${sql.trim().slice(0, 200)}`);
    const field = sliceTrimmed(text, args[2].from, args[2].to);
    if (field !== '1') throw new PgToD1Error(`Only split_part(..., 1) is translated, got field ${field} in: ${sql.trim().slice(0, 200)}`);
    const value = sliceTrimmed(text, args[0].from, args[0].to);
    const delim = sliceTrimmed(text, args[1].from, args[1].to);
    const replacement = `(CASE WHEN instr(${value}, ${delim}) > 0 THEN substr(${value}, 1, instr(${value}, ${delim}) - 1) ELSE ${value} END)`;
    text = text.slice(0, callStart) + replacement + text.slice(closeIndex + 1);
  }
}

// -- regexp_replace (site-reviews shapes) -----------------------------------
function translateRegexpReplace(sql) {
  let text = sql;
  for (;;) {
    const code = maskSql(text);
    const re = /\bregexp_replace\s*\(/gi;
    let last = null;
    let match;
    re.lastIndex = 0;
    while ((match = re.exec(text)) !== null) {
      let inCode = true;
      for (let j = match.index; j < match.index + match[0].length; j += 1) {
        if (!isCodeAt(code, j)) { inCode = false; break; }
      }
      // Lowercase only: the prompts-db whitespace-collapse calls spell it
      // REGEXP_REPLACE and belong to translateWhitespaceRegexpReplace.
      if (inCode && match[0].startsWith('regexp_replace')) last = match;
    }
    if (!last) return text;
    const callStart = last.index;
    const openIndex = text.indexOf('(', callStart);
    const closeIndex = matchingCloseParen(text, code, openIndex);
    if (closeIndex === -1) throw new PgToD1Error(`Unbalanced regexp_replace( in: ${sql.trim().slice(0, 200)}`);
    const args = splitTopLevelArgs(text, code, openIndex, closeIndex);
    if (args.length !== 3 && args.length !== 4) throw new PgToD1Error(`regexp_replace needs 3 or 4 arguments in: ${sql.trim().slice(0, 200)}`);
    const value = sliceTrimmed(text, args[0].from, args[0].to);
    const pattern = unquoteLiteral(sliceTrimmed(text, args[1].from, args[1].to));
    const replacement = unquoteLiteral(sliceTrimmed(text, args[2].from, args[2].to));
    const flags = args.length === 4 ? unquoteLiteral(sliceTrimmed(text, args[3].from, args[3].to)) : '';
    let out;
    if (pattern === '^https://www[.]' && replacement === 'https://' && flags === 'i') {
      out = `(CASE WHEN lower(substr(${value}, 1, 12)) = 'https://www.' THEN 'https://' || substr(${value}, 13) ELSE ${value} END)`;
    } else if (pattern === '/+$' && replacement === '') {
      out = `rtrim(${value}, '/')`;
    } else {
      throw new PgToD1Error(`No SQLite equivalent for regexp_replace pattern '${pattern}' in: ${sql.trim().slice(0, 200)}`);
    }
    text = text.slice(0, callStart) + out + text.slice(closeIndex + 1);
  }
}

// -- BTRIM(REGEXP_REPLACE(E, WS, ' ', 'g')) and bare REGEXP_REPLACE ------
function isWhitespaceCollapsePattern(pattern, replacement, flags) {
  return (
    (pattern === '[[:space:]]+' || pattern === '\\s+')
    && replacement === ' '
    && flags === 'g'
  );
}

function translateWhitespaceRegexpReplace(sql) {
  let text = sql;
  // Combined form first: BTRIM(REGEXP_REPLACE(E, WS, ' ', 'g')).
  for (;;) {
    const code = maskSql(text);
    const re = /\bBTRIM\s*\(\s*REGEXP_REPLACE\s*\(/gi;
    let found = null;
    let match;
    re.lastIndex = 0;
    while ((match = re.exec(text)) !== null) {
      let inCode = true;
      for (let j = match.index; j < match.index + match[0].length; j += 1) {
        if (!isCodeAt(code, j)) { inCode = false; break; }
      }
      // Uppercase only: the site-reviews calls spell it regexp_replace
      // and were already handled by translateRegexpReplace.
      if (inCode && match[0].includes('REGEXP_REPLACE')) { found = match; break; }
    }
    if (!found) break;
    const btrimStart = found.index;
    const regexpOpen = text.indexOf('(', text.indexOf('REGEXP_REPLACE', btrimStart));
    const regexpClose = matchingCloseParen(text, code, regexpOpen);
    if (regexpClose === -1) throw new PgToD1Error(`Unbalanced REGEXP_REPLACE( in: ${sql.trim().slice(0, 200)}`);
    const args = splitTopLevelArgs(text, code, regexpOpen, regexpClose);
    if (args.length !== 3 && args.length !== 4) throw new PgToD1Error(`REGEXP_REPLACE needs 3 or 4 arguments in: ${sql.trim().slice(0, 200)}`);
    const pattern = unquoteLiteral(sliceTrimmed(text, args[1].from, args[1].to));
    const replacement = unquoteLiteral(sliceTrimmed(text, args[2].from, args[2].to));
    const flags = args.length === 4 ? unquoteLiteral(sliceTrimmed(text, args[3].from, args[3].to)) : '';
    if (!isWhitespaceCollapsePattern(pattern, replacement, flags)) {
      throw new PgToD1Error(`No SQLite equivalent for REGEXP_REPLACE pattern '${pattern}' in: ${sql.trim().slice(0, 200)}`);
    }
    const value = sliceTrimmed(text, args[0].from, args[0].to);
    const btrimClose = matchingCloseParen(text, code, text.indexOf('(', btrimStart));
    if (btrimClose === -1) throw new PgToD1Error(`Unbalanced BTRIM( in: ${sql.trim().slice(0, 200)}`);
    text = text.slice(0, btrimStart)
      + `trim(${value}, char(9, 10, 11, 12, 13, 32))`
      + text.slice(btrimClose + 1);
  }
  // Bare form: REGEXP_REPLACE(E, WS, ' ', 'g') -> E (see step 8 note).
  for (;;) {
    const code = maskSql(text);
    const re = /\bREGEXP_REPLACE\s*\(/gi;
    let found = null;
    let match;
    re.lastIndex = 0;
    while ((match = re.exec(text)) !== null) {
      let inCode = true;
      for (let j = match.index; j < match.index + match[0].length; j += 1) {
        if (!isCodeAt(code, j)) { inCode = false; break; }
      }
      // Uppercase only (see the BTRIM loop above).
      if (inCode && match[0].startsWith('REGEXP_REPLACE')) { found = match; break; }
    }
    if (!found) return text;
    const callStart = found.index;
    const openIndex = text.indexOf('(', callStart);
    const closeIndex = matchingCloseParen(text, code, openIndex);
    if (closeIndex === -1) throw new PgToD1Error(`Unbalanced REGEXP_REPLACE( in: ${sql.trim().slice(0, 200)}`);
    const args = splitTopLevelArgs(text, code, openIndex, closeIndex);
    if (args.length !== 3 && args.length !== 4) throw new PgToD1Error(`REGEXP_REPLACE needs 3 or 4 arguments in: ${sql.trim().slice(0, 200)}`);
    const pattern = unquoteLiteral(sliceTrimmed(text, args[1].from, args[1].to));
    const replacement = unquoteLiteral(sliceTrimmed(text, args[2].from, args[2].to));
    const flags = args.length === 4 ? unquoteLiteral(sliceTrimmed(text, args[3].from, args[3].to)) : '';
    if (!isWhitespaceCollapsePattern(pattern, replacement, flags)) {
      throw new PgToD1Error(`No SQLite equivalent for REGEXP_REPLACE pattern '${pattern}' in: ${sql.trim().slice(0, 200)}`);
    }
    const value = sliceTrimmed(text, args[0].from, args[0].to);
    text = text.slice(0, callStart) + value + text.slice(closeIndex + 1);
  }
}

// -- LEFT(X, n) -> substr(X, 1, n) ------------------------------------------
function translateLeft(sql) {
  let text = sql;
  for (;;) {
    const code = maskSql(text);
    const re = /\bLEFT\s*\(/gi;
    let found = null;
    let match;
    re.lastIndex = 0;
    while ((match = re.exec(text)) !== null) {
      let inCode = true;
      for (let j = match.index; j < match.index + match[0].length; j += 1) {
        if (!isCodeAt(code, j)) { inCode = false; break; }
      }
      if (inCode) { found = match; break; }
    }
    if (!found) return text;
    const callStart = found.index;
    const openIndex = text.indexOf('(', callStart);
    const closeIndex = matchingCloseParen(text, code, openIndex);
    if (closeIndex === -1) throw new PgToD1Error(`Unbalanced LEFT( in: ${sql.trim().slice(0, 200)}`);
    const comma = firstTopLevelComma(text, code, openIndex, closeIndex);
    if (comma === -1) throw new PgToD1Error(`LEFT( needs 2 arguments in: ${sql.trim().slice(0, 200)}`);
    text = text.slice(0, callStart) + 'substr(' + text.slice(openIndex + 1, comma + 1) + ' 1,' + text.slice(comma + 1);
  }
}

// -- JSONB_AGG / ARRAY_AGG -> NULLIF(json_group_array(...), '[]') ----------
function translateJsonAggregates(sql) {
  let text = sql;
  for (;;) {
    const code = maskSql(text);
    const re = /\b(JSONB_AGG|ARRAY_AGG)\s*\(/gi;
    let found = null;
    let match;
    re.lastIndex = 0;
    while ((match = re.exec(text)) !== null) {
      let inCode = true;
      for (let j = match.index; j < match.index + match[0].length; j += 1) {
        if (!isCodeAt(code, j)) { inCode = false; break; }
      }
      if (inCode) { found = match; break; }
    }
    if (!found) return text;
    const callStart = found.index;
    const openIndex = text.indexOf('(', callStart);
    const closeIndex = matchingCloseParen(text, code, openIndex);
    if (closeIndex === -1) throw new PgToD1Error(`Unbalanced aggregate call in: ${sql.trim().slice(0, 200)}`);
    const inner = text.slice(openIndex + 1, closeIndex);
    // A trailing FILTER (...) clause belongs to the aggregate, so it must
    // sit inside the NULLIF, after the aggregate's own closing paren.
    let end = closeIndex + 1;
    let filterPart = '';
    const rest = text.slice(end);
    const filterMatch = rest.match(/^\s*FILTER\s*\(/i);
    if (filterMatch) {
      const filterOpen = end + rest.indexOf('(');
      const filterClose = matchingCloseParen(text, maskSql(text), filterOpen);
      if (filterClose === -1) throw new PgToD1Error(`Unbalanced FILTER( in: ${sql.trim().slice(0, 200)}`);
      filterPart = text.slice(end, filterClose + 1);
      end = filterClose + 1;
    }
    text = text.slice(0, callStart)
      + `NULLIF(json_group_array(${inner})${filterPart}, '[]')`
      + text.slice(end);
  }
}

// -- expr ~* '\y(a|b|c)\y' -> word-boundary GLOBs ---------------------------
// D1 has no REGEXP. The single ~* site (sitemap adult-context flag)
// matches whole words, so it becomes GLOBs over the lowercased text.
// GLOB is case-sensitive, so lower() is applied, and its [^...] class
// expresses "a non-word character" directly — no punctuation
// normalisation is needed, and the expression stays flat: a chain of
// nested replace() calls overflows SQLite's parser stack (it fails at
// ~31 nested calls in 3.45.1), so normalisation is not an option here.
// A word occurrence has four shapes, and all four are covered:
//   *[^a-z0-9_]word[^a-z0-9_]*  (word in the middle)
//   word[^a-z0-9_]*             (word at the start)
//   *[^a-z0-9_]word             (word at the end)
//   lower(expr) = 'word'        (the whole text is the word)
// Underscore is a word character in Postgres \y, so it stays inside the
// [a-z0-9_] class: 'man' does not match 'man_made' or 'woman'.
// Non-ASCII letters (e.g. 'Ä') are non-word characters in both Postgres
// \y and this class, so they count as boundaries in both.
function translateRegexMatch(sql) {
  let text = sql;
  for (;;) {
    const code = maskSql(text);
    // Find a ~* in code.
    let opIndex = -1;
    for (let i = 0; i + 1 < text.length; i += 1) {
      if (text[i] === '~' && text[i + 1] === '*' && isCodeAt(code, i) && isCodeAt(code, i + 1)) {
        opIndex = i;
        break;
      }
    }
    if (opIndex === -1) return text;
    // Left operand: the parenthesised expression immediately before ~*.
    let j = opIndex - 1;
    while (j >= 0 && /\s/.test(text[j])) j -= 1;
    if (text[j] !== ')') throw new PgToD1Error(`~* left operand must be a parenthesised expression in: ${sql.trim().slice(0, 200)}`);
    const closeIndex = j;
    let depth = 0;
    let openIndex = -1;
    for (let k = closeIndex; k >= 0; k -= 1) {
      if (!isCodeAt(code, k)) continue;
      if (text[k] === ')') depth += 1;
      else if (text[k] === '(') {
        depth -= 1;
        if (depth === 0) { openIndex = k; break; }
      }
    }
    if (openIndex === -1) throw new PgToD1Error(`Unbalanced parens before ~* in: ${sql.trim().slice(0, 200)}`);
    const leftExpr = text.slice(openIndex, closeIndex + 1);
    // Right operand: the quoted pattern after ~*.
    let k = opIndex + 2;
    while (k < text.length && /\s/.test(text[k])) k += 1;
    if (text[k] !== "'") throw new PgToD1Error(`~* pattern must be a string literal in: ${sql.trim().slice(0, 200)}`);
    let end = k + 1;
    while (end < text.length) {
      if (text[end] === "'") {
        if (text[end + 1] === "'") { end += 2; continue; }
        end += 1;
        break;
      }
      end += 1;
    }
    const pattern = unquoteLiteral(text.slice(k, end));
    const wordMatch = pattern.match(/^\\y\(([^)]*)\)\\y$/);
    if (!wordMatch) {
      throw new PgToD1Error(`Only the \\y(a|b|...)\\y shape of ~* is translated, got '${pattern}' in: ${sql.trim().slice(0, 200)}`);
    }
    const words = wordMatch[1].split('|');
    if (words.length === 0 || words.some((word) => !/^[A-Za-z0-9]+$/.test(word))) {
      throw new PgToD1Error(`~* alternatives must be plain ASCII words in: ${sql.trim().slice(0, 200)}`);
    }
    const lowered = `lower(${leftExpr})`;
    const cases = words.flatMap((word) => {
      const w = word.toLowerCase();
      return [
        `(${lowered} GLOB '*[^a-z0-9_]${w}[^a-z0-9_]*')`,
        `(${lowered} GLOB '${w}[^a-z0-9_]*')`,
        `(${lowered} GLOB '*[^a-z0-9_]${w}')`,
        `(${lowered} = '${w}')`,
      ];
    });
    text = text.slice(0, openIndex) + `(${cases.join(' OR ')})` + text.slice(end);
  }
}

// ---------------------------------------------------------------------------
// Phase B: $n -> ? with array expansion for ANY / ALL / ?|.
// ---------------------------------------------------------------------------

function translatePlaceholders(sql, values) {
  const code = maskSql(sql);
  let outText = '';
  let skipCloseParen = false;
  const outValues = [];
  let pendingQBar = null; // { leftStart, left } once `?|` has been seen
  let i = 0;
  const n = sql.length;
  while (i < n) {
    if (!isCodeAt(code, i)) {
      // Literal / comment / quoted ident: copy verbatim.
      outText += sql[i];
      i += 1;
      continue;
    }
    const ch = sql[i];
    // Skip the close paren of an ANY/ALL call we already expanded.
    if (ch === ')' && skipCloseParen) {
      skipCloseParen = false;
      i += 1;
      continue;
    }
    // jsonb ?| operator: remember where its left operand starts; the
    // expansion happens when the array placeholder arrives.
    if (ch === '?' && sql[i + 1] === '|') {
      const left = outText.match(/([A-Za-z_][A-Za-z0-9_.]*)\s*$/);
      if (!left) throw new PgToD1Error(`Could not find the left operand of ?| in: ${sql.trim().slice(0, 200)}`);
      pendingQBar = { leftStart: outText.length - left[0].length, left: left[1] };
      i += 2;
      continue;
    }
    if (ch === '?') {
      throw new PgToD1Error(`Bare ? operator has no SQLite equivalent in: ${sql.trim().slice(0, 200)}`);
    }
    // $n placeholder.
    if (ch === '$' && /[0-9]/.test(sql[i + 1] || '')) {
      let j = i + 1;
      while (j < n && /[0-9]/.test(sql[j])) j += 1;
      const paramNumber = Number(sql.slice(i + 1, j));
      if (!Number.isSafeInteger(paramNumber) || paramNumber < 1 || paramNumber > values.length) {
        throw new PgToD1Error(`Placeholder $${paramNumber} has no bound value in: ${sql.trim().slice(0, 200)}`);
      }
      const value = values[paramNumber - 1];
      // col = ANY($n) -> col IN (?, ?, ...) (empty array -> 1=0, because
      // IN () is a syntax error in SQLite and ANY over an empty set is
      // false). The trailing ) closing ANY( is skipped below.
      const anyMatch = outText.match(/([A-Za-z_][A-Za-z0-9_."]*)\s*=\s*ANY\s*\($/i);
      if (anyMatch) {
        // Postgres: = ANY(NULL) is NULL (no rows); = ANY('{}') is false.
        // Both exclude the row, so a null value becomes 1=0, while an
        // empty array also becomes 1=0 (IN () is a syntax error).
        if (value == null) {
          outText = `${outText.slice(0, anyMatch.index)}1=0`;
          skipCloseParen = true;
          i = j;
          continue;
        }
        if (!Array.isArray(value)) throw new PgToD1Error(`Expected an array value for $${paramNumber} (= ANY expansion)`);
        const head = outText.slice(0, anyMatch.index);
        if (value.length === 0) {
          outText = `${head}1=0`;
        } else {
          outText = `${head}${anyMatch[1]} IN (${value.map(() => '?').join(', ')})`;
          for (const item of value) outValues.push(item);
        }
        skipCloseParen = true;
        i = j;
        continue;
      }
      // col <> ALL($n) -> col NOT IN (?, ?, ...) (empty array -> 1=1).
      const allMatch = outText.match(/([A-Za-z_][A-Za-z0-9_."]*)\s*<>\s*ALL\s*\($/i);
      if (allMatch) {
        // Postgres: <> ALL(NULL) is NULL (no rows), unlike <> ALL('{}')
        // which is vacuously true — so a null value becomes 1=0 here,
        // while an empty array becomes 1=1.
        if (value == null) {
          outText = `${outText.slice(0, allMatch.index)}1=0`;
          skipCloseParen = true;
          i = j;
          continue;
        }
        if (!Array.isArray(value)) throw new PgToD1Error(`Expected an array value for $${paramNumber} (<> ALL expansion)`);
        const head = outText.slice(0, allMatch.index);
        if (value.length === 0) {
          outText = `${head}1=1`;
        } else {
          outText = `${head}${allMatch[1]} NOT IN (${value.map(() => '?').join(', ')})`;
          for (const item of value) outValues.push(item);
        }
        skipCloseParen = true;
        i = j;
        continue;
      }
      // col ?| $n -> EXISTS (SELECT 1 FROM json_each(col) WHERE value IN
      // (...)). The `?|` itself was never emitted, so truncate the output
      // back to where the column started.
      if (pendingQBar) {
        // Postgres: tags ?| NULL is NULL (no rows), like ?| over an
        // empty array — both become 1=0.
        if (value == null) {
          outText = `${outText.slice(0, pendingQBar.leftStart)}1=0`;
          pendingQBar = null;
          i = j;
          continue;
        }
        if (!Array.isArray(value)) throw new PgToD1Error(`Expected an array value for $${paramNumber} (?| expansion)`);
        const { leftStart, left } = pendingQBar;
        pendingQBar = null;
        if (value.length === 0) {
          outText = `${outText.slice(0, leftStart)}1=0`;
        } else {
          outText = `${outText.slice(0, leftStart)}EXISTS (SELECT 1 FROM json_each(${left}) WHERE value IN (${value.map(() => '?').join(', ')}))`;
          for (const item of value) outValues.push(item);
        }
        i = j;
        continue;
      }
      // Plain placeholder: one ? per occurrence (the same $n may appear
      // several times; each ? gets its own copy of the value).
      outText += '?';
      outValues.push(value);
      // LIKE patterns built with backslash escapes (escapeLikePattern in
      // prompts-db.js) need an explicit ESCAPE clause: SQLite LIKE has
      // no default escape character, unlike Postgres.
      if (typeof value === 'string' && value.includes('\\') && /\bLIKE\s*$/i.test(outText.slice(0, -1))) {
        outText += " ESCAPE '\\'";
      }
      i = j;
      continue;
    }
    outText += ch;
    i += 1;
  }
  if (pendingQBar) {
    throw new PgToD1Error(`?| without a following placeholder in: ${sql.trim().slice(0, 200)}`);
  }
  // Guards: array operators that never got a placeholder (e.g. comparing
  // against a CTE column) have no SQLite form here.
  const tailCode = maskSql(outText);
  for (const [pattern, label] of [
    [/=\s*ANY\s*\(/gi, '= ANY(...)'],
    [/ <>\s*ALL\s*\(/gi, '<> ALL(...)'],
    [/\?\|/g, '?|'],
  ]) {
    const hit = replaceInCode(outText, tailCode, pattern, () => '\u0000');
    if (hit !== outText) {
      throw new PgToD1Error(`No SQLite equivalent for ${label} in: ${sql.trim().slice(0, 200)}`);
    }
  }
  return { sql: outText, values: outValues };
}

// ---------------------------------------------------------------------------
// Public entry point.
// ---------------------------------------------------------------------------

export function translatePostgresToSqlite(text, values = []) {
  if (typeof text !== 'string') {
    throw new PgToD1Error('Database query requires a SQL text string.');
  }
  const params = Array.isArray(values) ? values : [];
  // Advisory lock probe (admin-users-db.js): a no-op on D1, as it was on
  // the Neon HTTP driver. Its single bound value is dropped.
  if (/^\s*SELECT\s+pg_advisory_xact_lock\s*\(/i.test(text)) {
    return { sql: 'SELECT 1', values: [] };
  }
  const rewritten = applyPhaseA(text);
  const expanded = translatePlaceholders(rewritten, params);
  // D1 prepare() takes one statement; drop a trailing semicolon.
  let sql = expanded.sql.trimEnd();
  if (sql.endsWith(';')) sql = sql.slice(0, -1).trimEnd();
  return { sql, values: expanded.values };
}

// Statement shapes the generic translator cannot handle (data-modifying
// CTEs — SQLite has no data-modifying CTEs). db.js implements these with
// sequential D1 statements; the detectors live here so both modules agree
// on what counts as a match.
export function isBrokerStoreCte(sql) {
  return /WITH\s+expired_tokens\s+AS\s*\(\s*DELETE\s+FROM\s+mcp_oauth_broker_tokens/i.test(sql)
    && /INSERT\s+INTO\s+mcp_oauth_broker_tokens/i.test(sql);
}

export function isBrokerRotateCte(sql) {
  return /WITH\s+consumed\s+AS\s*\(\s*DELETE\s+FROM\s+mcp_oauth_broker_refresh_tokens/i.test(sql)
    && /INSERT\s+INTO\s+mcp_oauth_broker_tokens/i.test(sql);
}

export function isPasswordResetCte(sql) {
  return /WITH\s+updated_user\s+AS\s*\(\s*UPDATE\s+users/i.test(sql)
    && /invalidated_tokens\s+AS\s*\(\s*UPDATE\s+password_reset_tokens/i.test(sql);
}
