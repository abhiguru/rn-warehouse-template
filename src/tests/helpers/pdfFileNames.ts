/**
 * WH-185: the document numbers the PDF share tests use, and what file name each must give. A number is shown whole in the
 * file name, a "/" becomes "_", every other run of characters that is no file name character becomes one "-", and the name always ends ".pdf".
 */
import { expect } from '@jest/globals';

export type NameCase = { label: string; number: string; expected: string };

// "@" stands for the document prefix (GRN or DSP), "#" for the plain-number prefix (DV or DD).
const CASES: Array<[string, string, string]> = [
  ['a number with slashes (FY 23-24)', '@/23-24/0042', '@_23-24_0042'],
  ['a number with slashes (FY 24-25)', '@/24-25/0042', '@_24-25_0042'],
  ['a plain number', '#0116', '#0116'],
  ['a number with a space', '@ 23/24 0042', '@-23_24-0042'],
  ['a number with other odd characters', '@\\23:24*0042?', '@-23-24-0042-'],
];

export const nameCases = (kind: 'GRN' | 'Dispatch'): NameCase[] => {
  const stem = kind === 'GRN' ? 'GRN' : 'DSP';
  const plain = kind === 'GRN' ? 'DV' : 'DD';
  const fill = (text: string) => text.replace(/@/g, stem).replace(/#/g, plain);
  return CASES.map(([label, number, name]) => ({ label, number: fill(number), expected: `${kind}_${fill(name)}.pdf` }));
};

/** Every name passed on must be a safe file name. */
export function expectSafeNames(names: string[]): void {
  for (const name of names) {
    expect(name).not.toMatch(/[\\/]/);
    expect(name.endsWith('.pdf')).toBe(true);
  }
}
