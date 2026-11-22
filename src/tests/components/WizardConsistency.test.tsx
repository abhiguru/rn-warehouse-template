/**
 * WH-217: the GRN, Dispatch and Invoice wizards share one scheme. The real step headers (title, step names, the
 * leaving question and its buttons) in English and Gujarati, create and edit, and the real bottom bar (no GRN
 * default on the last step). Only the store, the safe area and the icons are stand-ins.
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
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

const pressClose = async () => {
  await userEvent.setup({ delay: 0 }).press(screen.getByHintText(t('components.steps.cancelHint')));
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
    await render(WIZARDS[wizard](edit));
    expect(await pressClose()).toEqual({ title, message, buttons: ['Keep editing', discard] });
  });

  it('never asks "Cancel dispatch" in a dispatch edit', async () => {
    await render(WIZARDS.dispatch(true));
    expect((await pressClose()).title).not.toBe('Cancel dispatch');
  });
});

describe('the header names the document, and an edit says "Edit <document>"', () => {
  it.each([
    ['grn', false, 'GRN'], ['dispatch', false, 'Dispatch'], ['invoice', false, 'Invoice'],
    ['grn', true, 'Edit GRN'], ['dispatch', true, 'Edit dispatch'], ['invoice', true, 'Edit invoice'],
  ] as const)('%s, edit %s: "%s"', async (wizard, edit, title) => {
    await render(WIZARDS[wizard](edit));
    expect(screen.getAllByText(title)[0]).toBeOnTheScreen();
  });

  it.each([
    ['grn', 'આવક પાવતીમાં ફેરફાર કરો'],
    ['dispatch', 'જાવકમાં ફેરફાર કરો'],
    ['invoice', 'ઇન્વૉઇસમાં ફેરફાર કરો'],
  ] as const)('%s edit, in Gujarati: "%s"', async (wizard, title) => {
    setLanguage('gu');
    await render(WIZARDS[wizard](true));
    expect(screen.getAllByText(title)[0]).toBeOnTheScreen();
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
    await render(WIZARDS[wizard](edit));
    const asked = await pressClose();
    if (title) expect(asked.title).toBe(title);
    if (message) expect(asked.message).toBe(message);
    expect(asked.buttons[1]).toBe(discard);
  });
});

describe('the bottom bar has no GRN default on the last step', () => {
  it('shows "Next", not "Create GRN", when a wizard passes no label on the last step', async () => {
    await render(<WizardBottomBar currentStep={3} totalSteps={3} onNext={jest.fn()} />);
    // A check that something is NOT drawn must also see a node that is mounted but hidden.
    expect(screen.queryAllByLabelText('Create GRN', { includeHiddenElements: true })).toHaveLength(0);
    expect(screen.queryAllByText('Create GRN', { includeHiddenElements: true })).toHaveLength(0);
    expect(screen.getAllByText('Next')[0]).toBeOnTheScreen();
  });
});
