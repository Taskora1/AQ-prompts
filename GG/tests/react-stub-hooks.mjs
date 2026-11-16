// ESM loader hooks for node:test: redirect bare 'react' imports to the
// local stub (tests/react-stub.mjs). The installed React 18.3.1 has no
// `cache` export in the build Node resolves, while Next.js resolves the
// server build where it exists — so plain node:test cannot import
// src/lib/blog-db.js without this redirect. Register with:
//   import { register } from 'node:module';
//   register('./react-stub-hooks.mjs', import.meta.url);
// before dynamically importing the module under test.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'react') {
    return { url: new URL('./react-stub.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
