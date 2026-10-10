/**
 * Reads what a user typed into a list's search field.
 *
 * Most of it is text for the server to match. A date ("7 Oct", "7/10/2026",
 * "today", "Oct 2026"), a number range ("A0010-A0020", "10 to 20") or a
 * financial year ("FY 2026") is recognised and returned separately so the list
 * can show it as a chip. At most one of each is taken; the rest stays text.
 * A bare number or a month name alone is never guessed at.
 */
import { toLocalISODate } from '@/utils/formatters';

export interface QuickSearchOptions {
  today?: Date;
  dates?: boolean;
  /** 'document': A0010-A0020. 'integer': 10-20. */
  range?: 'document' | 'integer' | null;
  financialYear?: boolean;
}

export interface QuickSearchResult {
  /** Words to match as text, in the order typed. */
  text: string;
  date?: { from: string; to: string };
  range?: { from: string; to: string };
  financialYear?: number;
}

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4,
  jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

const fullYear = (text: string): number | null => {
  if (/^\d{4}$/.test(text)) return Number(text);
  if (/^\d{2}$/.test(text)) return 2000 + Number(text);
  return null;
};

/** A real calendar day, or null (31 Feb is not a date). */
function calendarDay(year: number, month: number, dayOfMonth: number): string | null {
  const date = new Date(year, month, dayOfMonth);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== dayOfMonth) return null;
  return toLocalISODate(date);
}

const single = (iso: string | null) => (iso ? { from: iso, to: iso } : null);

/** Try to read `words` (one to three of them) as one date or one month. */
function readDate(words: string[], today: Date): { from: string; to: string } | null {
  const lower = words.map(word => word.toLowerCase());
  if (lower.length === 1) {
    const [word] = lower;
    if (word === 'today') return single(toLocalISODate(today));
    if (word === 'yesterday') {
      return single(toLocalISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)));
    }
    // 7/10, 7/10/2026, 07/10/26 with a slash; with dashes or dots only when the year is given.
    const slash = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(word);
    const dashed = /^(\d{1,2})[-.](\d{1,2})[-.](\d{2}|\d{4})$/.exec(word);
    const parts = slash ?? dashed;
    if (parts) {
      const year = parts[3] ? fullYear(parts[3]) : today.getFullYear();
      if (year === null) return null;
      return single(calendarDay(year, Number(parts[2]) - 1, Number(parts[1])));
    }
    return null;
  }
  if (lower.length === 2) {
    const [first, second] = lower;
    // "7 oct"
    if (/^\d{1,2}$/.test(first) && second in MONTHS) {
      return single(calendarDay(today.getFullYear(), MONTHS[second], Number(first)));
    }
    // "oct 2026": the whole month
    if (first in MONTHS && /^\d{4}$/.test(second)) {
      const year = Number(second);
      const month = MONTHS[first];
      return {
        from: toLocalISODate(new Date(year, month, 1)),
        to: toLocalISODate(new Date(year, month + 1, 0)),
      };
    }
    return null;
  }
  // "7 oct 2026", "07 oct 26"
  const [dayText, monthText, yearText] = lower;
  const year = fullYear(yearText);
  if (/^\d{1,2}$/.test(dayText) && monthText in MONTHS && year !== null) {
    return single(calendarDay(year, MONTHS[monthText], Number(dayText)));
  }
  return null;
}

const DOCUMENT = /^([A-Za-z]{1,4})(\d+)$/;

function readRange(from: string, to: string, kind: 'document' | 'integer'): { from: string; to: string } | null {
  if (kind === 'integer') {
    if (!/^\d+$/.test(from) || !/^\d+$/.test(to) || Number(from) > Number(to)) return null;
    return { from: String(Number(from)), to: String(Number(to)) };
  }
  const left = DOCUMENT.exec(from);
  const right = DOCUMENT.exec(to);
  if (!left || !right || left[1].toLowerCase() !== right[1].toLowerCase()) return null;
  return { from, to };
}

export function parseQuickSearch(input: string, options: QuickSearchOptions = {}): QuickSearchResult {
  const today = options.today ?? new Date();
  const words = input.trim().split(/\s+/).filter(Boolean);
  const result: QuickSearchResult = { text: '' };
  const text: string[] = [];

  let index = 0;
  while (index < words.length) {
    const word = words[index];

    if (options.financialYear && result.financialYear === undefined) {
      // "fy2026", "fy 2026", "fy 2026-27"
      const joined = /^fy(\d{4})(?:-\d{2,4})?$/i.exec(word);
      const next = /^fy$/i.test(word) ? /^(\d{4})(?:-\d{2,4})?$/.exec(words[index + 1] ?? '') : null;
      if (joined) {
        result.financialYear = Number(joined[1]);
        index += 1;
        continue;
      }
      if (next) {
        result.financialYear = Number(next[1]);
        index += 2;
        continue;
      }
    }

    if (options.range && !result.range) {
      // "A0010 to A0020" before "A0010-A0020", so "to" is not left behind as text.
      if ((words[index + 1] ?? '').toLowerCase() === 'to' && words[index + 2]) {
        const range = readRange(word, words[index + 2], options.range);
        if (range) {
          result.range = range;
          index += 3;
          continue;
        }
      }
      const hyphen = /^([^-]+)-([^-]+)$/.exec(word);
      const range = hyphen ? readRange(hyphen[1], hyphen[2], options.range) : null;
      if (range) {
        result.range = range;
        index += 1;
        continue;
      }
    }

    if (options.dates && !result.date) {
      // Longest reading first: "7 oct 2026" before "7 oct".
      let taken = 0;
      for (const length of [3, 2, 1]) {
        if (index + length > words.length) continue;
        const date = readDate(words.slice(index, index + length), today);
        if (date) {
          result.date = date;
          taken = length;
          break;
        }
      }
      if (taken > 0) {
        index += taken;
        continue;
      }
    }

    text.push(word);
    index += 1;
  }

  result.text = text.join(' ');
  return result;
}
