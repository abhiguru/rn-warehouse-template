/**
 * Edit mode of the dispatch review step reads the stock of each lot again from its GRN: one read per distinct GRN
 * number, in parallel; "Checking stock" while it runs; an answer that arrives after the lines changed is dropped; a
 * failed read says "Stock not checked" on ITEMS with a strip and Try again, and Try again reads every GRN again. A new
 * dispatch reads nothing and says how many bags are left.
 */
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { DispatchReviewStep } from '@/features/dispatch/screens/DispatchReviewStep';
import { getGRNDetailByNumber } from '@/features/dispatch/services/grnDetailService';
import { setLanguage } from '@/i18n';
import { reviewHeader, reviewLine } from '@/tests/helpers/dispatchReviewFixtures';

type Answer = Awaited<ReturnType<typeof getGRNDetailByNumber>>;
const mockForm = {
  header: { ...reviewHeader },
  items: [] as ReturnType<typeof reviewLine>[],
  images: [],
  isSaving: false,
  isLoading: false,
  isCreateMode: false,
  dispatchId: 'd1',
  submitForm: jest.fn(),
  navigateToStep: jest.fn(),
  resetFormState: jest.fn(),
  addImageToForm: jest.fn(),
  updateImageUploadProgress: jest.fn(),
  updateImageUploadStatus: jest.fn(),
  removeImageFromForm: jest.fn(),
  validationErrors: {},
};

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/hooks/useDispatchForm', () => ({ useDispatchForm: () => mockForm }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: 'ConfirmDialog' }));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/DispatchStepIndicator', () => ({ DispatchStepIndicator: () => null, dispatchSteps: () => [] }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/features/dispatch/services/dispatchImageService', () => ({
  uploadDeferredDispatchImages: jest.fn(),
  generateTempDispatchId: () => 'temp_dispatch_fixture',
  deleteDispatchImage: jest.fn(),
  prepareDispatchImageForDeferredUpload: jest.fn(),
  uploadDispatchImage: jest.fn(),
}));
jest.mock('@/features/dispatch/services/grnDetailService', () => ({ getGRNDetailByNumber: jest.fn() }));
// The order preview is not what this suite is about: it answers "no preview" without a call.
jest.mock('@/services/orderEffects', () => ({
  ...jest.requireActual('@/services/orderEffects'),
  previewCreateDispatch: jest.fn(async () => null),
  previewUpdateDispatch: jest.fn(async () => null),
}));
jest.mock('@/services/print-service', () => ({ printDispatchRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateDispatchPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));

/** Three lines: l1 and l2 of GRN A101, l3 of GRN A102. Each holds a stored stock of 40. */
const lines = () => [reviewLine(1, { grn: 'A101' }), reviewLine(2, { grn: 'A101' }), reviewLine(3, { grn: 'A102' })];
const answer = (...lots: [string, number][]): Answer =>
  ({ success: true, data: { grn: {}, items: lots.map(([id, stock]) => ({ id, stock })) } }) as unknown as Answer;
const deferred = () => {
  let resolve!: (value: Answer) => void;
  const promise = new Promise<Answer>((done) => { resolve = done; });
  return { promise, resolve };
};

let tree: ReactTestRenderer;
const renderAs = async (mode: 'create' | 'edit') => {
  mockForm.isCreateMode = mode === 'create';
  mockForm.items = lines();
  await act(async () => { tree = create(<DispatchReviewStep mode={mode} />); });
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => { tree.unmount(); });
  setLanguage('en');
  jest.restoreAllMocks();
});

const textOf = (node: ReactTestInstance): string[] =>
  node.findAll((n) => (n.type as unknown) === 'Text').map((n) => [n.props.children].flat().join('').replace(/\u00A0/g, ' '));
const all = () => textOf(tree.root);
const count = (text: string) => all().filter((candidate) => candidate === text).length;
const find = (id: string) => tree.root.findAll((n) => n.props.testID === id && typeof n.type === 'string');
const itemsToggle = () => tree.root.find((n) => n.props.testID === 'dispatch-review-section-items' && typeof n.props.onPress === 'function');

describe('an edited dispatch', () => {
  it('reads each distinct GRN once, all at the same time, and shows "Checking stock" until they answer', async () => {
    const a = deferred();
    const b = deferred();
    jest.mocked(getGRNDetailByNumber).mockImplementation((number) => (number === 'A101' ? a.promise : b.promise));
    await renderAs('edit');

    // Three lines, two GRNs: two reads, both started before either answered.
    expect(getGRNDetailByNumber).toHaveBeenCalledTimes(2);
    expect(jest.mocked(getGRNDetailByNumber).mock.calls.map(([number]) => number).sort()).toEqual(['A101', 'A102']);
    expect(count('Checking stock')).toBe(3);
    expect(all().some((text) => /in stock|left/.test(text))).toBe(false);
    expect(itemsToggle().props.accessibilityLabel).toBe('Items, 3');

    await act(async () => { a.resolve(answer(['l1', 90], ['l2', 12])); });
    // One GRN answered, the other not: the whole table waits, so no half-checked figures.
    expect(count('Checking stock')).toBe(3);

    await act(async () => { b.resolve(answer(['l3', 0])); });
    expect(count('Checking stock')).toBe(0);
    expect(all().filter((text) => /in stock/.test(text))).toEqual(['90 in stock', '12 in stock', '0 in stock']);
    expect(find('dispatch-review-stock-error')).toHaveLength(0);
  });

  it('asks for the lots with no stock too (includeZeroStock), so a line that took the last bags shows 0', async () => {
    jest.mocked(getGRNDetailByNumber).mockResolvedValue(answer(['l1', 0], ['l2', 0], ['l3', 0]));
    await renderAs('edit');

    expect(getGRNDetailByNumber).toHaveBeenCalledTimes(2);
    expect(jest.mocked(getGRNDetailByNumber).mock.calls.map(([number, includeZeroStock]) => [number, includeZeroStock]).sort()).toEqual([
      ['A101', true],
      ['A102', true],
    ]);
  });

  it('a lot missing from the answer of its GRN keeps its stored stock (40)', async () => {
    // A101 answers for l1 only; l2 is not in the answer, so it falls back to the stored figure.
    jest.mocked(getGRNDetailByNumber).mockImplementation(async (number) => (number === 'A101' ? answer(['l1', 90]) : answer(['l3', 5])));
    await renderAs('edit');

    expect(all().filter((text) => /in stock/.test(text))).toEqual(['90 in stock', '40 in stock', '5 in stock']);
    expect(find('dispatch-review-stock-error')).toHaveLength(0);
  });

  it('drops an answer that arrives after the lines changed', async () => {
    const stale = deferred();
    const staleToo = deferred();
    const fresh = deferred();
    jest.mocked(getGRNDetailByNumber).mockImplementation((number) => (number === 'A101' ? stale.promise : number === 'A102' ? staleToo.promise : fresh.promise));
    await renderAs('edit');
    expect(getGRNDetailByNumber).toHaveBeenCalledTimes(2);

    // The lines become one line of another GRN.
    mockForm.items = [reviewLine(4, { grn: 'A103' })];
    jest.mocked(getGRNDetailByNumber).mockClear();
    await act(async () => { tree.update(<DispatchReviewStep mode="edit" />); });
    expect(jest.mocked(getGRNDetailByNumber).mock.calls.map(([number]) => number)).toEqual(['A103']);

    await act(async () => { fresh.resolve(answer(['l4', 25])); });
    expect(all().filter((text) => /in stock/.test(text))).toEqual(['25 in stock']);

    // The first reads answer late, with figures for lots that are no longer there: nothing changes.
    await act(async () => { stale.resolve(answer(['l1', 777])); staleToo.resolve(answer(['l4', 777])); });
    expect(all().filter((text) => /in stock/.test(text))).toEqual(['25 in stock']);
    expect(all().some((text) => text.includes('777'))).toBe(false);
  });

  it('a failed read puts "Stock not checked" on ITEMS with a strip, and no figure on the lines', async () => {
    jest.mocked(getGRNDetailByNumber).mockImplementation(async (number) => (number === 'A101' ? answer(['l1', 90], ['l2', 12]) : ({ success: false, error: 'x' } as Answer)));
    await renderAs('edit');

    expect(getGRNDetailByNumber).toHaveBeenCalledTimes(2);
    expect(count('Stock not checked')).toBe(1);
    expect(itemsToggle().props.accessibilityLabel).toBe('Items, 3, Stock not checked');
    expect(textOf(find('dispatch-review-stock-error')[0])).toEqual(["Couldn't check the stock of these lots. Check your connection and try again.", 'Try again']);
    // The message is the shared strip: one element a screen reader announces as "Error: ..."
    expect(tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityLabel === "Error: Couldn't check the stock of these lots. Check your connection and try again.")).toHaveLength(1);
    // Not the stored 40, not the half that was read: no stock tag at all.
    expect(all().some((text) => /in stock|left|Checking stock/.test(text))).toBe(false);
    // Everything else on the lines is still there.
    expect(all()).toEqual(expect.arrayContaining(['Fictional item 1', 'A101/100', 'Rack R3']));
  });

  it('a read that throws is a failed read', async () => {
    jest.mocked(getGRNDetailByNumber).mockRejectedValue(new Error('network'));
    await renderAs('edit');

    expect(count('Stock not checked')).toBe(1);
    expect(find('dispatch-review-stock-retry')).toHaveLength(1);
  });

  it('Try again reads every GRN again and, when they answer, the strip and the tag go', async () => {
    jest.mocked(getGRNDetailByNumber).mockImplementation(async () => ({ success: false } as Answer));
    await renderAs('edit');
    expect(getGRNDetailByNumber).toHaveBeenCalledTimes(2);
    expect(count('Stock not checked')).toBe(1);

    const retry = deferred();
    jest.mocked(getGRNDetailByNumber).mockImplementation(() => retry.promise);
    const retryButton = tree.root.find((n) => n.props.testID === 'dispatch-review-stock-retry' && typeof n.props.onPress === 'function');
    expect(retryButton.props.accessibilityLabel).toBe('Try again');
    await act(async () => { retryButton.props.onPress(); });

    // Both GRNs asked again; while they run the lines say "Checking stock" and the failure is gone.
    expect(getGRNDetailByNumber).toHaveBeenCalledTimes(4);
    expect(count('Checking stock')).toBe(3);
    expect(count('Stock not checked')).toBe(0);
    expect(find('dispatch-review-stock-error')).toHaveLength(0);

    await act(async () => { retry.resolve(answer(['l1', 90], ['l2', 12], ['l3', 5])); });
    expect(all().filter((text) => /in stock/.test(text))).toEqual(['90 in stock', '12 in stock', '5 in stock']);
    expect(count('Stock not checked')).toBe(0);
  });

  it('logs a failed read without writing to the console log', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(getGRNDetailByNumber).mockResolvedValue({ success: false } as Answer);
    await renderAs('edit');
    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('a new dispatch', () => {
  it('reads no stock and says how many bags are left after this dispatch', async () => {
    await renderAs('create');

    expect(getGRNDetailByNumber).not.toHaveBeenCalled();
    // Stock 40 at the start, 5 bags dispatched: 35 left, on each of the three lines.
    expect(all().filter((text) => /left/.test(text))).toEqual(['35 left', '35 left', '35 left']);
    expect(count('Checking stock')).toBe(0);
    expect(find('dispatch-review-stock-error')).toHaveLength(0);
  });
});
