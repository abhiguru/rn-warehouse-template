/**
 * Shared components that say something about a document take a stable `entity`
 * (and `mode`) and pick whole sentences with it, in both languages. A caller's
 * own word (the older props) is only placed into the English sentences.
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { setLanguage } from '@/i18n';
import { GenericStepIndicatorHeader } from '@/components/GenericStepIndicatorHeader';
import { ActionsSection } from '@/components/common/overview-tab';
import { PrintRangeDialog } from '@/components/PrintRangeDialog';
import { DocumentSuccessDialog } from '@/components/DocumentSuccessDialog';
import { showAlert } from '@/utils/alert';

const mockState = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/config/demoCapabilities', () => ({
  DEMO_CAPABILITIES: { printing: true, sensors: false, realtime: true, customerDocuments: false },
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

jest.useFakeTimers();

const user = userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });

afterEach(async () => {
  await jest.runOnlyPendingTimersAsync();
  setLanguage('en');
  jest.clearAllMocks();
});

/** Draws the element again in the language just set (the first tree is taken away so the screen holds one). */
async function renderAgain(element: React.ReactElement) {
  await screen.unmount();
  await render(element);
}

const STEPS = [{ label: 'One' }, { label: 'Two' }, { label: 'Three' }];
const header = (props: Partial<React.ComponentProps<typeof GenericStepIndicatorHeader>>) => (
  <GenericStepIndicatorHeader steps={STEPS} currentStep={1} completedSteps={[]} onCancel={jest.fn()} {...props} />
);

describe('GenericStepIndicatorHeader', () => {
  it.each([
    ['grn', 'create', 'Close new GRN', 'નવી આવક પાવતી બંધ કરો'],
    ['grn', 'edit', 'Close GRN edit', 'આવક પાવતીનો ફેરફાર બંધ કરો'],
    ['dispatch', 'create', 'Close new dispatch', 'નવી જાવક બંધ કરો'],
    ['dispatch', 'edit', 'Close dispatch edit', 'જાવકનો ફેરફાર બંધ કરો'],
    ['invoice', 'create', 'Close new invoice', 'નવું ઇન્વૉઇસ બંધ કરો'],
  ] as const)('names the close button for %s in %s mode in both languages', async (entity, mode, english, gujarati) => {
    await render(header({ entity, mode }));
    expect(screen.getByRole('button', { name: english })).toBeOnTheScreen();
    setLanguage('gu');
    await renderAgain(header({ entity, mode }));
    expect(screen.getByRole('button', { name: gujarati })).toBeOnTheScreen();
  });

  it('chooses by mode, not by the label on screen', async () => {
    // The label reads "Edit" but the wizard creates: before, the word on screen decided.
    await render(header({ entity: 'grn', mode: 'create', entityName: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Close new GRN' })).toBeOnTheScreen();
    setLanguage('gu');
    // A Gujarati label never matched 'edit': edit mode must still say "cancel the changes".
    await renderAgain(header({ entity: 'dispatch', mode: 'edit', entityName: 'ફેરફાર' }));
    expect(screen.getByRole('button', { name: 'જાવકનો ફેરફાર બંધ કરો' })).toBeOnTheScreen();
  });

  it('shows the name of the entity when no label is given, and the given label otherwise', async () => {
    await render(header({ entity: 'invoice' }));
    expect(screen.getByText('Invoice')).toBeOnTheScreen();
    await renderAgain(header({ entity: 'invoice', mode: 'edit', entityName: 'Edit invoice' }));
    expect(screen.getByText('Edit invoice')).toBeOnTheScreen();
    setLanguage('gu');
    await renderAgain(header({ entity: 'invoice' }));
    expect(screen.getByText('ઇન્વૉઇસ')).toBeOnTheScreen();
  });

  it('asks a whole-sentence discard question when the screen gives no title', async () => {
    setLanguage('gu');
    await render(header({ entity: 'dispatch' }));
    await user.press(screen.getByRole('button', { name: 'નવી જાવક બંધ કરો' }));
    expect((showAlert as jest.Mock).mock.calls[0][0]).toBe('આ જાવક છોડી દેવી છે?');
  });

  it('still accepts a caller word alone, for English', async () => {
    await render(header({ entityName: 'GRN' }));
    expect(screen.getByRole('button', { name: 'Cancel GRN' })).toBeOnTheScreen();
    await renderAgain(header({ entityName: 'Anything', mode: 'edit' }));
    expect(screen.getByRole('button', { name: 'Cancel editing' })).toBeOnTheScreen();
  });
});

describe('ActionsSection', () => {
  const actions = (props: Partial<React.ComponentProps<typeof ActionsSection>>) => (
    <ActionsSection entityNumber="311" entityId="g1" canEdit onDelete={jest.fn()} onPrint={jest.fn()} {...props} />
  );

  it.each([
    ['grn', ['Print GRN', 'Delete GRN'], ['આવક પાવતી પ્રિન્ટ કરો', 'આવક પાવતી ડિલીટ કરો']],
    ['dispatch', ['Print Dispatch', 'Delete Dispatch'], ['જાવક પ્રિન્ટ કરો', 'જાવક ડિલીટ કરો']],
    ['invoice', ['Print Invoice', 'Delete Invoice'], ['ઇન્વૉઇસ પ્રિન્ટ કરો', 'ઇન્વૉઇસ ડિલીટ કરો']],
  ] as const)('labels the buttons for %s in both languages', async (entity, english, gujarati) => {
    await render(actions({ entity }));
    english.forEach(label => expect(screen.getByText(label)).toBeOnTheScreen());
    setLanguage('gu');
    await renderAgain(actions({ entity }));
    gujarati.forEach(label => expect(screen.getByText(label)).toBeOnTheScreen());
    expect(screen.queryByText(/Print|Edit|Delete/)).not.toBeOnTheScreen();
  });

  it('asks before deleting with the document number left as typed', async () => {
    setLanguage('gu');
    await render(actions({ entity: 'invoice', entityNumber: '2555' }));
    await user.press(screen.getByRole('button', { name: 'ઇન્વૉઇસ ડિલીટ કરો' }));
    const [title, , buttons] = (showAlert as jest.Mock).mock.calls[0];
    expect(title).toBe('ઇન્વૉઇસ 2555 ડિલીટ કરવું છે?');
    expect(buttons[1].text).toBe('ઇન્વૉઇસ ડિલીટ કરો');
  });

  it('shows neither Edit nor Delete unless the caller says the role may', async () => {
    await render(<ActionsSection entity="grn" entityNumber="311" entityId="g1" onDelete={jest.fn()} onPrint={jest.fn()} />);
    expect(screen.getByText('Print GRN')).toBeOnTheScreen();
    expect(screen.queryByText('Edit GRN')).not.toBeOnTheScreen();
    expect(screen.queryByText('Delete GRN')).not.toBeOnTheScreen();
  });

  // WH-216: Edit is in the page header, so this section never draws it.
  it('shows no Delete, and no Edit (it is in the header), to a role that may edit but not delete', async () => {
    await render(actions({ entity: 'grn', canEdit: true, canDelete: false }));
    expect(screen.getByText('Print GRN')).toBeOnTheScreen();
    expect(screen.queryByText('Edit GRN')).not.toBeOnTheScreen();
    expect(screen.queryByText('Delete GRN')).not.toBeOnTheScreen();
  });

  it('still accepts a caller word alone, for English', async () => {
    await render(actions({ entityType: 'GRN' }));
    expect(screen.getByText('Print GRN')).toBeOnTheScreen();
    expect(screen.getByText('Delete GRN')).toBeOnTheScreen();
  });
});

describe('PrintRangeDialog', () => {
  const dialog = (props: Partial<React.ComponentProps<typeof PrintRangeDialog>>) => (
    <PrintRangeDialog visible onDismiss={jest.fn()} onConfirm={jest.fn()} title="Print" defaultNumber="" {...props} />
  );

  it('words the range texts for the document in both languages', async () => {
    await render(dialog({ entity: 'grn' }));
    expect(screen.getByText('Choose the range of GRN numbers to print.')).toBeOnTheScreen();
    expect(screen.getByText('Use the same number in both fields to print one GRN number.')).toBeOnTheScreen();
    expect(screen.getAllByPlaceholderText(/./).map(node => node.props.placeholder)).toEqual(['Start GRN number', 'End GRN number']);
    // The input also has accessibilityLabelledBy, which wins in the accessible name: the label itself is the prop.
    expect(screen.getByPlaceholderText('Start GRN number')).toHaveProp('accessibilityLabel', 'From GRN number');
    expect(screen.getByPlaceholderText('End GRN number')).toHaveProp('accessibilityLabel', 'To GRN number');

    setLanguage('gu');
    await renderAgain(dialog({ entity: 'grn' }));
    expect(screen.getByText('પ્રિન્ટ કરવા માટે આવક પાવતી નંબરની રેન્જ પસંદ કરો.')).toBeOnTheScreen();
    expect(screen.getByText('એક જ આવક પાવતી પ્રિન્ટ કરવા બંને ખાનામાં એક જ નંબર લખો.')).toBeOnTheScreen();
    expect(screen.getAllByPlaceholderText(/./).map(node => node.props.placeholder)).toEqual(['શરૂઆતનો આવક પાવતી નંબર', 'છેલ્લો આવક પાવતી નંબર']);
  });

  it('gives the same English as the older label prop did', async () => {
    await render(dialog({ entity: 'dispatch' }));
    const byEntity = JSON.stringify(screen.toJSON());
    await renderAgain(dialog({ label: 'Dispatch number' }));
    // The whole rendered tree: it covers the texts, the placeholders and the labels the old test compared.
    expect(JSON.stringify(screen.toJSON())).toBe(byEntity);
    expect(screen.getAllByPlaceholderText(/./)).toHaveLength(2);
  });
});

describe('DocumentSuccessDialog', () => {
  const data = { documentNo: '42', customerName: 'Patel Traders', itemCount: 2 };
  const success = (props: Partial<React.ComponentProps<typeof DocumentSuccessDialog>>) => (
    <DocumentSuccessDialog isVisible documentData={data} onCreateAnother={jest.fn()} onViewList={jest.fn()} onSharePDF={jest.fn()} {...props} />
  );

  it('takes entity, and gives the same texts as the older documentType', async () => {
    await render(success({ entity: 'dispatch' }));
    const byEntity = JSON.stringify(screen.toJSON());
    await renderAgain(success({ documentType: 'Dispatch' }));
    expect(JSON.stringify(screen.toJSON())).toBe(byEntity);
    await renderAgain(success({ entity: 'grn', isEditMode: true }));
    expect(screen.getByText('GRN updated')).toBeOnTheScreen();
    setLanguage('gu');
    await renderAgain(success({ entity: 'grn', isEditMode: true }));
    expect(screen.getByText('આવક પાવતી અપડેટ થઈ')).toBeOnTheScreen();
    await renderAgain(success({ entity: 'dispatch' }));
    expect(screen.getByText('જાવક બની ગઈ')).toBeOnTheScreen();
  });
});
