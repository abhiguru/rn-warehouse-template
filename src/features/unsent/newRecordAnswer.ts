/**
 * What the server's answer to a new GRN or dispatch means (WH-161, product/tech/app-offline-new-records.md 17.1, 17.2): the
 * refusal code by one rule, and the flat result a photos item and the screens read. Shared by the two kinds and the Save path.
 */
import { answerCodeOf } from './refusalAnswer';
import { classify } from './sendEngine';
import type { SendOutcome } from './sendKinds';

type Fields = Record<string, unknown>;
const isFields = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The code of a refusal: its `reason` when it has one, else its `error_code` unless that is WH409 (one rule, 17.1). */
export const refusalCodeOf = answerCodeOf;

/** The server's own sentence of a refusal, or its code when it said none. */
const sentenceOf = (answer: Fields, code: string | null): string => {
  for (const text of [answer.error, answer.message]) if (typeof text === 'string' && text !== '') return text;
  return code ?? '';
};

/** Everything of the answer but its `success` flag, as flat members: `save_grn` keeps its figures under `data`. */
function flatResult(doc: 'grn' | 'dispatch', answer: Fields): Fields | null {
  if (doc === 'grn') {
    const data = isFields(answer.data) ? answer.data : null;
    if (!data || typeof data.grn_id !== 'string') return null;
    return { grn_id: data.grn_id, gr_no: data.gr_no, item_mapping: Array.isArray(data.item_mapping) ? data.item_mapping : [] };
  }
  if (typeof answer.dispatch_id !== 'string') return null;
  return {
    dispatch_id: answer.dispatch_id,
    disp_no: answer.disp_no,
    ...(answer.order_effects === undefined ? {} : { order_effects: answer.order_effects }),
  };
}

/** The outcome of one answer of `save_grn` or `create_dispatch_with_stock_check`; `error` is what the call failed with. */
export function outcomeOfAnswer(doc: 'grn' | 'dispatch', answer: unknown, error: unknown = null): SendOutcome {
  if (error !== null && error !== undefined && error !== false) return classify(null, error);
  if (!isFields(answer)) return classify(answer, null);
  if (answer.success === true) {
    const result = flatResult(doc, answer);
    // A success that names no record is no answer to act on: asked about again by its request ID.
    return result ? { kind: 'sent', result } : { kind: 'lost' };
  }
  if (answer.success === false) {
    const code = refusalCodeOf(answer);
    return { kind: 'refused', reason: sentenceOf(answer, code), ...(code ? { code } : {}), answer };
  }
  return classify(answer, null);
}
