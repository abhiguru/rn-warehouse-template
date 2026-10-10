/**
 * Guards for the rules in docs/I18N.md that the type checker cannot see.
 *
 * They read the source files with the TypeScript parser (as scripts/i18n-report.mjs does).
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = resolve(__dirname, '../../..');
const IS_TEST = [/__tests__/, /\.test\.tsx?$/, /^src\/tests\//, /\.d\.ts$/];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const FILES = ['app', 'src']
  .flatMap(dir => sourceFiles(join(ROOT, dir)))
  .map(path => ({ path, rel: relative(ROOT, path).split('\\').join('/') }))
  .filter(file => !IS_TEST.some(pattern => pattern.test(file.rel)));

const parse = (path: string, text = readFileSync(path, 'utf8')) =>
  ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

/** The i18n module, however a file reaches it: '@/i18n', or a relative path ending in /i18n or /i18n/index. */
const isI18nModule = (specifier: string, rel: string) =>
  specifier === '@/i18n' ||
  specifier === '@/i18n/index' ||
  (specifier.startsWith('.') && /^src\/i18n(\/index)?$/.test(relative(ROOT, resolve(ROOT, rel, '..', specifier)).split('\\').join('/')));

/** The names `t` goes by in a file: `t`, or an alias such as `tr` where `t` is the theme tokens. */
function translateNames(source: ts.SourceFile, rel: string): Set<string> {
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!isI18nModule(statement.moduleSpecifier.text, rel)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if ((element.propertyName ?? element.name).text === 't') names.add(element.name.text);
    }
  }
  // The module that defines `t` calls it by that name.
  if (rel === 'src/i18n/index.ts') names.add('t');
  return names;
}

const unwrap = (node: ts.Node): ts.Node => (ts.isParenthesizedExpression(node.parent) ? unwrap(node.parent) : node);

/**
 * True when the code at `node` runs while the file is loaded: it is not inside a
 * function, method, arrow function, accessor, constructor or instance member
 * initialiser. A function that is called on the spot, `(() => …)()`, does not count
 * as a function here.
 */
export function runsAtModuleLevel(node: ts.Node): boolean {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionLike(current)) {
      const outer = unwrap(current);
      const calledOnTheSpot = ts.isCallExpression(outer.parent) && outer.parent.expression === outer;
      if (!calledOnTheSpot) return false;
    }
    // An instance member's initialiser runs when an object is made; a static one runs at load.
    if (ts.isPropertyDeclaration(current) && !current.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.StaticKeyword)) {
      return false;
    }
  }
  return true;
}

/** Calls of `t` (under any of its names) that run while the file is loaded: "file:line  text". */
export function moduleLevelTranslations(source: ts.SourceFile, rel: string): string[] {
  const names = translateNames(source, rel);
  if (names.size === 0) return [];
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && names.has(node.expression.text) && runsAtModuleLevel(node)) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      found.push(`${rel}:${line + 1}  ${node.getText(source).slice(0, 60)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('t is never called while a file is loaded', () => {
  const check = (code: string, rel = 'src/example.tsx') => moduleLevelTranslations(parse(rel, code), rel);

  it('the check finds a call at module level, under t or an alias', () => {
    expect(check(`import { t } from '@/i18n';\nconst TITLE = t('common.save');`)).toEqual(["src/example.tsx:2  t('common.save')"]);
    expect(check(`import { t as tr } from '@/i18n';\nexport const LABELS = { save: tr('common.save') };`)).toHaveLength(1);
    expect(check(`import { t as translate } from '../i18n';\nconst STEPS = [{ label: translate('common.save') }];`, 'src/constants/x.ts')).toHaveLength(1);
    expect(check(`import { t } from '@/i18n';\nconst X = (() => t('common.save'))();`)).toHaveLength(1);
    expect(check(`import { t } from '@/i18n';\nclass A { static label = t('common.save'); }`)).toHaveLength(1);
  });

  it('the check accepts calls that run later, and a t that is not the translation function', () => {
    expect(check(`import { t } from '@/i18n';\nconst title = () => t('common.save');`)).toEqual([]);
    expect(check(`import { t } from '@/i18n';\nfunction f(label = t('common.save')) { return label; }`)).toEqual([]);
    expect(check(`import { t } from '@/i18n';\nconst o = { get label() { return t('common.save'); }, text() { return t('common.save'); } };`)).toEqual([]);
    expect(check(`import { t } from '@/i18n';\nclass A { label = t('common.save'); m() { return t('common.save'); } }`)).toEqual([]);
    expect(check(`import { t as tr } from '@/i18n';\nconst makeStyles = (t: { c: string }) => ({ color: t.c });\nconst C = () => tr('common.save');`)).toEqual([]);
    // `t` here is something else (theme tokens), not imported from the i18n module.
    expect(check(`const t = (x: string) => x;\nconst X = t('common.save');`)).toEqual([]);
  });

  it('no file under app/ or src/ does it', () => {
    expect(FILES.length).toBeGreaterThan(300);
    const found = FILES.flatMap(file => moduleLevelTranslations(parse(file.path), file.rel));
    expect(found).toEqual([]);
  });
});

describe('visible English left in code', () => {
  it('scripts/i18n-report.mjs finds none', () => {
    let output = '';
    let status = 0;
    try {
      output = execFileSync(process.execPath, ['scripts/i18n-report.mjs'], { cwd: ROOT, encoding: 'utf8' });
    } catch (error) {
      const failure = error as { status?: number; stdout?: string; stderr?: string };
      status = failure.status ?? 1;
      output = `${failure.stdout ?? ''}${failure.stderr ?? ''}`;
    }
    // On failure the report itself is the message: file, line and text of each find.
    expect({ status, output: status === 0 ? '' : output }).toEqual({ status: 0, output: '' });
    expect(output).toContain('0 visible English texts');
  });
});

describe('dates and numbers go through the formatters', () => {
  // toLocaleDateString() and its relatives follow the phone, not the app language,
  // and never give ૦-૯: use formatDate, formatDateTime, formatTime and formatNumber.
  it('no file calls toLocaleDateString, toLocaleTimeString or toLocaleString', () => {
    const found: string[] = [];
    for (const file of FILES) {
      if (file.rel === 'src/utils/formatters.ts') continue;
      const source = parse(file.path);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && /^toLocale(Date|Time)?String$/.test(node.expression.name.text)) {
          found.push(`${file.rel}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(found).toEqual([]);
  });
});

describe('sign-in rate limit', () => {
  // The countdown needs `retryAfterSeconds`, which only the whole result carries:
  // `result.error` alone is a translated sentence the hook cannot read a time from.
  it.each(['app/login.tsx', 'app/otp.tsx'])('%s passes the whole result to handleRateLimitError', rel => {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    expect(text).toContain('handleRateLimitError(result)');
    expect(text).not.toContain('handleRateLimitError(result.error)');
  });
});
