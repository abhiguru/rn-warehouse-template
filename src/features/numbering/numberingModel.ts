/**
 * The "Document numbers" screen's rules in one place, with no screen in it: which schemes a document type may use,
 * the draft an administrator edits, its checks, the request it makes, the example number it gives and the words for
 * a rule. The server checks the same limits again (migration 127, `apply_document_numbering`).
 */
import { calculateFinancialYear } from '@/utils/invoiceCalculations';
import { indiaDay } from '@/utils/formatters';
import { DOCUMENT_NUMBER_MAX_LENGTH } from '@/constants/documentNumber';
import { formatIdentifier, t } from '@/i18n';
import type { DocumentType, NumberingRule, NumberingRuleInput, NumberingScheme } from '@/services/documentNumberingService';

/** The schemes a type may use, in the order offered. An invoice number is a whole number: year or sequence only. */
export const SCHEMES_BY_TYPE: Record<DocumentType, readonly NumberingScheme[]> = {
  grn: ['letters', 'year', 'sequence', 'free'],
  dispatch: ['letters', 'year', 'sequence', 'free'],
  invoice: ['year', 'sequence'],
};

export const MAX_DIGITS = 7;
export const MAX_NUMBER = 9999999;

/** What an administrator is editing: text as typed, so a half-typed number is kept as typed. */
export interface NumberingDraft {
  scheme: NumberingScheme;
  prefix: string;
  width: string;
  start: string;
  firstLetter: string;
  perLetter: string;
  check: boolean;
}

/** The server's defaults for a field left out of a scheme. */
const DEFAULTS = { prefix: '', width: '4', start: '1', firstLetter: 'A', perLetter: '1000' } as const;

/** The draft for choosing `scheme` on a rule: the stored values when the scheme is the stored one, else the defaults. */
export function draftFor(rule: NumberingRule, scheme: NumberingScheme = rule.scheme): NumberingDraft {
  const same = scheme === rule.scheme;
  return {
    scheme,
    prefix: same ? rule.prefix : DEFAULTS.prefix,
    width: same ? String(rule.width) : DEFAULTS.width,
    start: same ? String(rule.start) : DEFAULTS.start,
    firstLetter: same && rule.first_letter ? rule.first_letter : DEFAULTS.firstLetter,
    perLetter: same && rule.per_letter ? String(rule.per_letter) : DEFAULTS.perLetter,
    check: rule.check,
  };
}

/** The fields a scheme has, for the screen (an invoice has the first number only). */
export type NumberingField = 'firstLetter' | 'width' | 'perLetter' | 'prefix' | 'start';

export function fieldsOf(type: DocumentType, scheme: NumberingScheme): NumberingField[] {
  if (type === 'invoice') return ['start'];
  if (scheme === 'letters') return ['firstLetter', 'width', 'perLetter'];
  if (scheme === 'year' || scheme === 'sequence') return ['prefix', 'width', 'start'];
  return [];
}

/** Whether the "refuse numbers outside the rule" switch applies: not to an invoice, nor to free text. */
export const hasCheck = (type: DocumentType, scheme: NumberingScheme): boolean => type !== 'invoice' && scheme !== 'free';

export type FieldErrorKey =
  | 'numbering.edit.errors.firstLetter'
  | 'numbering.edit.errors.width'
  | 'numbering.edit.errors.perLetter'
  | 'numbering.edit.errors.prefix'
  | 'numbering.edit.errors.start'
  | 'numbering.edit.errors.tooLong';

const whole = (text: string, min: number, max: number): number | null => {
  if (!/^\d{1,7}$/.test(text)) return null;
  const value = Number(text);
  return value >= min && value <= max ? value : null;
};

/** The first problem of each field of the draft, as a text key; empty when the draft can be sent. */
export function draftErrors(type: DocumentType, draft: NumberingDraft): Partial<Record<NumberingField, FieldErrorKey>> {
  const errors: Partial<Record<NumberingField, FieldErrorKey>> = {};
  const fields = fieldsOf(type, draft.scheme);
  if (fields.includes('firstLetter') && !/^[A-Z]$/.test(draft.firstLetter)) errors.firstLetter = 'numbering.edit.errors.firstLetter';
  if (fields.includes('width') && whole(draft.width, 1, MAX_DIGITS) === null) errors.width = 'numbering.edit.errors.width';
  if (fields.includes('perLetter') && whole(draft.perLetter, 1, MAX_NUMBER) === null) errors.perLetter = 'numbering.edit.errors.perLetter';
  if (fields.includes('prefix') && !/^[A-Z0-9/-]{0,10}$/.test(draft.prefix)) errors.prefix = 'numbering.edit.errors.prefix';
  if (fields.includes('start') && whole(draft.start, 1, MAX_NUMBER) === null) errors.start = 'numbering.edit.errors.start';
  // A financial-year number is the prefix, "26-27/" and the digits.
  if (
    type !== 'invoice' &&
    draft.scheme === 'year' &&
    !errors.prefix &&
    !errors.width &&
    draft.prefix.length + 6 + Number(draft.width) > DOCUMENT_NUMBER_MAX_LENGTH
  ) {
    errors.width = 'numbering.edit.errors.tooLong';
  }
  return errors;
}

/** The request for a draft: only the fields that belong to its scheme (the server refuses any other). */
export function ruleInputOf(type: DocumentType, draft: NumberingDraft): NumberingRuleInput {
  const input: NumberingRuleInput = { scheme: draft.scheme };
  for (const field of fieldsOf(type, draft.scheme)) {
    if (field === 'firstLetter') input.first_letter = draft.firstLetter;
    else if (field === 'width') input.width = Number(draft.width);
    else if (field === 'perLetter') input.per_letter = Number(draft.perLetter);
    else if (field === 'prefix') input.prefix = draft.prefix;
    else input.start = Number(draft.start);
  }
  if (hasCheck(type, draft.scheme)) input.check = draft.check;
  return input;
}

/** The request the stored rule would make: a draft sends the same thing when nothing was changed. */
export const ruleInputOfRule = (rule: NumberingRule): NumberingRuleInput => ruleInputOf(rule.document_type, draftFor(rule));

/** Whether the draft would change the stored rule. */
export function draftChanged(rule: NumberingRule, draft: NumberingDraft): boolean {
  const next = ruleInputOf(rule.document_type, draft);
  const current = ruleInputOfRule(rule);
  const keys = new Set([...Object.keys(next), ...Object.keys(current)]) as Set<keyof NumberingRuleInput>;
  return [...keys].some(key => next[key] !== current[key]);
}

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

/** "26-27": the label of today's financial year in a number (the year of the day in India). */
export function financialYearLabelOf(today: string = indiaDay(new Date())): string {
  const year = calculateFinancialYear(today);
  return `${year.slice(2, 4)}-${year.slice(5)}`;
}

/**
 * The first number a draft gives while no number of its format exists yet, as the person will see it. An example for the
 * preview: the next number of a rule in use continues after the numbers already issued with the same format.
 */
export function exampleNumber(type: DocumentType, draft: NumberingDraft, today?: string): string | null {
  if (Object.keys(draftErrors(type, draft)).length > 0) return null;
  const width = Number(draft.width);
  if (type === 'invoice') return String(Number(draft.start));
  switch (draft.scheme) {
    case 'letters':
      return draft.firstLetter + pad(1, width);
    case 'year':
      return `${draft.prefix}${financialYearLabelOf(today)}/${pad(Number(draft.start), width)}`;
    case 'sequence':
      return draft.prefix + pad(Number(draft.start), width);
    case 'free':
      return null;
  }
}

/** The rule in words: "Letter series from A, for example A0001". Numbers of a document are identifiers (0-9); counts are not. */
export function describeRule(rule: NumberingRule, today?: string): string {
  const draft = draftFor(rule);
  const example = formatIdentifier(exampleNumber(rule.document_type, draft, today) ?? '');
  if (rule.document_type === 'invoice') {
    return t(rule.scheme === 'sequence' ? 'numbering.rule.invoiceSequence' : 'numbering.rule.invoiceYear', { start: rule.start });
  }
  switch (rule.scheme) {
    case 'letters':
      return t('numbering.rule.letters', { letter: formatIdentifier(draft.firstLetter), example });
    case 'year':
      return t('numbering.rule.year', { example });
    case 'sequence':
      return t('numbering.rule.sequence', { example });
    case 'free':
      return t('numbering.rule.free');
  }
}

/** The lines under a row of the screen: the rule, whether it is checked, and how many existing numbers do not follow it. */
export function describeRuleLines(rule: NumberingRule, today?: string): string[] {
  const lines = [describeRule(rule, today)];
  if (hasCheck(rule.document_type, rule.scheme)) lines.push(t(rule.check ? 'numbering.rule.checkOn' : 'numbering.rule.checkOff'));
  if (rule.not_following > 0) lines.push(t('numbering.rule.notFollowing', { count: rule.not_following }));
  return lines;
}
