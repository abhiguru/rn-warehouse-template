/**
 * WH-217: the GRN, Dispatch and Invoice wizards share one scheme. The real step headers (title, step names, the
 * leaving question and its buttons) in English and Gujarati, create and edit, and the real bottom bar (no GRN
 * default on the last step). Only the store, the safe area and the icons are stand-ins.
 */
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { GRNStepIndicator } from '@/components/GRNStepIndicator';
import { DispatchStepIndicator, dispatchSteps } from '@/components/DispatchStepIndicator';
import { InvoiceStepIndicator, invoiceSteps } from '@/components/InvoiceStepIndicator';
import { grnSteps } from '@/features/grn/utils/grnStepLabels';
import WizardBottomBar from '@/components/WizardBottomBar';
import { setLanguage, t } from '@/i18n';
import { showAlert } from '@/utils/alert';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));

afterEach(() => { setLanguage('en'); jest.clearAllMocks(); });

const WIZARDS = {
  grn: (edit: boolean) => <GRNStepIndicator steps={grnSteps()} currentStep={1} completedSteps={[]} onCancel={jest.fn()} grnNo="A0010" isEditMode={edit} />,
  dispatch: (edit: boolean) => <DispatchStepIndicator steps={dispatchSteps()} currentStep={1} completedSteps={[]} onCancel={jest.fn()} dispNo="I0042" isEditMode={edit} />,
  invoice: (edit: boolean) => <InvoiceStepIndicator steps={invoiceSteps()} currentStep={1} completedSteps={[]} onCancel={jest.fn()} invoiceNo="42" isEditMode={edit} />,
} as const;

const render = async (element: React.ReactElement) => {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(element); });
  return tree;
};
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => (n.type as unknown) === 'Text' || (n.type as { displayName?: string })?.displayName === 'Text')
    .flatMap((n: ReactTestInstance) => n.children.filter((c): c is string => typeof c === 'string'));
const pressClose = async (tree: ReactTestRenderer) => {
  const close = tree.root.find((n) => n.props.accessibilityHint === t('components.steps.cancelHint') && typeof n.props.onPress === 'function');
  await act(async () => { close.props.onPress(); });
  const [title, message, buttons] = jest.mocked(showAlert).mock.calls.at(-1)!;
  return { title, message, buttons: buttons!.map((button) => button.text) };
};

describe('the leaving question, one scheme for the three wizards', () => {
  it.each([
    ['grn', false, 'Discard this GRN?', 'The details you entered will be lost.', 'Discard GRN'],
    ['dispatch', false, 'Discard this dispatch?', 'The details you entered will be lost.', 'Discard dispatch'],
    ['invoice', false, 'Discard this invoice?', 'The details you entered will be lost.', 'Discard invoice'],
    ['grn', true, 'Discard changes to this GRN?', 'Your changes to this GRN will be lost.', 'Discard changes'],
    ['dispatch', true, 'Discard changes to this dispatch?', 'Your changes to this dispatch will be lost.', 'Discard changes'],
    ['invoice', true, 'Discard changes to this invoice?', 'Your changes to this invoice will be lost.', 'Discard changes'],
  ] as const)('%s, edit %s: asks "%s" with Keep editing and "%s"', async (wizard, edit, title, message, discard) => {
    const tree = await render(WIZARDS[wizard](edit));
    expect(await pressClose(tree)).toEqual({ title, message, buttons: ['Keep editing', discard] });
  });

  it('never asks "Cancel dispatch" in a dispatch edit', async () => {
    const tree = await render(WIZARDS.dispatch(true));
    expect((await pressClose(tree)).title).not.toBe('Cancel dispatch');
  });
});

describe('the header names the document, and an edit says "Edit <document>"', () => {
  it.each([
    ['grn', false, 'GRN'], ['dispatch', false, 'Dispatch'], ['invoice', false, 'Invoice'],
    ['grn', true, 'Edit GRN'], ['dispatch', true, 'Edit dispatch'], ['invoice', true, 'Edit invoice'],
  ] as const)('%s, edit %s: "%s"', async (wizard, edit, title) => {
    const tree = await render(WIZARDS[wizard](edit));
    expect(texts(tree)).toContain(title);
  });

  it.each([
    ['grn', 'આવક પાવતીમાં ફેરફાર કરો'],
    ['dispatch', 'જાવકમાં ફેરફાર કરો'],
    ['invoice', 'ઇન્વૉઇસમાં ફેરફાર કરો'],
  ] as const)('%s edit, in Gujarati: "%s"', async (wizard, title) => {
    setLanguage('gu');
    const tree = await render(WIZARDS[wizard](true));
    expect(texts(tree)).toContain(title);
  });

  it('the step names read "<Doc> details", Items, Review in all three', () => {
    expect(grnSteps().map((s) => s.label)).toEqual(['GRN details', 'Items', 'Review']);
    expect(dispatchSteps().map((s) => s.label)).toEqual(['Dispatch details', 'Items', 'Review']);
    expect(invoiceSteps().map((s) => s.label)).toEqual(['Invoice details', 'Items', 'Review']);
  });
});

describe('the Gujarati leaving questions', () => {
  it.each([
    ['dispatch', false, 'આ જાવક છોડી દેવી છે?', 'તમે ભરેલી વિગતો જતી રહેશે.', 'જાવક છોડી દો'],
    ['dispatch', true, 'આ જાવકના ફેરફાર છોડી દેવા છે?', 'આ જાવકમાં કરેલા ફેરફાર જતા રહેશે.', 'ફેરફાર છોડી દો'],
    ['invoice', false, undefined, 'તમે ભરેલી વિગતો જતી રહેશે.', 'ઇન્વૉઇસ છોડી દો'],
    ['invoice', true, undefined, undefined, 'ફેરફાર છોડી દો'],
  ] as const)('%s, edit %s', async (wizard, edit, title, message, discard) => {
    setLanguage('gu');
    const tree = await render(WIZARDS[wizard](edit));
    const asked = await pressClose(tree);
    if (title) expect(asked.title).toBe(title);
    if (message) expect(asked.message).toBe(message);
    expect(asked.buttons[1]).toBe(discard);
  });
});

describe('the bottom bar has no GRN default on the last step', () => {
  it('shows "Next", not "Create GRN", when a wizard passes no label on the last step', async () => {
    const tree = await render(<WizardBottomBar currentStep={3} totalSteps={3} onNext={jest.fn()} />);
    const labels = tree.root.findAll((n) => typeof n.props.accessibilityLabel === 'string').map((n) => n.props.accessibilityLabel);
    expect(labels).not.toContain('Create GRN');
    expect(texts(tree)).not.toContain('Create GRN');
    expect(texts(tree)).toContain('Next');
  });
});
