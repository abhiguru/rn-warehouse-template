/**
 * The facility settings the editors show, over the phone copy (WH-348, product/tech/app-offline-read-more.md section 14.4):
 * the charging rule, the document numbering, the GST details and "can make bills", from the `settings` rows the feed
 * stores as it sends them. Who may read each is who the server's function admits: the charging rule and the GST details
 * are for administrators, the numbering for administrators and supervisors; for any other role the read does not answer
 * and the server's refusal is shown as today (contract section 2, roles).
 */
import type { CopyReader } from '../readRoute';
import { parseRow, pick, type Row } from './rows';

const DOCUMENT_TYPES = ['grn', 'dispatch', 'invoice'] as const;

async function body(q: CopyReader, id: string): Promise<Row | null> {
  const found = await q.get<{ row: string }>('SELECT row FROM settings WHERE id = ?', [id]);
  return found ? parseRow(found.row) : null;
}
function refuse(q: CopyReader, roles: readonly CopyReader['role'][], what: string): void {
  if (!roles.includes(q.role)) throw new Error(`${what} is refused to this role`);
}

/** `get_charging_rule`: `{ success, rule }`. The rule is the feed's body with the name of who last changed it, when it can be found. */
export async function readChargingRule(q: CopyReader): Promise<Row | null> {
  refuse(q, ['admin'], 'the charging rule');
  const rule = await body(q, 'charging_rule');
  if (!rule) return null;
  const author = typeof rule.updated_by === 'string'
    ? await q.get<{ name: string | null }>("SELECT json_extract(row, '$.name') AS name FROM user_profiles WHERE id = ?", [rule.updated_by])
    : null;
  return { success: true, rule: { ...rule, updated_by_name: author?.name ?? null } };
}

/**
 * `get_document_numbering`: `{ success, rules }` in the order GRN, dispatch, invoice. The copy does not carry the hint, the
 * count of existing documents or the count of those not following the rule: they are null here, and the screen does not
 * show them offline. `server_issues` is for the phone's own numbers and is left out.
 */
export async function readDocumentNumbering(q: CopyReader): Promise<Row | null> {
  refuse(q, ['admin', 'supervisor'], 'the document numbering');
  const numbering = await body(q, 'numbering');
  if (!numbering) return null;
  const rules = DOCUMENT_TYPES.map(type => {
    const rule = (typeof numbering[type] === 'object' && numbering[type] !== null ? numbering[type] : {}) as Row;
    const fields = Object.fromEntries(Object.entries(rule).filter(([key]) => key !== 'server_issues'));
    return { document_type: type, ...fields, hint: null, existing_documents: null, not_following: null };
  });
  return { success: true, rules };
}

/** `get_gst_details`: the details as the feed sends them (the body of the answer, without `success`). */
export async function readGstDetails(q: CopyReader): Promise<Row | null> {
  refuse(q, ['admin'], 'the GST details');
  return body(q, 'gst_details');
}

/** `can_make_bills`: `{ allowed }`, or null when the copy has none. */
export async function readBillsAllowed(q: CopyReader): Promise<boolean | null> {
  const row = await body(q, 'bills_allowed');
  const allowed = pick(row, 'allowed');
  return typeof allowed === 'boolean' ? allowed : null;
}
