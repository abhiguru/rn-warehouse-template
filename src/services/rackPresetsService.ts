/**
 * The facility's Floor and Chamber buttons for a rack (backend migration 131): `get_rack_presets` for everyone who
 * makes GRNs, `set_rack_presets` for administrators and supervisors. A backend older than 131 has neither: the reader
 * answers null (PGRST202) and the app keeps the built-in buttons and hides the settings row.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { getSessionGeneration } from '@/config/sessionLifecycle';
import { registerSessionScoped } from '@/config/sessionScopedRegistry';
import { t } from '@/i18n';
import { AppError } from '@/utils/appError';
import { refusalOf, type ServerRefusal } from '@/utils/serverRefusal';
import { handleGlobalAuthError } from '@/utils/serviceErrorHandler';
import { serverText } from '@/utils/serverText';
import { DEFAULT_RACK_PRESETS, type RackPresets } from '@/features/grn/rackPresets';

export interface RackPresetsAnswer extends RackPresets {
  version: number;
  maxLabelLength: number;
  maxPerList: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const labels = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? (value as string[]) : null;

/** The setting is not on this backend (migration 131 not applied): PostgREST says the function does not exist. */
const isMissingFunction = (error: unknown): boolean => {
  const e = error as { code?: unknown; message?: unknown } | null;
  return e?.code === 'PGRST202' || (typeof e?.message === 'string' && /could not find the function/i.test(e.message));
};

const asAnswer = (data: unknown): RackPresetsAnswer | null => {
  if (!isRecord(data) || data.success === false) return null;
  const floor = labels(data.floor);
  const chamber = labels(data.chamber);
  if (!floor || !chamber) return null;
  const whole = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
  return {
    floor,
    chamber,
    version: whole(data.version, 1),
    maxLabelLength: whole(data.max_label_length, 12),
    maxPerList: whole(data.max_per_list, 20),
  };
};

// Read once per session and server; a screen that changes the lists replaces it.
let cached: { generation: number; answer: RackPresetsAnswer | null } | null = null;

/** Tests, and a change of session or server. */
export function resetRackPresetsCache(): void {
  cached = null;
}
registerSessionScoped('rack-presets', () => resetRackPresetsCache(), { onGenerationChange: true });

/**
 * The lists of this facility; null when the backend has no such setting. A failure other than that throws, and
 * the caller keeps the built-in buttons for now.
 */
export async function getRackPresets(options: { refresh?: boolean } = {}): Promise<RackPresetsAnswer | null> {
  const generation = getSessionGeneration();
  if (!options.refresh && cached && cached.generation === generation) return cached.answer;
  const client = await getAuthenticatedClient();
  const { data, error } = await client.rpc('get_rack_presets');
  if (generation !== getSessionGeneration()) throw new AppError('SESSION_CHANGED', t('errors.auth.sessionChanged'));
  if (error) {
    if (isMissingFunction(error)) {
      cached = { generation, answer: null };
      return null;
    }
    handleGlobalAuthError(error);
    throw new Error(serverText(error.message, t('settings.rackPresets.loadFailed')));
  }
  const answer = asAnswer(data);
  if (!answer) throw new Error(t('settings.rackPresets.loadFailed'));
  cached = { generation, answer };
  return answer;
}

/** The lists the form shows: the facility's, or the built-in ones when there are none or they could not be read. */
export async function rackPresetsForForm(): Promise<RackPresets> {
  try {
    const answer = await getRackPresets();
    return answer ? { floor: answer.floor, chamber: answer.chamber } : DEFAULT_RACK_PRESETS;
  } catch {
    return DEFAULT_RACK_PRESETS;
  }
}

/** The app's sentence for a refusal of `set_rack_presets`. */
export function rackPresetsRefusalText(refusal: ServerRefusal): string | undefined {
  const field = (name: string) => (typeof refusal.fields[name] === 'string' ? (refusal.fields[name] as string) : '');
  const number = (name: string) => (typeof refusal.fields[name] === 'number' ? (refusal.fields[name] as number) : 0);
  const listName = field('list') === 'chamber' ? t('common.chamber') : t('grn.item.floor');
  switch (refusal.reason) {
    case 'PRESETS_CHANGED':
      return t('settings.rackPresets.changed');
    case 'LABEL_EMPTY':
      return t('settings.rackPresets.errEmpty', { list: listName });
    case 'LABEL_TOO_LONG':
      return t('settings.rackPresets.errTooLong', { label: field('label'), limit: number('limit') || 12 });
    case 'LABEL_CHARACTER':
      return t('settings.rackPresets.errCharacter', { label: field('label') });
    case 'LABEL_DUPLICATE':
      return t('settings.rackPresets.errDuplicate', { label: field('label') });
    case 'TOO_MANY':
      return t('settings.rackPresets.errTooMany', { list: listName, limit: number('limit') || 20 });
    default:
      return undefined;
  }
}

export type SaveRackPresetsResult =
  | { ok: true; answer: RackPresetsAnswer; changed: boolean }
  | { ok: false; message: string; changedByOthers: boolean };

/**
 * Saves the lists. `version` is the one the person read: a save from an older list is refused (PRESETS_CHANGED).
 * The same lists sent again after a lost answer succeed with `changed: false`, so a resend is safe.
 */
export async function setRackPresets(presets: RackPresets, version: number): Promise<SaveRackPresetsResult> {
  const generation = getSessionGeneration();
  const client = await getAuthenticatedClient();
  const { data, error } = await client.rpc('set_rack_presets', { p_floor: presets.floor, p_chamber: presets.chamber, p_version: version });
  if (generation !== getSessionGeneration()) throw new AppError('SESSION_CHANGED', t('errors.auth.sessionChanged'));
  if (error) {
    handleGlobalAuthError(error);
    return { ok: false, message: serverText(error.message, t('settings.rackPresets.saveFailed'), { write: true, form: true }), changedByOthers: false };
  }
  const refusal = refusalOf(data);
  if (refusal) {
    return {
      ok: false,
      message: rackPresetsRefusalText(refusal) ?? t('settings.rackPresets.saveFailed'),
      changedByOthers: refusal.reason === 'PRESETS_CHANGED',
    };
  }
  const answer = asAnswer(data);
  if (!answer) return { ok: false, message: t('settings.rackPresets.saveFailed'), changedByOthers: false };
  cached = { generation, answer };
  return { ok: true, answer, changed: isRecord(data) && data.changed === true };
}
