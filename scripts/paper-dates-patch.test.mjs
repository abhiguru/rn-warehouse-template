import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { backportSource } from './patch-security-backports.mjs';

const specs = JSON.parse(readFileSync(new URL('./paper-dates-patch.json', import.meta.url), 'utf8'));
const library = '../node_modules/react-native-paper-dates/';

test('the calendar patch covers the three reviewed files of one library version', () => {
  assert.equal(specs.length, 3);
  for (const spec of specs) {
    assert.equal(spec.package, 'react-native-paper-dates');
    assert.equal(spec.version, '0.24.1');
  }
});

test('the installed calendar files are patched, and the patch is idempotent and version checked', () => {
  const version = JSON.parse(readFileSync(new URL(library + 'package.json', import.meta.url), 'utf8')).version;
  for (const spec of specs) {
    const source = readFileSync(new URL(library + spec.file, import.meta.url), 'utf8');
    assert.equal(backportSource(source, version, spec), source);
    assert.throws(() => backportSource(source, '0.25.0', spec), /Unreviewed/);
    assert.throws(() => backportSource(source + '\n', version, spec), /Unreviewed/);
  }
});

test('the patched calendar writes DD/MM/YY', () => {
  const read = file => readFileSync(new URL(library + 'src/Date/' + file, import.meta.url), 'utf8');
  assert.ok(read('dateUtils.tsx').includes("return 'DD/MM/YY'"));
  assert.ok(read('DatePickerModalContentHeader.tsx').includes('dayMonthYearFormatter(locale, true)'));
  assert.ok(!read('DatePickerModalContentHeader.tsx').includes("month: 'short'"));
  assert.ok(read('inputUtils.ts').includes("inputFormat.indexOf('YY')"));
});
