import {
  adminPasswordHashMatches,
  hashAdminPassword,
} from '../src/lib/admin-password.js';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

let getPgPool;

async function main() {
  const email = normalizeEmail(process.argv[2]);
  const password = process.env.ADMIN_PASSWORD;

  if (!validateEmail(email)) {
    throw new Error('Pass a valid initial super-admin email as the first argument.');
  }
  if (!password) {
    throw new Error('ADMIN_PASSWORD is not configured.');
  }

  const paddleStore = await import('../src/lib/db.js');
  getPgPool = paddleStore.getPgPool;
  const db = getPgPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ,
      CONSTRAINT users_role_check
        CHECK (role IN ('super_admin', 'admin'))
    )
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
    ON users (LOWER(email))
  `);

  await db.query('BEGIN');
  try {
    await db.query('LOCK TABLE users IN EXCLUSIVE MODE');
    const users = await db.query(`
      SELECT id, email, role, password_hash
      FROM users
      ORDER BY id
    `);
    const existing = users.rows.find(
      (user) => normalizeEmail(user.email) === email,
    );

    let user = existing;
    let created = false;

    if (!existing) {
      if (users.rowCount > 0) {
        throw new Error(
          'The users table already contains accounts, but not the requested initial email.',
        );
      }

      const passwordHash = await hashAdminPassword(password);
      const inserted = await db.query(
        `
          INSERT INTO users (email, password_hash, role)
          VALUES ($1, $2, 'super_admin')
          RETURNING id, email, role, password_hash
        `,
        [email, passwordHash],
      );
      user = inserted.rows[0];
      created = true;
    }

    if (user.role !== 'super_admin') {
      throw new Error('The initial account exists but is not a super_admin.');
    }
    if (!(await adminPasswordHashMatches(password, user.password_hash))) {
      throw new Error('The stored password hash does not match ADMIN_PASSWORD.');
    }

    const verification = await db.query(`
      SELECT
        COUNT(*)::int AS users,
        COUNT(*) FILTER (WHERE role = 'super_admin')::int AS super_admins,
        COUNT(*) FILTER (WHERE role = 'admin')::int AS admins
      FROM users
    `);
    if (
      verification.rows[0].users !== 1
      || verification.rows[0].super_admins !== 1
    ) {
      throw new Error('Initial account verification did not return exactly one super_admin.');
    }

    await db.query('COMMIT');
    console.log('Initial admin account ready:', {
      created,
      id: Number(user.id),
      email: user.email,
      role: user.role,
      passwordAlgorithm: String(user.password_hash).split('$')[0],
      passwordVerified: true,
      ...verification.rows[0],
    });
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(`Admin user migration failed (${error?.code || 'UNKNOWN'}): ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPgPool?.().end();
    } catch {
      // No pool exists when configuration fails before initialization.
    }
  });
