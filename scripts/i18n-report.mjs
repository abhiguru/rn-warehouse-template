#!/usr/bin/env node
/**
 * Lists visible English text still written in code (docs/I18N.md, rule 1).
 * A heuristic: it reports JSX text and string values of the props and object
 * keys that people see or hear. Exit code 1 when anything is found.
 *
 *   node scripts/i18n-report.mjs            # app/ and src/
 *   node scripts/i18n-report.mjs src/features/grn
 *   node scripts/i18n-report.mjs --summary  # counts per file only
 *   node scripts/i18n-report.mjs --allowed  # also list what the allow list skipped, with the reason
 *
 * English that is meant to stay is named in ALLOW below, one reason each. Keep
 * the list short: add to it only what no person reads in the app.
 * src/i18n/__tests__/guards.test.ts runs this script and fails when it finds anything.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const args = process.argv.slice(2);
const summary = args.includes('--summary');
const showAllowed = args.includes('--allowed');
const targets = args.filter(arg => !arg.startsWith('--'));
const SKIP = [/__tests__/, /\.test\.tsx?$/, /^src\/tests\//, /^src\/i18n\//, /^app\/style-guide\.tsx$/, /^app\/(terms-of-service|privacy-policy)\.tsx$/, /\.d\.ts$/];
const PROPS = new Set([
  'label', 'title', 'subtitle', 'placeholder', 'message', 'description', 'helperText', 'errorText', 'error', 'hint', 'text',
  'accessibilityLabel', 'accessibilityHint', 'emptyTitle', 'emptySubtitle', 'filteredTitle', 'filteredSubtitle',
  'createButtonLabel', 'clearFiltersLabel', 'confirmLabel', 'cancelLabel', 'headerTitle', 'loadingText', 'footer', 'caption',
  'buttonText', 'actionLabel', 'tabBarLabel', 'headerBackTitle', 'summary', 'heading', 'content', 'body', 'name',
]);
// English that stays. An entry matches on every field it gives: file (path), kind (prop or key name), text.
const ALLOW = [
  { file: /^app\/(.+\/)?_layout\.tsx$/, kind: /^name$/, reason: 'route name of a Stack.Screen or Tabs.Screen, never shown' },
  { file: /^src\/components\/BrandMark\.tsx$/, text: /^GCSA$/, reason: "the association's wordmark, the same in every language" },
  { kind: /^placeholder$/, text: /^(https:\/\/warehouse\.example\.com|[a-z]+@example\.com)$/, reason: 'sample address: an address is written in Latin letters' },
  { file: /^src\/components\/PrintJobsBottomSheet\.tsx$/, kind: /^error$/, text: /^Failed to fetch \w+ jobs$/, reason: 'only written to the log; the sheet shows components.printJobs.loadFailed' },
  { file: /^src\/utils\/schemaValidator\.ts$/, kind: /^error$/, reason: 'developer diagnostics of stored-data checks; no screen shows them' },
];
const allowedBy = entry =>
  ALLOW.find(rule => (!rule.file || rule.file.test(entry.file)) && (!rule.kind || rule.kind.test(entry.kind)) && (!rule.text || rule.text.test(entry.text)));

// Words, not codes: at least one run of three letters, and not an identifier, path, colour or icon name.
const isProse = text =>
  /[A-Za-z]{3,}/.test(text) &&
  !/^[a-z0-9]+([-_./:][a-z0-9]+)+$/i.test(text.trim()) &&
  !/^#[0-9a-f]{3,8}$/i.test(text.trim()) &&
  !/^[a-z]+[A-Z][A-Za-z]*$/.test(text.trim());
const iconLike = text => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(text.trim());

function files(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) return [];
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

const found = [];
const allowed = [];
for (const target of targets.length ? targets : ['app', 'src']) {
  const start = join(root, target);
  for (const file of statSync(start).isDirectory() ? files(start) : [start]) {
    const rel = relative(root, file);
    if (SKIP.some(pattern => pattern.test(rel))) continue;
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const report = (node, text, kind) => {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      const entry = { file: rel, line: line + 1, kind, text: text.trim().replace(/\s+/g, ' ').slice(0, 90) };
      const rule = allowedBy(entry);
      if (rule) allowed.push({ ...entry, reason: rule.reason });
      else found.push(entry);
    };
    const inLog = node => {
      for (let current = node.parent; current; current = current.parent) {
        if (ts.isCallExpression(current)) {
          const callee = current.expression.getText(source);
          if (/^(console|logger|[a-zA-Z]*Logger)\./.test(callee) || /^(createLogger|require|jest\.)/.test(callee)) return true;
        }
      }
      return false;
    };
    const stringValue = node => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
      if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map(span => `{}${span.literal.text}`).join('');
      return null;
    };
    const visit = node => {
      if (ts.isJsxText(node)) {
        if (isProse(node.text)) report(node, node.text, 'text');
      } else if (ts.isJsxAttribute(node) && node.initializer) {
        const name = node.name.getText(source);
        if (PROPS.has(name)) {
          const value = ts.isJsxExpression(node.initializer) && node.initializer.expression ? node.initializer.expression : node.initializer;
          const text = stringValue(value);
          if (text !== null && isProse(text) && !(name === 'name' && iconLike(text))) report(node, text, name);
        }
      } else if (ts.isPropertyAssignment(node) && !inLog(node)) {
        const name = node.name.getText(source).replace(/['"]/g, '');
        if (PROPS.has(name) && name !== 'name' && name !== 'text' && name !== 'content' && name !== 'body') {
          const text = stringValue(node.initializer);
          if (text !== null && isProse(text) && / /.test(text.trim())) report(node, text, name);
        }
      } else if (ts.isJsxExpression(node) && node.expression && ts.isJsxElement(node.parent)) {
        const text = stringValue(node.expression);
        if (text !== null && isProse(text)) report(node, text, 'text');
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
}

if (summary) {
  const perFile = new Map();
  for (const entry of found) perFile.set(entry.file, (perFile.get(entry.file) ?? 0) + 1);
  for (const [file, count] of [...perFile].sort((a, b) => b[1] - a[1])) console.log(String(count).padStart(5), file);
} else {
  for (const entry of found) console.log(`${entry.file}:${entry.line}  [${entry.kind}]  ${entry.text}`);
}
if (showAllowed) {
  console.log(`\nAllowed (${allowed.length}):`);
  for (const entry of allowed) console.log(`${entry.file}:${entry.line}  [${entry.kind}]  ${entry.text}  -- ${entry.reason}`);
}
console.log(`\n${found.length} visible English text${found.length === 1 ? '' : 's'} in ${new Set(found.map(entry => entry.file)).size} files`);
process.exit(found.length ? 1 : 0);
