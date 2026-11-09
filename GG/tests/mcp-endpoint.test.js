import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { getDatabaseUrl, isBuildPhase } from '../src/lib/db.js';
import { POST } from '../app/api/mcp/route.js';
import {
  createDraft,
  updateDraft,
} from '../src/lib/mcp-prompt-tools.js';
import { handleMcpProtocolRequest } from '../src/lib/mcp-server.js';

const queries = [];
let originalDatabaseUrl;
let originalPostgresUrl;
let originalPrismaUrl;
let originalPool;
let originalMcpKey;
let currentPromptStatus = 'draft';

const textPrompt = {
  id: 41,
  title: 'Useful writing prompt',
  prompt: 'Write a clear and useful response for the requested audience.',
  slug: 'useful-writing-prompt',
  status: 'draft',
  category: 'Writing',
  categories: ['Writing'],
  primaryCategoryId: 1,
  categoryIds: [1],
  tags: ['writing'],
  intro: 'A concise description.',
  useCase: 'Drafting',
};
const photoPrompt = {
  ...textPrompt,
  image: 'https://media.public.blob.vercel-storage.com/prompt.webp',
  images: ['https://media.public.blob.vercel-storage.com/prompt.webp'],
  imageAltTexts: { 0: 'Prompt preview image' },
  ogImage: '',
  relatedPromptIds: [],
  recommendedAspectRatio: '',
  aspectRatioReason: '',
  reviewedAt: null,
  generationTested: false,
  generationTestedDate: null,
  generationTestedTool: '',
  uniqueFeature: '',
  bestUseCase: '',
};

function mockResult(sql, values) {
  if (/SELECT image, images, og_image AS "ogImage"/i.test(sql)) {
    return { rows: [{ image: photoPrompt.image, images: photoPrompt.images, ogImage: '' }] };
  }
  if (/SELECT id, name FROM categories/i.test(sql)) {
    return { rows: [{ id: 1, name: 'Writing' }] };
  }
  if (/SELECT\s+p\.id/i.test(sql) && /library_type = 'text'/i.test(sql)) {
    return currentPromptStatus === 'missing' ? { rows: [] } : { rows: [{ ...textPrompt, status: currentPromptStatus }] };
  }
  if (/SELECT\s+p\.id/i.test(sql) && /library_type = 'photo'/i.test(sql)) {
    return currentPromptStatus === 'missing' ? { rows: [] } : { rows: [{ ...photoPrompt, status: currentPromptStatus }] };
  }
  if (/INSERT INTO prompts/i.test(sql)) {
    return { rows: [{ id: 42, slug: values[2], status: values[8] }] };
  }
  if (/UPDATE prompts/i.test(sql) && /library_type = 'text'/i.test(sql)) {
    if (values[12] && values[12] !== currentPromptStatus) return { rows: [] };
    return { rows: [{ id: values[0], slug: values[3], status: values[9] }] };
  }
  if (/UPDATE prompts/i.test(sql) && /SET should_noindex/i.test(sql)) {
    return { rows: [], rowCount: 1 };
  }
  if (/UPDATE prompts/i.test(sql) && /library_type = 'photo'/i.test(sql)) {
    if (values[37] && values[37] !== currentPromptStatus) return { rows: [] };
    return { rows: [{ id: values[0], slug: values[3], status: values[14] }] };
  }
  if (/SELECT COUNT\(\*\)::int AS total FROM prompts/i.test(sql)) {
    return { rows: [{ total: 0 }] };
  }
  return { rows: [], rowCount: 0 };
}

before(() => {
  originalDatabaseUrl = process.env.DATABASE_URL;
  originalPostgresUrl = process.env.POSTGRES_URL;
  originalPrismaUrl = process.env.POSTGRES_PRISMA_URL;
  originalMcpKey = process.env.AQ_MCP_API_KEY;
  originalPool = globalThis.__dbPgPool;
  process.env.DATABASE_URL = 'postgres://localhost/unit_test';
  process.env.AQ_MCP_API_KEY = 'unit-test-mcp-key-that-is-long-enough-123';
  delete process.env.POSTGRES_URL;
  delete process.env.POSTGRES_PRISMA_URL;

  const client = {
    async query(query, values = []) {
      const sql = typeof query === 'string' ? query : query.text;
      queries.push({ sql, values });
      return mockResult(sql, values);
    },
    release() {},
  };
  globalThis.__dbPgPool = {
    ended: false,
    __dbConnectionString: getDatabaseUrl(),
    __dbPoolMax: isBuildPhase() ? 1 : 5,
    async connect() {
      return client;
    },
    async query(query, values = []) {
      const sql = typeof query === 'string' ? query : query.text;
      queries.push({ sql, values });
      return mockResult(sql, values);
    },
    async end() {},
  };
});

beforeEach(() => {
  queries.length = 0;
  currentPromptStatus = 'draft';
});

after(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalPostgresUrl === undefined) delete process.env.POSTGRES_URL;
  else process.env.POSTGRES_URL = originalPostgresUrl;
  if (originalPrismaUrl === undefined) delete process.env.POSTGRES_PRISMA_URL;
  else process.env.POSTGRES_PRISMA_URL = originalPrismaUrl;
  if (originalMcpKey === undefined) delete process.env.AQ_MCP_API_KEY;
  else process.env.AQ_MCP_API_KEY = originalMcpKey;
  if (originalPool === undefined) delete globalThis.__dbPgPool;
  else globalThis.__dbPgPool = originalPool;
});

test('MCP endpoint rejects unauthenticated and invalid bearer requests', async () => {
  const missing = await POST(new Request('https://www.aqprompts.com/api/mcp', { method: 'POST' }));
  assert.equal(missing.status, 401);

  const invalid = await POST(new Request('https://www.aqprompts.com/api/mcp', {
    method: 'POST',
    headers: { authorization: 'Bearer incorrect-test-key' },
  }));
  assert.equal(invalid.status, 401);
  assert.match(invalid.headers.get('www-authenticate'), /Bearer/);

  const apiKeyAttempt = await POST(new Request('https://www.aqprompts.com/api/mcp', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.AQ_MCP_API_KEY}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} }),
  }));
  assert.equal(apiKeyAttempt.status, 401);
  assert.match(apiKeyAttempt.headers.get('www-authenticate'), /Bearer/);
});

test('MCP tool input rejects invalid data and unknown tools', async () => {
  const invalidInputResponse = await handleMcpProtocolRequest(new Request('https://www.aqprompts.com/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'list_prompts', arguments: { library: 'other' } },
    }),
  }));
  assert.equal(invalidInputResponse.status, 200);
  const invalidOutput = await invalidInputResponse.json();
  assert.equal(invalidOutput.result?.isError, true);

  const unknownToolResponse = await handleMcpProtocolRequest(new Request('https://www.aqprompts.com/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'delete_prompt', arguments: { id: 41 } },
    }),
  }));
  const unknownOutput = await unknownToolResponse.json();
  assert.ok(unknownOutput.error || unknownOutput.result?.isError);
});

test('draft creation forces status to draft regardless of a supplied status field', async () => {
  const created = await createDraft({
    library: 'text',
    title: 'Useful writing prompt',
    prompt: textPrompt.prompt,
    primaryCategoryId: 1,
    categoryIds: [1],
    status: 'published',
  });

  const insert = queries.find(({ sql }) => /INSERT INTO prompts/i.test(sql));
  assert.equal(created.status, 'draft');
  assert.equal(insert.values[8], 'draft');
  assert.match(insert.sql, /library_type,[\s\S]*VALUES[\s\S]*'text',\s*\$11/i);
});

test('draft updates require current draft status in the update query', async () => {
  const updated = await updateDraft({
    library: 'text',
    id: 41,
    title: 'Updated writing prompt',
  });
  const update = queries.find(({ sql }) => /UPDATE prompts/i.test(sql));

  assert.equal(updated.status, 'draft');
  assert.match(update.sql, /AND status = \$13/);
  assert.equal(update.values[12], 'draft');
});

test('Photo draft updates use a conditional draft-status database update', async () => {
  await updateDraft({ library: 'photo', id: 41, title: 'Updated photo prompt' });
  const update = queries.find(({ sql }) => /UPDATE prompts/i.test(sql) && /library_type = 'photo'/i.test(sql));

  assert.match(update.sql, /AND status = \$37/);
  assert.equal(update.values[36], 'draft');
});

test('published prompts cannot be updated through MCP', async () => {
  currentPromptStatus = 'published';
  await assert.rejects(
    updateDraft({ library: 'text', id: 41, title: 'Changed published prompt' }),
    /Published prompts are read-only/,
  );
  assert.equal(queries.some(({ sql }) => /UPDATE prompts/i.test(sql)), false);

  await assert.rejects(
    updateDraft({ library: 'photo', id: 41, title: 'Changed published photo prompt' }),
    /Published prompts are read-only/,
  );
  assert.equal(queries.some(({ sql }) => /UPDATE prompts/i.test(sql)), false);
});
