import React from 'react';
import { act, create } from 'react-test-renderer';
import { HowInvoiceSheet } from '@/features/item-pricing/components/HowInvoiceSheet';
import { setLanguage } from '@/i18n';
import { textsOf } from '@/tests/helpers/rateEditorFixtures';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@/features/filters/components/SheetFrame', () => ({
  SheetFrame: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

afterEach(() => setLanguage('en'));

describe('How an invoice picks a rate', () => {
  it('starts with the saved invoice keeping its figures and the GRN-only rate coming first', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<HowInvoiceSheet visible onClose={() => {}} />); });
    const lines = textsOf(tree).filter(x => x !== '');
    expect(lines).toEqual(expect.arrayContaining(['A saved invoice keeps its own figures.', "A rate set for that GRN only comes before the customer's rate."]));
    expect(lines.indexOf('A saved invoice keeps its own figures.')).toBeLessThan(lines.indexOf("The customer's own rate, if there is one for that bag weight."));
  });

  it('numbers the lines 1 to 7 in Gujarati digits', () => {
    setLanguage('gu');
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<HowInvoiceSheet visible onClose={() => {}} />); });
    const lines = textsOf(tree);
    expect(lines).toEqual(expect.arrayContaining(['૧.', '૭.', 'સાચવેલો ઇન્વૉઇસ પોતાના આંકડા જ રાખે છે.']));
  });
});
