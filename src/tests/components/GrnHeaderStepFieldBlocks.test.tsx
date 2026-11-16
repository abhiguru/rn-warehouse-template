/**
 * WH-228: the wizard bar keeps a field's declared block above itself. GRN step 1: GRN number, Vehicle registration
 * and Notes each sit in a view marked FIELD_BLOCK_ID that also holds the messages under the field. If a marker
 * disappears the reveal falls back to the bare input and these tests fail.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import { GrnHeaderStep } from '@/features/grn/screens/GrnHeaderStep';
import { setLanguage, t as tr } from '@/i18n';
import { blockOf, inputsIn, wordsIn } from '@/tests/helpers/fieldBlock';

const mockForm: Record<string, unknown> = {};
const reset = (over: Record<string, unknown> = {}) => {
  Object.keys(mockForm).forEach(key => delete mockForm[key]);
  Object.assign(mockForm, {
    header: { gr_no: '', date: '2026-09-30T00:00:00Z', registration: '', note: '', leon: false },
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
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1' } }, grnForm: { items: [] } }),
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
// The vehicle box as a plain text input, so the focused input and its ancestors can be read.
jest.mock('@/components/GhostTextInput', () => ({
  GhostTextInput: require('react').forwardRef((props: { value: string }, ref: React.Ref<unknown>) => {
    const { TextInput: Input } = require('react-native');
    return <Input ref={ref} accessibilityLabel="Vehicle registration box" value={props.value} />;
  }),
}));
jest.mock('@/services/vehicle-suggestion-service', () => ({ getTopVehicleSuggestion: jest.fn() }));

let tree: ReturnType<typeof create> | undefined;
const mount = async () => { await act(async () => { tree = create(<GrnHeaderStep mode="create" />); }); return tree!; };
const input = (label: string) => tree!.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === label)!;
const showOptional = async () => {
  const toggle = tree!.root.find(node => node.props.accessibilityLabel === tr('grn.header.showOptional') && typeof node.props.onPress === 'function');
  await act(async () => { toggle.props.onPress(); });
};

beforeEach(() => { setLanguage('en'); reset(); });
afterEach(async () => { if (tree) await act(async () => { tree!.unmount(); }); tree = undefined; });

describe('GRN step 1 field blocks', () => {
  it('GRN number: the block holds the box, its error and the number note, and no other field', async () => {
    reset({ numberReason: 'TYPE_IT', validationErrors: { gr_no: 'GRN number is required' } });
    await mount();
    const block = blockOf(input('GRN number'));
    expect(block).not.toBeNull();
    expect(inputsIn(block!)).toBe(1);
    expect(wordsIn(block!)).toContain('GRN number is required');
  });

  it('GRN number: the number note is inside the block', async () => {
    reset({ numberReason: 'TYPE_IT' });
    await mount();
    const block = blockOf(input('GRN number'))!;
    expect(block).not.toBeNull();
    expect(wordsIn(block).join(' ')).toContain('Type the GRN number.');
  });

  it('GRN number: the "number locked" line of a saved GRN is inside the block', async () => {
    reset({ isCreateMode: false, header: { gr_no: 'GRN0001', date: '2026-09-30T00:00:00Z', registration: '', note: '', leon: false } });
    await mount();
    const block = blockOf(input('GRN number'))!;
    expect(block).not.toBeNull();
    expect(wordsIn(block)).toContain(tr('grn.refusal.numberLocked'));
  });

  it('Vehicle registration: the input has a marked block of its own, apart from the other fields', async () => {
    await mount();
    const block = blockOf(input('Vehicle registration box'));
    expect(block).not.toBeNull();
    expect(inputsIn(block!)).toBe(1);
  });

  it('Notes: the block holds the field and its count', async () => {
    reset({ header: { gr_no: '', date: '2026-09-30T00:00:00Z', registration: '', note: 'abc', leon: false } });
    await mount();
    await showOptional();
    const block = blockOf(input(tr('common.notes')));
    expect(block).not.toBeNull();
    expect(inputsIn(block!)).toBe(1);
    expect(wordsIn(block!).join(' ')).toMatch(/3\/280/);
  });

  it('the three blocks are three different views', async () => {
    await mount();
    await showOptional();
    const blocks = [input('GRN number'), input('Vehicle registration box'), input(tr('common.notes'))].map(blockOf);
    expect(blocks.every((b) => b !== null)).toBe(true);
    expect(new Set(blocks).size).toBe(3);
  });
});
