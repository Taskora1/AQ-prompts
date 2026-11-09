import { getPgPool } from './db.js';

export class McpAuthorizationError extends Error {
  constructor(message = 'MCP user is not authorized for this operation.') {
    super(message);
    this.name = 'McpAuthorizationError';
  }
}

function validAuthorization(authentication) {
  return authentication?.type === 'oauth'
    && typeof authentication.subject === 'string'
    && authentication.subject.length > 0
    && typeof authentication.clientId === 'string'
    && authentication.clientId.length > 0;
}

export async function lockMcpOAuthAuthorization(client, authentication) {
  if (!validAuthorization(authentication)) throw new McpAuthorizationError();

  const result = await client.query(
    `
      SELECT authz.subject
      FROM mcp_oauth_authorizations AS authz
      JOIN users admin_user
       ON admin_user.id = authz.admin_user_id
       AND admin_user.role IN ('admin', 'super_admin')
      WHERE authz.subject = $1
       AND authz.client_id = $2
       AND authz.revoked_at IS NULL
      FOR SHARE
    `,
    [authentication.subject, authentication.clientId],
  );
  if (result.rowCount !== 1) throw new McpAuthorizationError();
}

export async function lockMcpOAuthCapability(client, authentication, capability) {
  if (!validAuthorization(authentication)) throw new McpAuthorizationError();
  const capabilityColumn = {
    publish: 'can_publish',
    upload_images: 'can_upload_images',
    publish_blog: 'can_publish_blog',
  }[capability];
  if (!capabilityColumn) throw new McpAuthorizationError();

  const result = await client.query(
    `
      SELECT authz.subject
      FROM mcp_oauth_authorizations AS authz
      JOIN users admin_user
       ON admin_user.id = authz.admin_user_id
       AND admin_user.role IN ('admin', 'super_admin')
      WHERE authz.subject = $1
       AND authz.client_id = $2
       AND authz.revoked_at IS NULL
       AND authz.${capabilityColumn} = TRUE
      FOR SHARE
    `,
    [authentication.subject, authentication.clientId],
  );
  if (result.rowCount !== 1) {
    throw new McpAuthorizationError(`MCP ${capability.replace('_', ' ')} permission is not authorized.`);
  }
}

export async function insertMcpBlogPostOwner(client, postId, authentication) {
  await lockMcpOAuthAuthorization(client, authentication);
  await client.query(
    `
      INSERT INTO mcp_blog_post_owners (post_id, subject)
      VALUES ($1, $2)
    `,
    [postId, authentication.subject],
  );
}

export async function lockMcpOAuthBlogDraftAuthorization(client, postId, authentication) {
  const post = await client.query(
    `
      SELECT status
      FROM blog_posts
      WHERE id = $1
      FOR UPDATE
    `,
    [postId],
  );
  if (post.rowCount !== 1 || post.rows[0].status !== 'draft') {
    throw new McpAuthorizationError('Blog post not found or not editable.');
  }

  const owner = await client.query(
    `
      SELECT post_id
      FROM mcp_blog_post_owners
      WHERE post_id = $1
        AND subject = $2
      FOR SHARE
    `,
    [postId, authentication.subject],
  );
  if (owner.rowCount === 1) return;

  const assignment = await client.query(
    `
      SELECT post_id
      FROM mcp_blog_post_draft_access
      WHERE post_id = $1
        AND subject = $2
        AND revoked_at IS NULL
      FOR SHARE
    `,
    [postId, authentication.subject],
  );
  if (assignment.rowCount !== 1) {
    throw new McpAuthorizationError('Blog post not found or not editable.');
  }
}

export async function canMcpOAuthReadBlogPost(client, postId, authentication) {
  const post = await client.query(
    `
      SELECT status
      FROM blog_posts
      WHERE id = $1
      FOR SHARE
    `,
    [postId],
  );
  if (post.rowCount !== 1) return false;
  if (post.rows[0].status === 'published') return true;
  if (post.rows[0].status !== 'draft') return false;

  const owner = await client.query(
    `
      SELECT post_id
      FROM mcp_blog_post_owners
      WHERE post_id = $1
        AND subject = $2
      FOR SHARE
    `,
    [postId, authentication.subject],
  );
  if (owner.rowCount === 1) return true;

  const assignment = await client.query(
    `
      SELECT post_id
      FROM mcp_blog_post_draft_access
      WHERE post_id = $1
        AND subject = $2
        AND revoked_at IS NULL
      FOR SHARE
    `,
    [postId, authentication.subject],
  );
  return assignment.rowCount === 1;
}

export async function insertMcpPromptOwner(client, promptId, authentication) {
  await lockMcpOAuthAuthorization(client, authentication);
  await client.query(
    `
      INSERT INTO mcp_prompt_owners (prompt_id, subject)
      VALUES ($1, $2)
    `,
    [promptId, authentication.subject],
  );
}

export async function lockMcpOAuthDraftAuthorization(client, promptId, library, authentication) {
  const prompt = await client.query(
    `
      SELECT p.status
      FROM prompts p
      WHERE p.id = $1
        AND p.library_type = $2
      FOR UPDATE
    `,
    [promptId, library],
  );
  if (prompt.rowCount !== 1 || prompt.rows[0].status !== 'draft') {
    throw new McpAuthorizationError('Prompt not found or not editable.');
  }

  const owner = await client.query(
    `
      SELECT prompt_id
      FROM mcp_prompt_owners
      WHERE prompt_id = $1
        AND subject = $2
      FOR SHARE
    `,
    [promptId, authentication.subject],
  );
  if (owner.rowCount === 1) return;

  const assignment = await client.query(
    `
      SELECT prompt_id
      FROM mcp_prompt_draft_access
      WHERE prompt_id = $1
        AND subject = $2
        AND revoked_at IS NULL
      FOR SHARE
    `,
    [promptId, authentication.subject],
  );
  if (assignment.rowCount !== 1) {
    throw new McpAuthorizationError('Prompt not found or not editable.');
  }
}

export function getMcpDraftAuthorizationSql(subjectPlaceholder, clientPlaceholder) {
  return `
    AND EXISTS (
      SELECT 1
      FROM mcp_oauth_authorizations auth
      WHERE auth.subject = $${subjectPlaceholder}
        AND auth.client_id = $${clientPlaceholder}
        AND auth.revoked_at IS NULL
    )
    AND (
      EXISTS (
        SELECT 1
        FROM mcp_prompt_owners owner
        WHERE owner.prompt_id = prompts.id
          AND owner.subject = $${subjectPlaceholder}
      )
      OR EXISTS (
        SELECT 1
        FROM mcp_prompt_draft_access access
        WHERE access.prompt_id = prompts.id
          AND access.subject = $${subjectPlaceholder}
          AND access.revoked_at IS NULL
      )
    )
  `;
}

export async function hasMcpOAuthAuthorization(authentication) {
  if (!validAuthorization(authentication)) return false;
  const result = await getPgPool().query(
    `
      SELECT 1
      FROM mcp_oauth_authorizations AS authz
      JOIN users admin_user
       ON admin_user.id = authz.admin_user_id
       AND admin_user.role IN ('admin', 'super_admin')
      WHERE authz.subject = $1
       AND authz.client_id = $2
       AND authz.revoked_at IS NULL
      LIMIT 1
    `,
    [authentication.subject, authentication.clientId],
  );
  return result.rowCount === 1;
}

export async function canMcpOAuthReadPrompt(client, promptId, library, authentication) {
  const prompt = await client.query(
    `
      SELECT p.status
      FROM prompts p
      WHERE p.id = $1
        AND p.library_type = $2
      FOR SHARE
    `,
    [promptId, library],
  );
  if (prompt.rowCount !== 1) return false;
  if (prompt.rows[0].status === 'published') return true;
  if (prompt.rows[0].status !== 'draft') return false;

  const owner = await client.query(
    `
      SELECT prompt_id
      FROM mcp_prompt_owners
      WHERE prompt_id = $1
        AND subject = $2
      FOR SHARE
    `,
    [promptId, authentication.subject],
  );
  if (owner.rowCount === 1) return true;

  const assignment = await client.query(
    `
      SELECT prompt_id
      FROM mcp_prompt_draft_access
      WHERE prompt_id = $1
        AND subject = $2
        AND revoked_at IS NULL
      FOR SHARE
    `,
    [promptId, authentication.subject],
  );
  return assignment.rowCount === 1;
}

export async function listMcpOAuthPromptRows(authentication, {
  library,
  page = 1,
  pageSize = 20,
  status = 'all',
  search = '',
}) {
  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    await lockMcpOAuthAuthorization(client, authentication);
    await client.query(
      `
        SELECT prompt_id
        FROM mcp_prompt_draft_access
        WHERE subject = $1
          AND revoked_at IS NULL
        FOR SHARE
      `,
      [authentication.subject],
    );

    const values = [library, authentication.subject];
    const conditions = ['p.library_type = $1'];
    if (status === 'published') {
      conditions.push("p.status = 'published'");
    } else if (status === 'draft') {
      conditions.push(`
        p.status = 'draft'
        AND (
          EXISTS (
            SELECT 1 FROM mcp_prompt_owners o
            WHERE o.prompt_id = p.id AND o.subject = $2
          )
          OR EXISTS (
            SELECT 1 FROM mcp_prompt_draft_access a
            WHERE a.prompt_id = p.id
              AND a.subject = $2
              AND a.revoked_at IS NULL
          )
        )
      `);
    } else {
      conditions.push(`
        (
        p.status = 'published'
        OR (
          p.status = 'draft'
          AND (
            EXISTS (
              SELECT 1 FROM mcp_prompt_owners o
              WHERE o.prompt_id = p.id AND o.subject = $2
            )
            OR EXISTS (
              SELECT 1 FROM mcp_prompt_draft_access a
              WHERE a.prompt_id = p.id
                AND a.subject = $2
                AND a.revoked_at IS NULL
            )
          )
        )
        )
      `);
    }

    if (search) {
      values.push(`%${search}%`);
      conditions.push(`p.title ILIKE $${values.length}`);
    }
    const where = conditions.join(' AND ');
    const count = await client.query(
      `SELECT COUNT(*)::int AS total FROM prompts p WHERE ${where}`,
      values,
    );
    const total = Number(count.rows[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    values.push(pageSize, (currentPage - 1) * pageSize);

    const result = await client.query(
      `
        SELECT
          p.id, p.title, p.slug, p.status, p.updated_at::text AS "updatedAt",
          COALESCE(c.name, p.category, p.use_case) AS category,
          ${library === 'photo' ? "COALESCE(p.image, '') AS image" : "NULL::text AS image"}
        FROM prompts p
        LEFT JOIN categories c ON c.id = p.primary_category_id
        WHERE ${where}
        ORDER BY p.updated_at DESC NULLS LAST, p.id DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values,
    );
    await client.query('COMMIT');

    return {
      rows: result.rows.map((row) => ({
        id: Number(row.id),
        title: row.title,
        slug: row.slug,
        status: row.status,
        category: row.category || '',
        ...(library === 'photo' ? { image: row.image || '' } : {}),
        updatedAt: row.updatedAt || '',
      })),
      total,
      page: currentPage,
      pageSize,
      totalPages,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function grantMcpOAuthAuthorization(
  subject,
  clientId,
  adminUserId,
  grantedByAdminId,
) {
  const result = await getPgPool().query(
    `
      INSERT INTO mcp_oauth_authorizations (
        subject, client_id, admin_user_id, granted_by
      )
      SELECT $1, $2, admin_user.id, $4
      FROM users admin_user
      WHERE admin_user.id = $3
        AND admin_user.role IN ('admin', 'super_admin')
      ON CONFLICT (subject, client_id)
      DO UPDATE SET
        admin_user_id = EXCLUDED.admin_user_id,
        granted_by = EXCLUDED.granted_by,
        granted_at = NOW(),
        revoked_at = NULL,
        can_publish = FALSE,
        can_upload_images = FALSE,
        can_publish_blog = FALSE,
        permissions_updated_by = EXCLUDED.granted_by,
        permissions_updated_at = NOW()
      RETURNING subject, client_id AS "clientId",
        admin_user_id AS "adminUserId",
        granted_at::text AS "grantedAt"
    `,
    [subject, clientId, adminUserId, grantedByAdminId],
  );
  return result.rows[0] || null;
}

export async function setMcpOAuthCapabilities(
  subject,
  clientId,
  {
    canPublish = null,
    canUploadImages = null,
    canPublishBlog = null,
  },
  adminId,
) {
  if (
    [canPublish, canUploadImages, canPublishBlog]
      .every((value) => value === null || value === undefined)
    || [canPublish, canUploadImages, canPublishBlog]
      .some((value) => value !== null && value !== undefined && typeof value !== 'boolean')
  ) {
    throw new TypeError('At least one MCP capability must be set to a boolean.');
  }
  const result = await getPgPool().query(
    `
      UPDATE mcp_oauth_authorizations AS authz
      SET can_publish = COALESCE($3, authz.can_publish),
          can_upload_images = COALESCE($4, authz.can_upload_images),
          can_publish_blog = COALESCE($5, authz.can_publish_blog),
          permissions_updated_by = $6,
          permissions_updated_at = NOW()
      WHERE authz.subject = $1
        AND authz.client_id = $2
        AND authz.revoked_at IS NULL
        AND authz.admin_user_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM users admin_user
          WHERE admin_user.id = authz.admin_user_id
            AND admin_user.role IN ('admin', 'super_admin')
        )
      RETURNING authz.subject,
        authz.client_id AS "clientId",
        authz.admin_user_id AS "adminUserId",
        authz.can_publish AS "canPublish",
        authz.can_upload_images AS "canUploadImages",
        authz.can_publish_blog AS "canPublishBlog",
        authz.permissions_updated_at::text AS "permissionsUpdatedAt"
    `,
    [subject, clientId, canPublish, canUploadImages, canPublishBlog, adminId],
  );
  return result.rows[0] || null;
}

export async function revokeMcpOAuthAuthorization(subject, clientId) {
  const result = await getPgPool().query(
    `
      UPDATE mcp_oauth_authorizations
      SET revoked_at = NOW()
      WHERE subject = $1
        AND client_id = $2
        AND revoked_at IS NULL
      RETURNING subject, client_id, revoked_at::text AS "revokedAt"
    `,
    [subject, clientId],
  );
  return result.rows[0] || null;
}

export async function listMcpOAuthAuthorizations(clientId) {
  const result = await getPgPool().query(
    `
      SELECT authz.subject,
        authz.client_id AS "clientId",
        authz.admin_user_id AS "adminUserId",
        admin_user.email AS "adminEmail",
        admin_user.role AS "adminRole",
        authz.granted_at::text AS "grantedAt",
        authz.revoked_at::text AS "revokedAt",
        authz.can_publish AS "canPublish",
        authz.can_upload_images AS "canUploadImages",
        authz.can_publish_blog AS "canPublishBlog",
        authz.permissions_updated_at::text AS "permissionsUpdatedAt"
      FROM mcp_oauth_authorizations AS authz
      LEFT JOIN users admin_user ON admin_user.id = authz.admin_user_id
      WHERE authz.client_id = $1
      ORDER BY authz.revoked_at NULLS FIRST, authz.granted_at DESC
      LIMIT 500
    `,
    [clientId],
  );
  return result.rows;
}

export async function grantMcpPromptDraftAccess(promptId, library, subject, adminId) {
  const result = await getPgPool().query(
    `
      INSERT INTO mcp_prompt_draft_access (prompt_id, subject, granted_by)
      SELECT draft.id, $3, $4
      FROM (
        SELECT p.id
        FROM prompts p
        WHERE p.id = $1
          AND p.library_type = $2
          AND p.status = 'draft'
        FOR UPDATE
      ) draft
      ON CONFLICT (prompt_id, subject)
      DO UPDATE SET granted_by = EXCLUDED.granted_by, granted_at = NOW(), revoked_at = NULL
      RETURNING prompt_id AS id, subject, granted_at::text AS "grantedAt"
    `,
    [promptId, library, subject, adminId],
  );
  return result.rows[0] || null;
}

export async function listMcpPromptDraftAccess() {
  const result = await getPgPool().query(`
    SELECT a.prompt_id AS id, p.library_type AS library, a.subject,
      a.granted_at::text AS "grantedAt", a.revoked_at::text AS "revokedAt"
    FROM mcp_prompt_draft_access a
    JOIN prompts p ON p.id = a.prompt_id
    ORDER BY a.revoked_at NULLS FIRST, a.granted_at DESC
    LIMIT 500
  `);
  return result.rows;
}

export async function revokeMcpPromptDraftAccess(promptId, subject) {
  const result = await getPgPool().query(
    `
      UPDATE mcp_prompt_draft_access
      SET revoked_at = NOW()
      WHERE prompt_id = $1
        AND subject = $2
        AND revoked_at IS NULL
      RETURNING prompt_id AS id, subject, revoked_at::text AS "revokedAt"
    `,
    [promptId, subject],
  );
  return result.rows[0] || null;
}

export async function grantMcpBlogPostDraftAccess(postId, subject, adminId) {
  const result = await getPgPool().query(
    `
      INSERT INTO mcp_blog_post_draft_access (post_id, subject, granted_by)
      SELECT draft.id, $2, $3
      FROM (
        SELECT id
        FROM blog_posts
        WHERE id = $1
          AND status = 'draft'
        FOR UPDATE
      ) draft
      ON CONFLICT (post_id, subject)
      DO UPDATE SET granted_by = EXCLUDED.granted_by, granted_at = NOW(), revoked_at = NULL
      RETURNING post_id AS id, subject, granted_at::text AS "grantedAt"
    `,
    [postId, subject, adminId],
  );
  return result.rows[0] || null;
}

export async function listMcpBlogPostDraftAccess() {
  const result = await getPgPool().query(`
    SELECT a.post_id AS id, 'blog' AS library, a.subject,
      a.granted_at::text AS "grantedAt", a.revoked_at::text AS "revokedAt"
    FROM mcp_blog_post_draft_access a
    JOIN blog_posts p ON p.id = a.post_id
    ORDER BY a.revoked_at NULLS FIRST, a.granted_at DESC
    LIMIT 500
  `);
  return result.rows;
}

export async function revokeMcpBlogPostDraftAccess(postId, subject) {
  const result = await getPgPool().query(
    `
      UPDATE mcp_blog_post_draft_access
      SET revoked_at = NOW()
      WHERE post_id = $1
        AND subject = $2
        AND revoked_at IS NULL
      RETURNING post_id AS id, subject, revoked_at::text AS "revokedAt"
    `,
    [postId, subject],
  );
  return result.rows[0] || null;
}
