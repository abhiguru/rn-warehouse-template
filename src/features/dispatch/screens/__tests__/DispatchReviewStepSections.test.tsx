/**
 * The dispatch review step's folding card: DETAILS, PHOTOS (create only) and ITEMS (n), one open at a time with ITEMS
 * open when the step opens, a closed section's one-line summary, and the Edit pencils to steps 1 and 2.
 */
import React from 'react';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { DispatchReviewStep } from '@/features/dispatch/screens/DispatchReviewStep';
import { showToast } from '@/utils/toast';
import { getGRNDetailByNumber } from '@/features/dispatch/services/grnDetailService';
import { setLanguage, t } from '@/i18n';
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
// The confirm dialogs are stand-ins that draw the title of an open one and keep their props, so the test can answer
// them where the real component answers through a Modal event.
let mockDialogs: Record<string, { visible: boolean; title: string; onConfirm: () => unknown; onDismissed?: () => void }> = {};
jest.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: { visible: boolean; title: string; onConfirm: () => unknown; onDismissed?: () => void }) => {
    mockDialogs[props.title] = props;
    return props.visible ? require('react').createElement(require('react-native').Text, { accessibilityRole: 'alert' }, props.title) : null;
  },
}));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: 'DocumentSuccessDialog' }));
jest.mock('@/components/DispatchStepIndicator', () => ({ DispatchStepIndicator: () => null, dispatchSteps: () => [] }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: 'ImageUploadButton' }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), dismissTo: jest.fn() },
  // The route's dispatch: an edit goes back to it, whatever the form holds.
  useLocalSearchParams: () => ({ id: 'route-dispatch' }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
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

const show = async (mode: 'create' | 'edit' = 'create') => {
  mockForm.isCreateMode = mode === 'create';
  await render(<DispatchReviewStep mode={mode} />);
};
beforeEach(() => {
  jest.clearAllMocks();
  mockForm.images = [];
  mockDialogs = {};
  jest.mocked(getGRNDetailByNumber).mockResolvedValue({ success: true, data: { grn: {}, items: [{ id: 'l1', stock: 40 }, { id: 'l2', stock: 40 }] } } as unknown as Awaited<ReturnType<typeof getGRNDetailByNumber>>);
});
afterEach(() => {
  setLanguage('en');
});

// A closed section's body is kept drawn but folded away, and its heading and one-line summary are hidden from a screen
// reader because the toggle's name carries them: the test looks at them on purpose.
const HIDDEN = { includeHiddenElements: true } as const;
const NAMES = { details: /^Dispatch details/, photos: /^Photos/, items: /^Items/ } as const;
type Section = keyof typeof NAMES;
const toggle = (section: Section) => screen.getByRole('button', { name: NAMES[section] });
const sectionsOpen = () =>
  (Object.keys(NAMES) as Section[]).filter((section) => screen.queryByRole('button', { name: NAMES[section] })?.props.accessibilityState.expanded === true);
const press = async (name: string | RegExp) => { await userEvent.setup({ delay: 0 }).press(screen.getByRole('button', { name })); };
/** One thing that only a section's body draws: the key-value row of DETAILS, the hint of PHOTOS, the total of ITEMS. */
const bodyMarker = (section: Section) => {
  if (section === 'details') return screen.getByLabelText('Dispatch number, I0042', HIDDEN);
  if (section === 'photos') return screen.getByText(t('dispatch.review.photosHint'), HIDDEN);
  return screen.getByLabelText(/^Total: 2 item lines/, HIDDEN);
};

describe('the sections of a new dispatch', () => {
  it('has DETAILS, PHOTOS and ITEMS (2), with ITEMS the only one open and the other two folded away', async () => {
    await show();

    expect(screen.getByRole('button', { name: 'Dispatch details, I0042 · 1 Oct 2026 · Fictional Traders' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Photos, No photos yet' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Items, 2' })).toBeOnTheScreen();
    expect(screen.getByText('DISPATCH DETAILS', HIDDEN)).toBeOnTheScreen();
    expect(screen.getByText('PHOTOS', HIDDEN)).toBeOnTheScreen();
    expect(screen.getByText('ITEMS (2)', HIDDEN)).toBeOnTheScreen();
    expect(sectionsOpen()).toEqual(['items']);
    expect(bodyMarker('details')).not.toBeVisible();
    expect(bodyMarker('photos')).not.toBeVisible();
    expect(bodyMarker('items')).toBeVisible();
  });

  it('shows the closed sections as one line under the heading', async () => {
    await show();

    expect(screen.getByText('I0042 · 01/10/26 · Fictional Traders', HIDDEN)).toBeOnTheScreen();
    expect(screen.getByText('No photos yet', HIDDEN)).toBeOnTheScreen();
    // ITEMS is open: no summary line under its heading.
    expect(screen.queryByText('Total quantity 10', HIDDEN)).not.toBeOnTheScreen();
    await press(NAMES.details);
    expect(screen.getByText('Total quantity 10', HIDDEN)).toBeOnTheScreen();
  });

  it('reads the date row in words, while the row shows 01/10/26', async () => {
    await show();
    await press(NAMES.details);
    expect(screen.getByLabelText('Date, 1 Oct 2026')).toBeOnTheScreen();
    expect(screen.getByText('01/10/26')).toBeOnTheScreen();
  });

  it('opens one at a time: DETAILS, then PHOTOS, then PHOTOS again to close all', async () => {
    await show();
    expect(sectionsOpen()).toEqual(['items']);

    await press(NAMES.details);
    expect(sectionsOpen()).toEqual(['details']);
    expect(bodyMarker('items')).not.toBeVisible();
    for (const label of [
      'Dispatch number, I0042',
      'Customer, Fictional Traders',
      'Address, 12 Sample Road, Samplepur',
      'Mobile number, +91 98765 43210',
      'Vehicle, GJ01AB1234',
      'Supervisor, Asha',
      'Notes, Fictional note',
      'Total items, 2',
      'GRNs, 2',
      'Total quantity, 10',
    ]) {
      expect(screen.getByLabelText(label)).toBeVisible();
    }

    await press(NAMES.photos);
    expect(sectionsOpen()).toEqual(['photos']);
    expect(bodyMarker('details')).not.toBeVisible();

    await press(NAMES.photos);
    expect(sectionsOpen()).toEqual([]);
  });

  it('counts the photos in the heading and the closed line', async () => {
    mockForm.images = [
      { id: 'p1', file_name: 'a.webp', image_url: 'file:///a.webp', upload_status: 'completed' },
      { id: 'p2', file_name: 'b.webp', image_url: 'file:///b.webp', upload_status: 'completed' },
    ];
    await show();

    expect(screen.getByRole('button', { name: 'Photos, 2, 2 photos' })).toBeOnTheScreen();
    expect(screen.getByText('PHOTOS (2)', HIDDEN)).toBeOnTheScreen();
  });

  it('the Edit pencils go to step 1 (details) and step 2 (items); Back goes to step 2; PHOTOS has no pencil', async () => {
    await show();

    await press('Edit dispatch details');
    expect(mockForm.navigateToStep).toHaveBeenLastCalledWith(1);

    await press('Edit items');
    expect(mockForm.navigateToStep).toHaveBeenLastCalledWith(2);
    // Two pencils and no third: PHOTOS has none.
    expect(screen.getAllByRole('button', { name: /^Edit/ })).toHaveLength(2);

    mockForm.navigateToStep.mockClear();
    await press('Back to items');
    expect(mockForm.navigateToStep).toHaveBeenCalledTimes(1);
    expect(mockForm.navigateToStep).toHaveBeenCalledWith(2);
  });

  it('the bottom bar says "Create dispatch"; the confirm dialog opens from it', async () => {
    await show();

    expect(screen.queryByText('Create dispatch I0042?')).not.toBeOnTheScreen();
    await press('Create dispatch');
    expect(screen.getByText('Create dispatch I0042?')).toBeOnTheScreen();
  });
});

describe('the sections of an edited dispatch', () => {
  it('has no PHOTOS section, says "Save dispatch", and keeps the edit hint as the table note', async () => {
    await show('edit');

    expect(screen.queryByRole('button', { name: NAMES.photos })).not.toBeOnTheScreen();
    expect(screen.queryByText(/PHOTOS/, HIDDEN)).not.toBeOnTheScreen();
    expect(sectionsOpen()).toEqual(['items']);
    expect(screen.getByRole('button', { name: 'Save dispatch' })).toBeOnTheScreen();
    expect(screen.getByText('Check the details before you save. Saving updates stock levels.')).toBeOnTheScreen();
  });

  it('a new dispatch has no edit hint', async () => {
    await show('create');
    expect(screen.queryByText('Check the details before you save. Saving updates stock levels.', HIDDEN)).not.toBeOnTheScreen();
  });

  it('after the save of an edit that carries order notes, the success dialog goes to the dispatch page', async () => {
    mockForm.submitForm.mockResolvedValue({ success: true, orderSynced: true });
    await show('edit');
    await press('Save dispatch');
    await act(async () => { await mockDialogs['Save changes to dispatch I0042?'].onConfirm(); });
    await act(async () => { Object.values(mockDialogs).forEach((dialog) => dialog.onDismissed?.()); });
    expect(screen.getByText('Dispatch I0042 saved')).toBeOnTheScreen();
    await act(async () => { await mockDialogs['Dispatch I0042 saved'].onConfirm(); });
    // The page the edit was opened over (the route's dispatch, not the form's `dispatchId` 'd1'), not a second copy of it.
    expect(router.dismissTo).toHaveBeenCalledWith('/dispatch-details/route-dispatch');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('after the save of an edit with no order notes, no dialog: a toast names the dispatch and the page is shown', async () => {
    mockForm.submitForm.mockResolvedValue({ success: true });
    await show('edit');
    await press('Save dispatch');
    await act(async () => { await mockDialogs['Save changes to dispatch I0042?'].onConfirm(); });
    await act(async () => { Object.values(mockDialogs).forEach((dialog) => dialog.onDismissed?.()); });
    expect(screen.queryByText('Dispatch I0042 saved')).not.toBeOnTheScreen();
    expect(showToast).toHaveBeenCalledWith('Dispatch I0042 saved.');
    expect(router.dismissTo).toHaveBeenCalledWith('/dispatch-details/route-dispatch');
  });
});

describe('the lots\' packaging (D18)', () => {
  const withPackaging = (...packagings: string[]) => {
    mockForm.items = packagings.map((packaging, n) => ({ ...reviewLine(n + 1), grnItems_packaging: packaging }));
  };
  afterEach(() => { mockForm.items = [reviewLine(1), reviewLine(2)]; });

  it('a Box line and the total read "boxes"', async () => {
    withPackaging('Box', 'Box');
    await show();
    expect(screen.getByLabelText('Item 1, Fictional item 1, mark M1, GRN A101, quantity 5 boxes, 50 kg each, Rack R1, Received 100 boxes, 35 left')).toBeOnTheScreen();
    expect(screen.getByLabelText('Total: 2 item lines from 2 GRNs, 10 boxes dispatched')).toBeOnTheScreen();
  });

  it('lots counted in different things total in "units"; a lot of another packaging stays a bag', async () => {
    withPackaging('Box', 'Crate');
    await show();
    expect(screen.getByLabelText('Total: 2 item lines from 2 GRNs, 10 units dispatched')).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Item 2,.*quantity 5 crates/)).toBeOnTheScreen();

    withPackaging('Jute', 'Unit');
    screen.unmount();
    await show();
    expect(screen.getByLabelText('Total: 2 item lines from 2 GRNs, 10 units dispatched')).toBeOnTheScreen();
  });
});
