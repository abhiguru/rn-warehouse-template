/**
 * The number box of a new GRN follows the facility's numbering rule (WS-8, backend migration 127): its placeholder is the
 * rule's pattern, and an empty box says what to do when the rule offered no number.
 */
import React from 'react';
import { Text, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import { GrnHeaderStep } from '@/features/grn/screens/GrnHeaderStep';
import { setLanguage } from '@/i18n';

const mockForm: Record<string, unknown> = {};
const reset = (over: Record<string, unknown> = {}) => {
  Object.keys(mockForm).forEach(key => delete mockForm[key]);
  Object.assign(mockForm, {
    header: { gr_no: '', date: '2026-09-30T00:00:00Z' },
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
  }, over);
};

jest.mock('@/hooks', () => ({ useGRNForm: () => mockForm }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, grnForm: { items: [] } }),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, useLocalSearchParams: () => ({}) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-paper-dates', () => ({ DatePickerModal: () => null }));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ KeyboardAwareScrollView: 'ScrollView' }));
jest.mock('@/components/CustomerSearchBottomSheet', () => ({
  CustomerSearchBottomSheet: require('react').forwardRef(() => null),
}));
jest.mock('@/features/grn/components/SupervisorBottomSheet', () => ({ SupervisorBottomSheet: () => null }));
jest.mock('@/components/GRNStepIndicator', () => ({ GRNStepIndicator: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/components/GhostTextInput', () => ({ GhostTextInput: require('react').forwardRef(() => null) }));
jest.mock('@/services/vehicle-suggestion-service', () => ({ getTopVehicleSuggestion: jest.fn() }));


let tree: ReturnType<typeof create> | undefined;
const mount = async () => { await act(async () => { tree = create(<GrnHeaderStep mode="create" />); }); return tree!; };
const box = () => tree!.root.findAllByType(TextInput).find(input => input.props.accessibilityLabel === 'Receipt number');
const note = () => tree!.root.findAll(node => node.props.testID === 'grn-header-number-note')[0];
const allText = () => tree!.root.findAllByType(Text).map(node => [node.props.children].flat(3).join('')).join(' | ');

beforeEach(() => { setLanguage('en'); reset(); });
afterEach(async () => { if (tree) await act(async () => { tree!.unmount(); }); tree = undefined; });

it('shows the pattern of the rule as the placeholder', async () => {
  reset({ numberHint: 'GRN/26-27/####' });
  await mount();
  expect(box()?.props.placeholder).toBe('GRN/26-27/####');
});

it('keeps the box\'s own placeholder where the server gave no pattern (older backend)', async () => {
  await mount();
  expect(box()?.props.placeholder).toBe('GRN####');
  expect(note()).toBeUndefined();
});

it('shows no pattern and says to type the number when the rule is typed by hand', async () => {
  reset({ numberReason: 'TYPE_IT' });
  await mount();
  expect(box()?.props.placeholder).toBe('');
  expect(allText()).toContain('No GRN number is offered. Type the GRN number.');
});

it('says to ask an administrator when the series has no number left', async () => {
  reset({ numberReason: 'SERIES_FULL', numberHint: 'A####' });
  await mount();
  expect(box()?.props.placeholder).toBe('A####');
  expect(allText()).toContain('All numbers of this series are used. Type a number, or ask an administrator to change the numbering.');
});

it('says nothing once a number is in the box, while one is being fetched, or when the number is wrong', async () => {
  reset({ numberReason: 'TYPE_IT', header: { gr_no: '14/B/2027', date: '2026-09-30T00:00:00Z' } });
  await mount();
  expect(note()).toBeUndefined();
  await act(async () => { tree!.unmount(); });
  reset({ numberReason: 'TYPE_IT', isGeneratingNumber: true });
  await mount();
  expect(note()).toBeUndefined();
  await act(async () => { tree!.unmount(); });
  reset({ numberReason: 'TYPE_IT', validationErrors: { gr_no: 'GRN number is required' } });
  await mount();
  expect(note()).toBeUndefined();
  expect(allText()).toContain('GRN number is required');
});

it('says it in Gujarati too', async () => {
  setLanguage('gu');
  reset({ numberReason: 'SERIES_FULL' });
  await mount();
  expect(allText()).toContain('એડમિનને નંબરિંગ બદલવા કહો');
});
