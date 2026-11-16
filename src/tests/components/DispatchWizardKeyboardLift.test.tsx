/**
 * WH-228: on the dispatch wizard's first step the real WizardBottomBar is lifted by the part the keyboard covers
 * (useKeyboardCoverLift). The step and the bar are real; the form state, the keyboard and the window are stand-ins.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { DispatchHeaderStep } from '@/features/dispatch/screens/DispatchHeaderStep';
import { wizardKeyboardLiftCases } from '@/tests/helpers/wizardKeyboardLift';
import { expectRevealWired, recordedRevealRefs } from '@/tests/helpers/revealWiring';

const mockForm = {
  header: { ...require('@/types/dispatch.types').createEmptyDispatchHeader(), disp_no: 'I0042', disp_date: '2026-10-28' },
  validationErrors: {},
  isGeneratingNumber: false,
  isCreateMode: true,
  invoicedNumber: null,
  numberHint: null,
  numberReason: null,
  updateHeaderField: jest.fn(),
  updateHeaderFields: jest.fn(),
  handleDispNoChange: jest.fn(),
  clearFieldValidationError: jest.fn(),
  navigateToStep: jest.fn(),
  resetFormState: jest.fn(),
  validateCurrentStep: jest.fn(),
};
jest.mock('@/hooks/useDispatchForm', () => ({ useDispatchForm: () => mockForm }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({}), useFocusEffect: jest.fn() }));
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: () => null }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: (props: { children: React.ReactNode; onScrollBeginDrag?: () => void; onTouchStartCapture?: () => void; onChangeCapture?: () => void }) => require('react').createElement('DragScroll', { onScrollBeginDrag: props.onScrollBeginDrag, onTouchStartCapture: props.onTouchStartCapture, onChangeCapture: props.onChangeCapture }, props.children) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/CustomerSearchBottomSheet', () => ({ CustomerSearchBottomSheet: () => null }));
jest.mock('@/features/grn/components/SupervisorBottomSheet', () => ({ SupervisorBottomSheet: () => null }));
jest.mock('@/components/DispatchStepIndicator', () => ({ DispatchStepIndicator: () => null, dispatchSteps: () => [] }));
jest.mock('@/components/SwipeableFormStep', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/GhostTextInput', () => ({ GhostTextInput: () => null }));
jest.mock('@/services/vehicle-suggestion-service', () => ({ getTopVehicleSuggestion: jest.fn() }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1' } } }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useRevealFocusedField', () => require('@/tests/helpers/revealWiring').recordRevealRefs());

describe('Dispatch wizard, details step: the bottom bar and the keyboard', () => {
  wizardKeyboardLiftCases(async () => {
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<DispatchHeaderStep mode="create" />); });
    return tree;
  });

  it('notes a drag on its scroll view (useRevealScrollRef), so a moved bar does not scroll back', async () => {
    recordedRevealRefs.length = 0;
    let tree!: ReturnType<typeof create>;
    await act(async () => { tree = create(<DispatchHeaderStep mode="create" />); });
    const scrolls = tree.root.findAll(n => (n.type as unknown) === 'DragScroll' && typeof n.props.onScrollBeginDrag === 'function');
    expect(scrolls).toHaveLength(1);
    // WH-243: the scroll view carries the step's own reveal handlers (a dropped spread fails here)
    expect(recordedRevealRefs).toHaveLength(1);
    expectRevealWired(scrolls[0], recordedRevealRefs[0]);
    await act(async () => { tree.unmount(); });
  });
});
