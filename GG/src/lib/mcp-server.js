import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import {
  createDraft,
  getPrompt,
  getPromptCategories,
  listPrompts,
  McpToolError,
  publishDraft,
  updateDraft,
  uploadPhotoImage,
} from './mcp-prompt-tools.js';
import {
  createBlogDraft,
  getBlogPost,
  listBlogPosts,
  McpBlogToolError,
  publishBlogDraft,
  updateBlogDraft,
} from './mcp-blog-tools.js';
import { McpImageUploadError } from './mcp-image-upload.js';
import { McpAuthorizationError } from './mcp-oauth-db.js';

const PAGE_SIZE_MAX = 50;
// The MCP transport must accept the largest tool payload: upload_photo_image
// allows a 3 MB image as ~4.2 MB of base64 plus the JSON-RPC envelope, so the
// body cap is 8 MB. (It was 64 KB, which rejected every real image with a
// 413 before the tool ever ran.)
export const MCP_MAX_REQUEST_BODY_BYTES = 8 * 1024 * 1024;
const CATEGORY_IDS = z.array(z.number().int().positive()).max(30).optional();
const TAGS = z.array(z.string().trim().min(1).max(100)).max(30).optional();
const VERCEL_HOST = process.env.VERCEL_URL;
const ALLOWED_HOSTS = [
  'www.aqprompts.com',
  'aqprompts.com',
  // Live Cloudflare Worker origin (custom domain is primary, workers.dev is
  // the fallback origin). Both must be listed or DNS rebinding protection
  // would reject legitimate MCP clients connecting to the live Worker.
  'aqprompts.abdulqudoos-4755.workers.dev',
  'localhost:3000',
  '127.0.0.1:3000',
  ...(typeof VERCEL_HOST === 'string' && /^[a-z0-9.-]+$/i.test(VERCEL_HOST) ? [VERCEL_HOST] : []),
];

const librarySchema = z.enum(['photo', 'text']);
const listSchema = z.object({
  library: librarySchema,
  page: z.number().int().min(1).max(1000).optional(),
  pageSize: z.number().int().min(1).max(PAGE_SIZE_MAX).optional(),
  search: z.string().max(200).optional(),
  status: z.enum(['all', 'draft', 'published']).optional(),
}).strict();
const getSchema = z.object({
  library: librarySchema,
  id: z.number().int().positive(),
}).strict();
const createSchema = z.object({
  library: librarySchema,
  title: z.string().trim().min(3).max(200),
  prompt: z.string().trim().min(10).max(20_000),
  slug: z.string().trim().min(1).max(220).optional(),
  primaryCategoryId: z.number().int().positive(),
  categoryIds: CATEGORY_IDS,
  tags: TAGS,
  intro: z.string().max(5_000).optional(),
  useCase: z.string().max(200).optional(),
  image: z.string().url().max(2_000).optional(),
  images: z.array(z.string().url().max(2_000)).max(12).optional(),
  imageAltTexts: z.record(z.string(), z.string().max(500)).optional(),
  ogImage: z.string().url().max(2_000).optional(),
}).strict();
const updateSchema = z.object({
  library: librarySchema,
  id: z.number().int().positive(),
  title: z.string().trim().min(3).max(200).optional(),
  prompt: z.string().trim().min(10).max(20_000).optional(),
  slug: z.string().trim().min(1).max(220).optional(),
  primaryCategoryId: z.number().int().positive().optional(),
  categoryIds: CATEGORY_IDS,
  tags: TAGS,
  intro: z.string().max(5_000).optional(),
  useCase: z.string().max(200).optional(),
  image: z.string().url().max(2_000).optional(),
  images: z.array(z.string().url().max(2_000)).max(12).optional(),
  imageAltTexts: z.record(z.string(), z.string().max(500)).optional(),
  ogImage: z.string().url().max(2_000).optional(),
}).strict();
const publishSchema = z.object({
  library: librarySchema,
  id: z.number().int().positive(),
}).strict();
const uploadImageSchema = z.object({
  imageBase64: z.string().min(8).max(4_194_304),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
}).strict();
const blogListSchema = z.object({
  page: z.number().int().min(1).max(1000).optional(),
  pageSize: z.number().int().min(1).max(PAGE_SIZE_MAX).optional(),
  search: z.string().max(200).optional(),
  status: z.enum(['all', 'draft', 'published']).optional(),
}).strict();
const blogGetSchema = z.object({
  id: z.number().int().positive(),
}).strict();
const blogDraftFields = {
  title: z.string().trim().min(1).max(200).optional(),
  slug: z.string().trim().min(1).max(255).optional(),
  excerpt: z.string().max(2_000).optional(),
  content: z.string().max(40_000).optional(),
  featuredImage: z.string().url().max(2_000).optional(),
  featuredImageAlt: z.string().max(500).optional(),
  category: z.string().trim().min(1).max(120).optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  seoTitle: z.string().max(500).optional(),
  seoDescription: z.string().max(5_000).optional(),
};
const createBlogDraftSchema = z.object({
  ...blogDraftFields,
  title: z.string().trim().min(1).max(200),
  content: z.string().max(40_000).optional(),
}).strict();
const updateBlogDraftSchema = z.object({
  id: z.number().int().positive(),
  ...blogDraftFields,
}).strict();

function resultContent(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
  };
}

function toolFailure(error) {
  if (
    !(error instanceof McpToolError)
    && !(error instanceof McpAuthorizationError)
    && !(error instanceof McpBlogToolError)
    && !(error instanceof McpImageUploadError)
  ) {
    console.error('[MCP] Tool operation failed.');
  }
  const message = error instanceof McpToolError
    || error instanceof McpAuthorizationError
    || error instanceof McpBlogToolError
    || error instanceof McpImageUploadError
    ? error.message
    : 'The operation could not be completed. No success is implied; check the prompt and retry.';
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

function registerTool(server, name, description, schema, handler, authentication) {
  server.registerTool(name, { description, inputSchema: schema }, async (input) => {
    try {
      return resultContent(await handler(input, authentication));
    } catch (error) {
      return toolFailure(error);
    }
  });
}

export function createMcpServer(authentication = null) {
  const server = new McpServer({
    name: 'AQPrompts',
    version: '1.0.0',
  });

  registerTool(
    server,
    'list_prompts',
    'List Photo or Text prompts with bounded pagination, title search, and optional status filtering.',
    listSchema,
    listPrompts,
    authentication,
  );
  registerTool(
    server,
    'get_prompt',
    'Get one Photo or Text prompt by its numeric database ID.',
    getSchema,
    getPrompt,
    authentication,
  );
  registerTool(
    server,
    'list_categories',
    'List existing Photo or Text prompt categories and their database IDs for manual selection.',
    z.object({ library: z.enum(['photo', 'text']).default('photo') }).strict(),
    getPromptCategories,
    authentication,
  );
  registerTool(
    server,
    'create_draft',
    'Create a new prompt with status forced to draft. Photo drafts may omit an image; use upload_photo_image to store an approved HTTPS image first.',
    createSchema,
    createDraft,
    authentication,
  );
  registerTool(
    server,
    'update_draft',
    'Update an existing draft only. Published prompts are read-only; status cannot be changed.',
    updateSchema,
    async (input, verifiedAuthentication) => {
      const mutableFields = Object.keys(input).filter((key) => key !== 'library' && key !== 'id');
      if (mutableFields.length === 0) {
        throw new McpToolError('Provide at least one prompt field to update.');
      }
      return updateDraft(input, verifiedAuthentication);
    },
    authentication,
  );
  registerTool(
    server,
    'publish_prompt',
    'Publish a draft prompt. Requires a separately granted MCP publish permission; Photo prompts must pass the existing publication validation.',
    publishSchema,
    publishDraft,
    authentication,
  );
  registerTool(
    server,
    'upload_photo_image',
    'Upload a JPEG, PNG, or WebP image supplied as base64 data to the existing AQ Cloudinary media library (maximum 3 MB). Requires a separately granted MCP image-upload permission.',
    uploadImageSchema,
    uploadPhotoImage,
    authentication,
  );
  registerTool(
    server,
    'list_blog_posts',
    'List published blog posts and only your owned or explicitly assigned drafts, with optional title/content search. Existing unassigned drafts are hidden.',
    blogListSchema,
    listBlogPosts,
    authentication,
  );
  registerTool(
    server,
    'get_blog_post',
    'Read a published blog post or a draft you own or have been explicitly assigned.',
    blogGetSchema,
    getBlogPost,
    authentication,
  );
  registerTool(
    server,
    'create_blog_draft',
    'Create a plain-text blog draft owned by the verified OAuth subject. Content is stored as plain text and safely HTML-escaped for public rendering.',
    createBlogDraftSchema,
    createBlogDraft,
    authentication,
  );
  registerTool(
    server,
    'update_blog_draft',
    'Edit only an owned or explicitly assigned blog draft. Published posts cannot be edited through this tool.',
    updateBlogDraftSchema,
    async (input, verifiedAuthentication) => {
      const mutableFields = Object.keys(input).filter((key) => key !== 'id');
      if (mutableFields.length === 0) {
        throw new McpBlogToolError('Provide at least one blog field to update.');
      }
      return updateBlogDraft(input, verifiedAuthentication);
    },
    authentication,
  );
  registerTool(
    server,
    'publish_blog_post',
    'Publish an owned or explicitly assigned blog draft. Requires a separate can_publish_blog permission.',
    blogGetSchema,
    publishBlogDraft,
    authentication,
  );

  return server;
}

export async function handleMcpProtocolRequest(request, authentication = null) {
  const server = createMcpServer(authentication);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: MCP_MAX_REQUEST_BODY_BYTES,
    // Deliberately enabled: the list above covers every legitimate origin
    // (custom domain, workers.dev fallback, local dev), so rebinding
    // protection only rejects hosts that should never reach this endpoint.
    enableDnsRebindingProtection: true,
    allowedHosts: ALLOWED_HOSTS,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } finally {
    await transport.close();
    await server.close();
  }
}
