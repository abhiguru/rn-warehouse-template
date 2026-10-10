/**
 * Shared components that say something about a document take a stable `entity`
 * (and `mode`) and pick whole sentences with it, in both languages. A caller's
 * own word (the older props) is only placed into the English sentences.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
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
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/config/demoCapabilities', () => ({
  DEMO_CAPABILITIES: { printing: true, sensors: false, realtime: true, customerDocuments: false },
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));

jest.useFakeTimers();

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    mounted.splice(0).forEach(tree => tree.unmount());
    jest.runOnlyPendingTimers();
  });
  setLanguage('en');
  jest.clearAllMocks();
});

function render(element: React.ReactElement) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  mounted.push(tree);
  return tree;
}
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAll(node => (node.type as unknown) === 'Text').map(node => [].concat(node.props.children).join(''));
const labels = (tree: ReactTestRenderer) =>
  tree.root.findAll(node => typeof node.type === 'string' && typeof node.props.accessibilityLabel === 'string').map(node => node.props.accessibilityLabel as string);
const placeholders = (tree: ReactTestRenderer) =>
  tree.root.findAll(node => typeof node.type === 'string' && typeof node.props.placeholder === 'string').map(node => node.props.placeholder as string);

const STEPS = [{ label: 'One' }, { label: 'Two' }, { label: 'Three' }];
const header = (props: Partial<React.ComponentProps<typeof GenericStepIndicatorHeader>>) =>
  render(<GenericStepIndicatorHeader steps={STEPS} currentStep={1} completedSteps={[]} onCancel={jest.fn()} {...props} />);
const closeButton = (tree: ReactTestRenderer) =>
  tree.root.find(node => typeof node.type === 'string' && node.props.accessibilityRole === 'button' && node.props.accessibilityHint !== undefined && !/^Step|પગલું/.test(node.props.accessibilityLabel));

describe('GenericStepIndicatorHeader', () => {
  it.each([
    ['grn', 'create', 'Cancel GRN', 'આવક પાવતી રદ કરો'],
    ['grn', 'edit', 'Cancel editing', 'ફેરફાર રદ કરો'],
    ['dispatch', 'create', 'Cancel Dispatch', 'જાવક રદ કરો'],
    ['dispatch', 'edit', 'Cancel editing', 'ફેરફાર રદ કરો'],
    ['invoice', 'create', 'Cancel Invoice', 'ઇન્વૉઇસ રદ કરો'],
    ['customer', 'create', 'Cancel customer', 'વેપારી રદ કરો'],
  ] as const)('names the close button for %s in %s mode in both languages', (entity, mode, english, gujarati) => {
    expect(closeButton(header({ entity, mode })).props.accessibilityLabel).toBe(english);
    setLanguage('gu');
    expect(closeButton(header({ entity, mode })).props.accessibilityLabel).toBe(gujarati);
  });

  it('chooses by mode, not by the label on screen', () => {
    // The label reads "Edit" but the wizard creates: before, the word on screen decided.
    expect(closeButton(header({ entity: 'grn', mode: 'create', entityName: 'Edit' })).props.accessibilityLabel).toBe('Cancel GRN');
    setLanguage('gu');
    // A Gujarati label never matched 'edit': edit mode must still say "cancel the changes".
    expect(closeButton(header({ entity: 'dispatch', mode: 'edit', entityName: 'ફેરફાર' })).props.accessibilityLabel).toBe('ફેરફાર રદ કરો');
  });

  it('shows the name of the entity when no label is given, and the given label otherwise', () => {
    expect(texts(header({ entity: 'customer' }))).toContain('Customer');
    expect(texts(header({ entity: 'invoice', mode: 'edit', entityName: 'Edit invoice' }))).toContain('Edit invoice');
    setLanguage('gu');
    expect(texts(header({ entity: 'customer' }))).toContain('વેપારી');
  });

  it('asks a whole-sentence discard question when the screen gives no title', () => {
    setLanguage('gu');
    const tree = header({ entity: 'dispatch' });
    const close = tree.root.find(node => node.props.accessibilityLabel === 'જાવક રદ કરો' && typeof node.props.onPress === 'function');
    act(() => close.props.onPress());
    expect((showAlert as jest.Mock).mock.calls[0][0]).toBe('આ જાવક છોડી દેવી છે?');
  });

  it('still accepts a caller word alone, for English', () => {
    expect(closeButton(header({ entityName: 'GRN' })).props.accessibilityLabel).toBe('Cancel GRN');
    expect(closeButton(header({ entityName: 'Anything', mode: 'edit' })).props.accessibilityLabel).toBe('Cancel editing');
  });
});

describe('ActionsSection', () => {
  const actions = (props: Partial<React.ComponentProps<typeof ActionsSection>>) =>
    render(<ActionsSection entityNumber="311" entityId="g1" onEdit={jest.fn()} onDelete={jest.fn()} onPrint={jest.fn()} {...props} />);

  it.each([
    ['grn', ['Print GRN', 'Edit GRN', 'Delete GRN'], ['આવક પાવતી પ્રિન્ટ કરો', 'આવક પાવતીમાં ફેરફાર કરો', 'આવક પાવતી ડિલીટ કરો']],
    ['dispatch', ['Print Dispatch', 'Edit Dispatch', 'Delete Dispatch'], ['જાવક પ્રિન્ટ કરો', 'જાવકમાં ફેરફાર કરો', 'જાવક ડિલીટ કરો']],
    ['invoice', ['Print Invoice', 'Edit Invoice', 'Delete Invoice'], ['ઇન્વૉઇસ પ્રિન્ટ કરો', 'ઇન્વૉઇસમાં ફેરફાર કરો', 'ઇન્વૉઇસ ડિલીટ કરો']],
  ] as const)('labels the buttons for %s in both languages', (entity, english, gujarati) => {
    expect(texts(actions({ entity }))).toEqual(expect.arrayContaining([...english]));
    setLanguage('gu');
    const shown = texts(actions({ entity }));
    expect(shown).toEqual(expect.arrayContaining([...gujarati]));
    expect(shown.join(' ')).not.toMatch(/Print|Edit|Delete/);
  });

  it('asks before deleting with the document number left as typed', () => {
    setLanguage('gu');
    const tree = actions({ entity: 'invoice', entityNumber: '2555' });
    const remove = tree.root.find(node => node.props.accessibilityLabel === 'ઇન્વૉઇસ ડિલીટ કરો' && typeof node.props.onPress === 'function');
    act(() => remove.props.onPress());
    const [title, , buttons] = (showAlert as jest.Mock).mock.calls[0];
    expect(title).toBe('ઇન્વૉઇસ 2555 ડિલીટ કરવું છે?');
    expect(buttons[1].text).toBe('ઇન્વૉઇસ ડિલીટ કરો');
  });

  it('still accepts a caller word alone, for English', () => {
    expect(texts(actions({ entityType: 'GRN' }))).toEqual(expect.arrayContaining(['Print GRN', 'Edit GRN', 'Delete GRN']));
  });
});

describe('PrintRangeDialog', () => {
  const dialog = (props: Partial<React.ComponentProps<typeof PrintRangeDialog>>) =>
    render(<PrintRangeDialog visible onDismiss={jest.fn()} onConfirm={jest.fn()} title="Print" defaultNumber="" {...props} />);

  it('words the range texts for the document in both languages', () => {
    const english = dialog({ entity: 'grn' });
    expect(texts(english)).toEqual(expect.arrayContaining([
      'Choose the range of GRN numbers to print.',
      'Use the same number in both fields to print one GRN number.',
    ]));
    expect(placeholders(english)).toEqual(['Start GRN number', 'End GRN number']);
    expect(labels(english)).toEqual(expect.arrayContaining(['From GRN number', 'To GRN number']));

    setLanguage('gu');
    const gujarati = dialog({ entity: 'grn' });
    expect(texts(gujarati)).toEqual(expect.arrayContaining([
      'પ્રિન્ટ કરવા માટે આવક પાવતી નંબરની રેન્જ પસંદ કરો.',
      'એક જ આવક પાવતી પ્રિન્ટ કરવા બંને ખાનામાં એક જ નંબર લખો.',
    ]));
    expect(placeholders(gujarati)).toEqual(['શરૂઆતનો આવક પાવતી નંબર', 'છેલ્લો આવક પાવતી નંબર']);
  });

  it('gives the same English as the older label prop did', () => {
    const byEntity = dialog({ entity: 'dispatch' });
    const byLabel = dialog({ label: 'Dispatch number' });
    expect(texts(byEntity)).toEqual(texts(byLabel));
    expect(placeholders(byEntity)).toEqual(placeholders(byLabel));
    expect(labels(byEntity)).toEqual(labels(byLabel));
  });
});

describe('DocumentSuccessDialog', () => {
  const data = { documentNo: '42', customerName: 'Patel Traders', itemCount: 2 };
  const success = (props: Partial<React.ComponentProps<typeof DocumentSuccessDialog>>) =>
    render(<DocumentSuccessDialog isVisible documentData={data} onCreateAnother={jest.fn()} onViewList={jest.fn()} onSharePDF={jest.fn()} {...props} />);

  it('takes entity, and gives the same texts as the older documentType', () => {
    expect(texts(success({ entity: 'dispatch' }))).toEqual(texts(success({ documentType: 'Dispatch' })));
    expect(texts(success({ entity: 'grn', isEditMode: true }))).toContain('GRN updated');
    setLanguage('gu');
    expect(texts(success({ entity: 'grn', isEditMode: true }))).toContain('આવક પાવતી અપડેટ થઈ');
    expect(texts(success({ entity: 'dispatch' }))).toContain('જાવક બની ગઈ');
  });
});
