import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, type Mode } from '@/theme/tokens';
import { GRNAutocomplete } from '../GRNAutocomplete';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockGetInvoiceableGrns = jest.fn();
jest.mock('@/features/invoice/services/invoiceFormService', () => ({
  getInvoiceableGrns: (...args: unknown[]) => mockGetInvoiceableGrns(...args),
}));

const MODES: Mode[] = ['light', 'dark'];

const grn = {
  id: 'g1',
  gr_no: '311',
  date: '2026-10-09',
  customer_id: 'c1',
  customer_name: 'Fictional Traders',
  sender_name: '',
  supervisor_name: '',
  total_dispatched_qty: 12,
  has_uninvoiced_items: true,
};

async function renderIn(brand: (typeof BRANDS)[number], mode: Mode) {
  mockState = { theme: { preference: mode, brand } };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<GRNAutocomplete isVisible onClose={jest.fn()} onSelect={jest.fn()} currentValue={grn} />);
  });
  return tree;
}

function allText(tree: ReactTestRenderer): string {
  return tree.root
    .findAll(node => (node.type as unknown) === 'Text')
    .map(node => [].concat(node.props.children).filter(c => typeof c === 'string').join(''))
    .join('|');
}

describe('GRNAutocomplete', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGetInvoiceableGrns.mockReset();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('%s %s', (brand, mode) => {
    it('lists GRNs with the document number and date', async () => {
      mockGetInvoiceableGrns.mockResolvedValue({ success: true, data: [grn] });
      const tree = await renderIn(brand, mode);
      const text = allText(tree);
      expect(text).toContain('GRN 311');
      expect(text).toContain('Fictional Traders');
      expect(text).toContain('1 GRN');
    });
  });

  it('shows an error with a retry action when loading fails', async () => {
    mockGetInvoiceableGrns.mockResolvedValue({ success: false, data: [], message: 'boom' });
    const tree = await renderIn('orange', 'light');
    const text = allText(tree);
    expect(text).toContain("Couldn't load GRNs");
    expect(text).toContain('Try again');
    expect(text).not.toContain('boom');
  });
});
