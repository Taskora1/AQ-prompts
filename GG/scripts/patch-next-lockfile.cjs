const fs = require('fs');
const path = require('path');

const lockfilePaths = [
  path.join(process.cwd(), 'node_modules', 'next', 'dist', 'build', 'lockfile.js'),
  path.join(process.cwd(), 'node_modules', 'next', 'dist', 'esm', 'build', 'lockfile.js'),
];

const original = 'if (bindings.isWasm) {';
const patched = "if (bindings.isWasm || typeof bindings.lockfileTryAcquireSync !== 'function') {";
const originalCatch = `            } catch (e) {
                // this happens if there's an IO error (e.g. \`ENOENT\`), which is
                // different than if we just didn't acquire the lock
                throw Object.defineProperty(new Error('An IO error occurred while attempting to create and acquire the lockfile', {
                    cause: e
                }), "__NEXT_ERROR_CODE", {
                    value: "E859",
                    enumerable: false,
                    configurable: true
                });
            }`;
const patchedCatch = `            } catch (e) {
                if (e instanceof TypeError && String(e.message).includes('lockfileTryAcquireSync is not a function')) {
                    return new Lockfile(bindings, undefined);
                }
                // this happens if there's an IO error (e.g. \`ENOENT\`), which is
                // different than if we just didn't acquire the lock
                throw Object.defineProperty(new Error('An IO error occurred while attempting to create and acquire the lockfile', {
                    cause: e
                }), "__NEXT_ERROR_CODE", {
                    value: "E859",
                    enumerable: false,
                    configurable: true
                });
            }`;

let patchedCount = 0;

for (const lockfilePath of lockfilePaths) {
  if (!fs.existsSync(lockfilePath)) {
    continue;
  }

  let source = fs.readFileSync(lockfilePath, 'utf8');

  let changed = false;

  if (!source.includes(patched) && source.includes(original)) {
    source = source.replace(original, patched);
    changed = true;
  }

  if (!source.includes(patchedCatch) && source.includes(originalCatch)) {
    source = source.replace(originalCatch, patchedCatch);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(lockfilePath, source);
    patchedCount += 1;
  }
}

if (patchedCount > 0) {
  console.log(`[next-lockfile-patch] Applied Next 16 native lockfile compatibility guard to ${patchedCount} file(s).`);
} else {
  console.log('[next-lockfile-patch] Next 16 native lockfile compatibility guard already present.');
}
