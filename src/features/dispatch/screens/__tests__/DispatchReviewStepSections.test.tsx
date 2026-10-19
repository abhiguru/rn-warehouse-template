/**
 * The dispatch review step's folding card: DETAILS, PHOTOS (create only) and ITEMS (n), one open at a time with ITEMS
 * open when the step opens, a closed section's one-line summary, and the Edit pencils to steps 1 and 2.
 */
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { DispatchReviewStep } from '@/features/dispatch/screens/DispatchReviewStep';
import { getGRNDetailByNumber } from '@/features/dispatch/services/grnDetailService';
import { setLanguage } from '@/i18n';
import { reviewHeader, reviewLine } from '@/tests/helpers/dispatchReviewFixtures';

const mockForm = {
  header: { ...reviewHeader },
  items: [reviewLine(1), reviewLine(2)] as ReturnType<typeof reviewLine>[],
  images: [] as { id: string; file_name: string; image_url: string; upload_status: string }[],
  isSaving: false,
  isLoading: false,
  isCreateMode: true,
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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/features/dispatch/services/dispatchImageService', () => ({
  uploadDeferredDispatchImages: jest.fn(),
  unpreparedDispatchPhotos: () => 'ready',
  generateTempDispatchId: () => 'temp_dispatch_fixture',
  deleteDispatchImage: jest.fn(),
  prepareDispatchImageForDeferredUpload: jest.fn(),
  uploadDispatchImage: jest.fn(),
}));
jest.mock('@/features/dispatch/services/grnDetailService', () => ({ getGRNDetailByNumber: jest.fn() }));
jest.mock('@/services/print-service', () => ({ printDispatchRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateDispatchPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));

let tree: ReactTestRenderer;
const render = async (mode: 'create' | 'edit' = 'create') => {
  mockForm.isCreateMode = mode === 'create';
  await act(async () => { tree = create(<DispatchReviewStep mode={mode} />); });
};
beforeEach(() => {
  jest.clearAllMocks();
  mockForm.images = [];
  jest.mocked(getGRNDetailByNumber).mockResolvedValue({ success: true, data: { grn: {}, items: [{ id: 'l1', stock: 40 }, { id: 'l2', stock: 40 }] } } as unknown as Awaited<ReturnType<typeof getGRNDetailByNumber>>);
});
afterEach(async () => {
  await act(async () => { tree.unmount(); });
  setLanguage('en');
});

const textOf = (node: ReactTestInstance): string[] =>
  node.findAll((n) => (n.type as unknown) === 'Text').map((n) => [n.props.children].flat().join('').replace(/\u00A0/g, ' '));
/** The one node that carries this test id together with onPress. */
const pressable = (id: string) => tree.root.find((n) => n.props.testID === id && typeof n.props.onPress === 'function');
const press = async (id: string) => { await act(async () => { pressable(id).props.onPress(); }); };
const isOpen = (section: string) => pressable(`dispatch-review-section-${section}`).props.accessibilityState.expanded as boolean;
const sectionsOpen = () => ['details', 'photos', 'items'].filter((section) => tree.root.findAll((n) => n.props.testID === `dispatch-review-section-${section}`).length > 0 && isOpen(section));
const hidden = (section: string) => {
  const body = tree.root.find((n) => n.props.testID === `dispatch-review-body-${section}` && typeof n.type === 'string');
  return [body.props.style].flat(3).some((style: { display?: string } | undefined) => style?.display === 'none');
};

describe('the sections of a new dispatch', () => {
  it('has DETAILS, PHOTOS and ITEMS (2), with ITEMS the only one open and the other two folded away', async () => {
    await render();

    expect(['details', 'photos', 'items'].map((section) => pressable(`dispatch-review-section-${section}`).props.accessibilityLabel)).toEqual([
      'Dispatch details, I0042 · 1 Oct 2026 · Fictional Traders',
      'Photos, No photos yet',
      'Items, 2',
    ]);
    expect(textOf(tree.root)).toEqual(expect.arrayContaining(['DISPATCH DETAILS', 'PHOTOS', 'ITEMS (2)']));
    expect(sectionsOpen()).toEqual(['items']);
    expect(hidden('details')).toBe(true);
    expect(hidden('photos')).toBe(true);
    expect(hidden('items')).toBe(false);
  });

  it('shows the closed sections as one line under the heading', async () => {
    await render();

    const line = (section: string) => textOf(tree.root.find((n) => n.props.testID === `dispatch-review-section-${section}-line`));
    expect(line('details')).toEqual(['I0042 · 1 Oct 2026 · Fictional Traders']);
    expect(line('photos')).toEqual(['No photos yet']);
    // ITEMS is open: no summary line under its heading.
    expect(tree.root.findAll((n) => n.props.testID === 'dispatch-review-section-items-line')).toHaveLength(0);
    await press('dispatch-review-section-details');
    expect(textOf(tree.root.find((n) => n.props.testID === 'dispatch-review-section-items-line'))).toEqual(['Total quantity 10']);
  });

  it('opens one at a time: DETAILS, then PHOTOS, then PHOTOS again to close all', async () => {
    await render();
    expect(sectionsOpen()).toEqual(['items']);

    await press('dispatch-review-section-details');
    expect(sectionsOpen()).toEqual(['details']);
    expect(hidden('items')).toBe(true);
    expect(textOf(tree.root.find((n) => n.props.testID === 'dispatch-review-body-details'))).toEqual(
      expect.arrayContaining(['Dispatch number', 'I0042', 'Customer', 'Fictional Traders', 'Address', '12 Sample Road, Samplepur', 'Mobile number', '+91 98765 43210', 'Vehicle', 'GJ01AB1234', 'Supervisor', 'Asha', 'Notes', 'Fictional note', 'Total items', '2', 'GRNs', 'Total quantity', '10'])
    );

    await press('dispatch-review-section-photos');
    expect(sectionsOpen()).toEqual(['photos']);
    expect(hidden('details')).toBe(true);

    await press('dispatch-review-section-photos');
    expect(sectionsOpen()).toEqual([]);
  });

  it('counts the photos in the heading and the closed line', async () => {
    mockForm.images = [
      { id: 'p1', file_name: 'a.webp', image_url: 'file:///a.webp', upload_status: 'completed' },
      { id: 'p2', file_name: 'b.webp', image_url: 'file:///b.webp', upload_status: 'completed' },
    ];
    await render();

    expect(pressable('dispatch-review-section-photos').props.accessibilityLabel).toBe('Photos, 2, 2 photos');
    expect(textOf(tree.root)).toContain('PHOTOS (2)');
  });

  it('the Edit pencils go to step 1 (details) and step 2 (items); Back goes to step 2; PHOTOS has no pencil', async () => {
    await render();

    await press('dispatch-review-section-details-edit');
    expect(mockForm.navigateToStep).toHaveBeenLastCalledWith(1);
    expect(pressable('dispatch-review-section-details-edit').props.accessibilityLabel).toBe('Edit dispatch details');

    await press('dispatch-review-section-items-edit');
    expect(mockForm.navigateToStep).toHaveBeenLastCalledWith(2);
    expect(pressable('dispatch-review-section-items-edit').props.accessibilityLabel).toBe('Edit items');
    expect(tree.root.findAll((n) => n.props.testID === 'dispatch-review-section-photos-edit')).toHaveLength(0);

    mockForm.navigateToStep.mockClear();
    await press('dispatch-review-back');
    expect(mockForm.navigateToStep).toHaveBeenCalledTimes(1);
    expect(mockForm.navigateToStep).toHaveBeenCalledWith(2);
    expect(pressable('dispatch-review-back').props.accessibilityLabel).toBe('Back to items');
  });

  it('the bottom bar says "Create dispatch"; the confirm dialog opens from it', async () => {
    await render();

    expect(pressable('dispatch-review-submit').props.accessibilityLabel).toBe('Create dispatch');
    await act(async () => { pressable('dispatch-review-submit').props.onPress(); });
    expect(tree.root.findAllByType('ConfirmDialog' as never)[0].props.visible).toBe(true);
  });
});

describe('the sections of an edited dispatch', () => {
  it('has no PHOTOS section, says "Save changes", and keeps the edit hint as the table note', async () => {
    await render('edit');

    expect(tree.root.findAll((n) => n.props.testID === 'dispatch-review-section-photos')).toHaveLength(0);
    expect(textOf(tree.root)).not.toContain('PHOTOS');
    expect(sectionsOpen()).toEqual(['items']);
    expect(pressable('dispatch-review-submit').props.accessibilityLabel).toBe('Save changes');
    expect(textOf(tree.root.find((n) => n.props.testID === 'dispatch-review-edit-hint'))).toEqual(['Check the details before you save. Saving updates stock levels.']);
  });

  it('a new dispatch has no edit hint', async () => {
    await render('create');
    expect(tree.root.findAll((n) => n.props.testID === 'dispatch-review-edit-hint')).toHaveLength(0);
  });

  it('after the save, the success dialog goes to the dispatch page', async () => {
    mockForm.submitForm.mockResolvedValue({ success: true });
    await render('edit');
    await act(async () => { pressable('dispatch-review-submit').props.onPress(); });
    const dialogs = () => tree.root.findAllByType('ConfirmDialog' as never);
    await act(async () => { dialogs()[0].props.onConfirm(); });
    await act(async () => { dialogs().forEach((dialog) => dialog.props.onDismissed?.()); });
    const saved = dialogs().find((dialog) => dialog.props.title === 'Dispatch I0042 saved')!;
    expect(saved.props.visible).toBe(true);
    await act(async () => { saved.props.onConfirm(); });
    expect(jest.requireMock('expo-router').router.replace).toHaveBeenCalledWith('/dispatch-details/d1');
  });
});
