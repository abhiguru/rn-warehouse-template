#!/usr/bin/env node
// Make-public gate for the legal text (WH-140; `npm run check:legal`; the release workflow reads the same constant before it attaches the APK). The template Terms of service and Privacy policy
// (src/legal/templateText.ts) have not been reviewed by a lawyer. This fails while
// `LEGAL_TEXT_REVIEWED` in src/constants/legal.ts is not `true`. The owner records the review
// (with its date) in product/specs/legal-pages-template.md, the reviewed text replaces the template
// text, and only then is the constant set to `true`.
//   node scripts/check-legal-reviewed.mjs [FILE]     (default: src/constants/legal.ts)
// Exit 0: reviewed. Exit 1: not reviewed, or the constant could not be read.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isMain } from './is-main.mjs';

export function legalReviewProblem(source) {
  const match = /^export const LEGAL_TEXT_REVIEWED\s*(?::\s*boolean\s*)?=\s*(true|false)\s*;/m.exec(source);
  if (!match) return 'LEGAL_TEXT_REVIEWED was not found in src/constants/legal.ts.';
  if (match[1] !== 'true') {
    return 'the terms and privacy text in this build has not been reviewed by a lawyer (LEGAL_TEXT_REVIEWED is false in src/constants/legal.ts). '
      + 'The owner records the review in the WH-140 spec and the reviewed text replaces the template before a public build.';
  }
  return null;
}

if (isMain(import.meta.url)) {
  const file = process.argv[2] ?? fileURLToPath(new URL('../src/constants/legal.ts', import.meta.url));
  let problem;
  try { problem = legalReviewProblem(readFileSync(file, 'utf8')); } catch (error) { problem = `cannot read ${file} (${error.message}).`; }
  if (problem) {
    console.error(`Refusing release: ${problem}`);
    process.exit(1);
  }
  console.log('Legal text review: recorded (LEGAL_TEXT_REVIEWED is true).');
}
