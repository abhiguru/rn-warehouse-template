/**
 * WH-381 Section 3.4 (replaces WH-304 A-4 held-dispatch correction form, which is dropped with offline dispatches):
 *  - Historical `kind === 'newDispatch'` rows in `held_items` are filtered out of `ownHeldCopyRows()` and
 *    `heldNeedingDecision()`, so they never appear on `HeldStrip` or in the recorder's Holding section.
 *  - `DispatchReviewStep` no longer enters held-dispatch correction mode (`Accept with changes`) when opened on a
 *    `/dispatch-edit/held-*` route param (no `heldDispatch.ts` / `newDispatchKind.ts` imports).
 *
 * Contract-first on 71d7159d: assertions on WH-381 removal fail until Development removes held-dispatch mode and filters
 * historical `newDispatch` rows.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { DispatchReviewStep } from '@/features/dispatch/screens/DispatchReviewStep';
import { env, eraseEverything, resetEnv } from '@/tests/phoneCopy/phoneEnv';
import { files } from '@/tests/phoneCopy/fakeFiles';
import { server } from '@/tests/unsent/unsentPhone';
import { bootHolding, heldDispatchFeedRow, recorderHeldFeedRow } from '@/tests/unsent/holdingPhone';

const HELD = 'bbbbbbbb-2222-4333-8444-555555555555';
const LOT = 'lot-0000-0000-0000-000000000003';
const mockRpc = jest.fn();

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/hooks/useDispatchForm', () => ({
  useDispatchForm: () => ({
    header: { disp_no: '', disp_date: '2026-11-27', customer_id: 'c1', customer_name: 'asha Traders', registration: '', note: '', supervisor_id: '', supervisor_name: '' },
    items: [{ unique_id: LOT, grns_id: 'g1', grnItems_id: LOT, grnItems_item_name: 'Beans', grnItems_quantity: 10, grnItems_stock: 10, disp_quantity: 5, original_disp_quantity: 0 }],
    images: [],
    isSaving: false,
    isCheckingAnswer: false,
    isCreateMode: false,
    dispatchId: null,
    submitForm: jest.fn(),
    navigateToStep: jest.fn(),
    resetFormState: jest.fn(),
    addImageToForm: jest.fn(),
    updateImageStatus: jest.fn(),
    removeImageFromForm: jest.fn(),
    validationErrors: {},
  }),
}));
jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: () => jest.fn(),
  getCurrentConfig: () => ({ url: 'https://facility.invalid' }),
  getAuthenticatedClient: async () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: () => ({ id: `held-${HELD}` }),
}));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
jest.mock('@/components/DocumentSuccessDialog', () => ({ DocumentSuccessDialog: () => null }));
jest.mock('@/components/DispatchStepIndicator', () => ({ DispatchStepIndicator: () => null, dispatchSteps: () => [] }));
jest.mock('@/features/dispatch/components/LostAnswerStrip', () => ({ LostAnswerStrip: () => null }));
jest.mock('@/components/PrintRangeDialog', () => ({ PrintRangeDialog: () => null }));
jest.mock('@/components/ImageOverlay', () => ({ ImageOverlay: () => null }));
jest.mock('@/features/grn/components/ImageUploadButton', () => ({ ImageUploadButton: () => null }));
jest.mock('@/features/grn/components/ImagePreviewGrid', () => ({ ImagePreviewGrid: 'ImagePreviewGrid' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/hooks/useHaptics', () => ({ triggerSuccess: jest.fn(), triggerError: jest.fn(), triggerWarning: jest.fn() }));
jest.mock('@/features/dispatch/services/dispatchImageService', () => ({
  uploadDeferredDispatchImages: jest.fn(),
  unpreparedDispatchPhotos: () => 'ready',
  generateTempDispatchId: () => 'temp_dispatch_fixture',
  deleteDispatchImage: jest.fn(),
  prepareDispatchImageForDeferredUpload: jest.fn(),
  uploadDispatchImage: jest.fn(),
  getDispatchImageSignedUrl: jest.fn(),
}));
jest.mock('@/features/dispatch/services/grnDetailService', () => ({ getGRNDetailByNumber: jest.fn().mockResolvedValue({ success: true, data: { items: [] } }) }));
jest.mock('@/services/print-service', () => ({ printDispatchRange: jest.fn() }));
jest.mock('@/services/pdf-service', () => ({ generateDispatchPDF: jest.fn() }));
jest.mock('@/utils/shareDocument', () => ({ downloadAndSharePDF: jest.fn() }));

beforeEach(() => {
  mockRpc.mockReset();
  resetEnv();
  files.reset();
  server.reset();
  env.subject = 'user-1';
});
afterEach(async () => {
  jest.restoreAllMocks();
  await eraseEverything();
});

describe('WH-381: held-dispatch correction flow is removed and historical newDispatch rows are filtered out', () => {
  it('DispatchReviewStep does not render "Accept with changes" held-dispatch mode even when route param starts with held-', async () => {
    await render(<DispatchReviewStep mode="edit" />);
    expect(screen.queryByRole('button', { name: 'Accept with changes' })).not.toBeOnTheScreen();
  });

  it('historical newDispatch rows in held_items are excluded from ownHeldCopyRows and heldNeedingDecision', async () => {
    await bootHolding({
      role: 'supervisor',
      withCopy: true,
      heldFeedRows: [
        heldDispatchFeedRow('legacy-disp-m', [{ lot_id: 'l03', qty: 6 }]),
        recorderHeldFeedRow({ id: 'legacy-disp-r', kind: 'newDispatch', state: 'held', needs_decision: true }),
      ],
    });
    const { ownHeldCopyRows, heldNeedingDecision } = require('@/features/holding/heldRows') as typeof import('@/features/holding/heldRows');
    expect(heldNeedingDecision()).toBe(0);
    expect(ownHeldCopyRows()).toEqual([]);
  });
});
