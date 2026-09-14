import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const originalLine = "const decodeComponent = require('decode-uri-component');";
const adapter = "const decodeComponentModule = require('decode-uri-component');\nconst decodeComponent = typeof decodeComponentModule === 'function' ? decodeComponentModule : decodeComponentModule.default;";
const hash = value => createHash('sha256').update(value).digest('hex');
export function adapt(source, version) {
  const original = source.includes(adapter) ? source.replace(adapter, originalLine) : source;
  if (version !== '7.1.3' || hash(original) !== 'caa3f2c8b45dfe1e91db22ae10743af68de8d96f26515132bb52485ec0f037fa') {
    throw new Error('Unreviewed query-string contents/version. Review the navigation decoder adapter before installing.');
  }
  return original.replace(originalLine, adapter);
}

export function patch(root) {
  const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
  const paths = Object.keys(lock.packages).filter(path => /(^|\/)node_modules\/query-string$/.test(path));
  if (!paths.length) throw new Error('Expected reviewed query-string consumer is missing.');
  // Validate every consumer before writing any adapter.
  const changes = paths.map(path => {
    const directory = resolve(root, path);
    const pkg = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
    const fromConsumer = createRequire(resolve(directory, 'package.json'));
    const decoder = fromConsumer.resolve('decode-uri-component');
    const decoderPackage = JSON.parse(readFileSync(resolve(dirname(decoder), 'package.json'), 'utf8'));
    if (decoderPackage.version !== '0.5.0' || hash(readFileSync(decoder)) !== '9401353df38f8010ad7035fe8d666bce6a4902bc1cff809afc4ab23fa2e0bdaa') {
      throw new Error('Unreviewed decode-uri-component contents/version. Expected upstream patched 0.5.0.');
    }
    const target = resolve(directory, 'index.js');
    const source = readFileSync(target, 'utf8');
    return { target, source, result: adapt(source, pkg.version) };
  });
  for (const { target, source, result } of changes) if (source !== result) writeFileSync(target, result);
  console.log('Verified upstream decoder 0.5.0 and query-string CommonJS/default-export adapter.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) patch(fileURLToPath(new URL('..', import.meta.url)));
