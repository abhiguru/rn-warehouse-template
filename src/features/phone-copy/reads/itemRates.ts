/**
 * `get_standard_rate` over the phone copy (WH-348, product/tech/app-offline-read-more.md section 0): the server's `data`,
 * key for key, for an administrator or a supervisor. Its text is the baseline function, as installed on temp1. Staff are
 * refused online (migration 90), so for them this read does not answer and the server's refusal is shown as today.
 */
import { parseTimestampUs } from '../pgCompat';
import type { CopyReader } from '../readRoute';
import { compareNullsLast, compareNumbers, compareText, numberOf, parseRows, pick, textOf, type Row } from './rows';

export interface StandardRateData {
  tiers: Row[];
  updated_at: string | null;
  updated_by_name: string | null;
}

export async function readStandardRate(q: CopyReader): Promise<StandardRateData> {
  if (q.role === 'staff') throw new Error('the standard rate is refused to staff');
  const tiers = parseRows(await q.all<{ row: string }>('SELECT row FROM standard_rate_tiers'));
  const at = (tier: Row): number | null => parseTimestampUs(textOf(tier.updated_at));
  const byMin = (a: Row, b: Row) => compareNullsLast(numberOf(a.weight_min), numberOf(b.weight_min), compareNumbers);
  // The newest change (ties by the lower band) names who made it; `max(updated_at)` is the stamp the editor sends back.
  const newest = [...tiers].sort((a, b) => compareNullsLast(at(b), at(a), compareNumbers) || byMin(a, b) || compareText(String(a.id), String(b.id)))[0];
  const authorId = textOf(newest?.updated_by);
  const by = authorId === null
    ? null
    : await q.get<{ name: string | null }>("SELECT json_extract(row, '$.name') AS name FROM user_profiles WHERE id = ?", [authorId]);
  const stamps = tiers.filter(tier => at(tier) !== null);
  const latest = stamps.length ? stamps.reduce((a, b) => ((at(b) ?? 0) > (at(a) ?? 0) ? b : a)) : null;
  return {
    tiers: [...tiers].sort(byMin).map(tier => ({
      weight_min: pick(tier, 'weight_min'), weight_max: pick(tier, 'weight_max'), unit_price: pick(tier, 'unit_price'),
      labour_rate: pick(tier, 'labour_rate'), tax_percent: pick(tier, 'tax_percent'),
    })),
    updated_at: latest ? pick(latest, 'updated_at') as string : null,
    updated_by_name: by?.name ?? null,
  };
}
