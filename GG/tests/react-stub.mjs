// Minimal 'react' stand-in for node:test. Only `cache` is needed by
// src/lib/blog-db.js (React's cache only memoizes a function — the identity
// stand-in is equivalent for tests). Used via react-stub-hooks.mjs.
export const cache = (fn) => fn;
export default { cache };
