/**
 * The session teardown (src/store/sessionScopedState.ts) is imported by the auth slice, so nothing
 * it imports may import the auth slice back: Metro would log "Require cycle: authSlice ->
 * sessionScopedState -> ... -> authSlice". Slices that must react to sign-out match the action by
 * its type string ('auth/logout/fulfilled') instead of importing the `logout` thunk.
 *
 * This walks the static imports with the TypeScript parser. `import type` / `export type` and
 * type-only specifiers are erased at build time, so they are not followed; neither are packages.
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const root = path.resolve(__dirname, '../..');
const START = 'src/store/sessionScopedState.ts';
const TARGET = 'src/store/slices/authSlice.ts';

const rel = (file: string) => path.relative(root, file).split(path.sep).join('/');

/** A relative or '@/' (src/) specifier as a source file, or undefined for packages and non-TypeScript files. */
function resolveImport(from: string, specifier: string): string | undefined {
  const base = specifier.startsWith('@/')
    ? path.join(root, 'src', specifier.slice(2))
    : specifier.startsWith('.')
      ? path.resolve(path.dirname(from), specifier)
      : undefined;
  if (!base) return undefined;
  return ['.ts', '.tsx', '/index.ts', '/index.tsx'].map(suffix => base + suffix).find(file => fs.existsSync(file));
}

/** The files `file` imports or re-exports at run time. */
function importsOf(file: string): string[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];
  for (const node of source.statements) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const named = clause?.namedBindings;
      const typeOnly =
        clause !== undefined &&
        (clause.isTypeOnly || (!clause.name && !!named && ts.isNamedImports(named) && named.elements.length > 0 && named.elements.every(e => e.isTypeOnly)));
      if (!typeOnly) specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && !node.isTypeOnly) {
      specifiers.push(node.moduleSpecifier.text);
    }
  }
  return specifiers.flatMap(specifier => resolveImport(file, specifier) ?? []);
}

/** The shortest chain of files from `from` to `to` (both included), or undefined when `to` is not reachable. */
function importChain(from: string, to: string): string[] | undefined {
  const cameFrom = new Map<string, string | undefined>([[from, undefined]]);
  for (const file of cameFrom.keys()) {
    for (const next of importsOf(file)) if (!cameFrom.has(next)) cameFrom.set(next, file);
    if (cameFrom.has(to)) break;
  }
  if (!cameFrom.has(to)) return undefined;
  const chain: string[] = [];
  for (let file: string | undefined = to; file; file = cameFrom.get(file)) chain.unshift(file);
  return chain;
}

it('nothing imported by sessionScopedState imports the auth slice', () => {
  const chain = importChain(path.join(root, START), path.join(root, TARGET));
  expect(chain && `Require cycle: ${[TARGET, ...chain.map(rel)].join(' -> ')}`).toBeUndefined();
});
