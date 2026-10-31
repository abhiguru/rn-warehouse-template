import { getRackPresets, rackPresetsForForm, resetRackPresetsCache, setRackPresets } from '../rackPresetsService';
import { DEFAULT_RACK_PRESETS } from '@/features/grn/rackPresets';

const mockRpc = jest.fn();
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: async () => ({ rpc: mockRpc }) }));
jest.mock('@/config/sessionLifecycle', () => ({ getSessionGeneration: () => 1 }));
jest.mock('@/utils/serviceErrorHandler', () => ({ handleGlobalAuthError: jest.fn() }));

const answer = (over: Record<string, unknown> = {}) => ({
  success: true,
  floor: ['BASE', 'F1'],
  chamber: ['C4'],
  version: 3,
  updated_at: null,
  max_label_length: 12,
  max_per_list: 20,
  ...over,
});

beforeEach(() => {
  mockRpc.mockReset();
  resetRackPresetsCache();
});

describe('get_rack_presets', () => {
  it('reads the lists once and keeps them', async () => {
    mockRpc.mockResolvedValue({ data: answer(), error: null });
    expect(await getRackPresets()).toMatchObject({ floor: ['BASE', 'F1'], chamber: ['C4'], version: 3, maxLabelLength: 12, maxPerList: 20 });
    await getRackPresets();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    await getRackPresets({ refresh: true });
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('answers null on an older backend (PGRST202), and the form keeps the built-in buttons', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_rack_presets' } });
    expect(await getRackPresets()).toBeNull();
    expect(await rackPresetsForForm()).toEqual(DEFAULT_RACK_PRESETS);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('keeps the built-in buttons for the form when the read fails otherwise', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '57014', message: 'timeout' } });
    expect(await rackPresetsForForm()).toEqual(DEFAULT_RACK_PRESETS);
  });

  it('gives the form the facility\'s lists', async () => {
    mockRpc.mockResolvedValue({ data: answer(), error: null });
    expect(await rackPresetsForForm()).toEqual({ floor: ['BASE', 'F1'], chamber: ['C4'] });
  });
});

describe('set_rack_presets', () => {
  it('sends both lists and the version that was read, and returns the new answer', async () => {
    mockRpc.mockResolvedValue({ data: answer({ floor: ['A'], version: 4, changed: true }), error: null });
    const result = await setRackPresets({ floor: ['A'], chamber: ['C4'] }, 3);
    expect(mockRpc).toHaveBeenCalledWith('set_rack_presets', { p_floor: ['A'], p_chamber: ['C4'], p_version: 3 });
    expect(result).toMatchObject({ ok: true, changed: true, answer: { version: 4, floor: ['A'] } });
  });

  it('the same lists sent again succeed with changed false', async () => {
    mockRpc.mockResolvedValue({ data: answer({ changed: false }), error: null });
    expect(await setRackPresets({ floor: ['BASE', 'F1'], chamber: ['C4'] }, 3)).toMatchObject({ ok: true, changed: false });
  });

  it.each([
    ['PRESETS_CHANGED', {}, 'Someone else changed the rack buttons. Reload to see their changes.', true],
    ['LABEL_EMPTY', { list: 'floor', index: 0 }, 'A Floor button has no name. Type one or remove it.', false],
    ['LABEL_TOO_LONG', { list: 'floor', index: 0, label: 'ABCDEFGHIJKLM', limit: 12 }, '"ABCDEFGHIJKLM" is too long. A name can have at most 12 characters.', false],
    ['LABEL_CHARACTER', { list: 'floor', index: 0, label: 'A/B' }, '"A/B" has a character that is not allowed. Do not use "/".', false],
    ['LABEL_DUPLICATE', { list: 'chamber', index: 1, label: 'C4' }, '"C4" is there twice. Each name can be used once.', false],
    ['TOO_MANY', { list: 'chamber', limit: 20 }, 'There can be at most 20 Chamber buttons.', false],
  ])('words the refusal %s in the app\'s text', async (reason, fields, message, changedByOthers) => {
    mockRpc.mockResolvedValue({ data: { success: false, error_code: 'WH409', reason, error: 'English', ...fields }, error: null });
    expect(await setRackPresets({ floor: ['x'], chamber: [] }, 3)).toEqual({ ok: false, message, changedByOthers });
  });
});
