/**
 * WH-228: on the GRN wizard's first step the real WizardBottomBar is lifted by the part the keyboard covers
 * (useKeyboardCoverLift). The step and the bar are real; the form state, the keyboard and the window are stand-ins.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { GrnHeaderStep } from '@/features/grn/screens/GrnHeaderStep';
import { wizardKeyboardLiftCases } from '@/tests/helpers/wizardKeyboardLift';
import { expectRevealWired, recordedRevealRefs } from '@/tests/helpers/revealWiring';

const mockForm = {
  header: { gr_no: 'A0010', date: '2026-09-30T00:00:00Z' },
  isGeneratingNumber: false,
  isCreateMode: true,
  validationErrors: {},
  numberHint: null,
  numberReason: null,
  handleGrNoChange: jest.fn(),
  updateHeaderField: jest.fn(),
  updateHeaderFields: jest.fn(),
  navigateToStep: jest.fn(),
  resetFormState: jest.fn(),
};
jest.mock('@/hooks', () => ({ useGRNForm: () => mockForm }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1' } }, grnForm: { items: [] } }),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: () => null }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'ScrollView' }));
jest.mock('@/components/CustomerSearchBottomSheet', () => ({ CustomerSearchBottomSheet: require('react').forwardRef(() => null) }));
jest.mock('@/features/grn/components/SupervisorBottomSheet', () => ({ SupervisorBottomSheet: () => null }));
jest.mock('@/components/GRNStepIndicator', () => ({ GRNStepIndicator: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/components/GhostTextInput', () => ({ GhostTextInput: require('react').forwardRef(() => null) }));
jest.mock('@/services/vehicle-suggestion-service', () => ({ getTopVehicleSuggestion: jest.fn() }));
jest.mock('@/hooks/useRevealFocusedField', () => require('@/tests/helpers/revealWiring').recordRevealRefs());

describe('GRN wizard, details step: the bottom bar and the keyboard', () => {
  wizardKeyboardLiftCases(async () => { await render(<GrnHeaderStep mode="create" />); });

  it('notes a drag on its scroll view (useRevealScrollRef), so a moved bar does not scroll back', async () => {
    recordedRevealRefs.length = 0;
    await render(<GrnHeaderStep mode="create" />);
    const scrolls = screen.root!.queryAll((n) => n.type === 'ScrollView' && typeof n.props.onScrollBeginDrag === 'function', { includeSelf: true });
    expect(scrolls).toHaveLength(1);
    // WH-243: the scroll view carries the step's own reveal handlers (a dropped spread fails here)
    expect(recordedRevealRefs).toHaveLength(1);
    expectRevealWired(scrolls[0], recordedRevealRefs[0]);
  });
});
