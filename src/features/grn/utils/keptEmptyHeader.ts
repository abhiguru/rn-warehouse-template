/**
 * Edit only: a GRN saved without a sender or supervisor (older data) must stay correctable, so a field that was empty when
 * the edit opened and is still empty is not required (WH-230). A field that has a value, or had one and was cleared, is
 * checked as on a new GRN. `header.` keys are the whole-form check's (validateStep3).
 */
type Result = { isValid: boolean; errors: Record<string, string> };
type Header = { sender_name?: string | null; supervisor_name?: string | null; supervisor_id?: string | null };
type LoadedEmpty = { sender: boolean; supervisor: boolean };

const SENDER_KEYS = ['sender_name', 'header.sender_name'];
const SUPERVISOR_KEYS = ['supervisor_id', 'supervisor_name', 'header.supervisor_id', 'header.supervisor_name'];

export const withoutKeptEmptyErrors = (result: Result, header: Header, loadedEmpty: LoadedEmpty): Result => {
  const skip = new Set<string>();
  if (loadedEmpty.sender && !header.sender_name) SENDER_KEYS.forEach((k) => skip.add(k));
  if (loadedEmpty.supervisor && !header.supervisor_name && !header.supervisor_id) SUPERVISOR_KEYS.forEach((k) => skip.add(k));
  if (skip.size === 0) return result;
  const errors = Object.fromEntries(Object.entries(result.errors).filter(([key]) => !skip.has(key)));
  return { isValid: Object.keys(errors).length === 0, errors };
};
