/**
 * Edit Dispatch: a line on a live invoice is read only. The load marks it with its invoice number; the refusal the
 * server still gives when someone invoiced it after the form opened is worded by the app, in both languages.
 */
import { getAuthenticatedClient } from '@/config/supabaseConfig';
import { setLanguage } from '@/i18n';
import { serverText } from '@/utils/serverText';
import { invoicedLineText } from '../../components/ItemsSummaryBottomSheet';
import { loadDispatchData } from '../dispatchFormService';

jest.mock('@/config/supabaseConfig', () => ({
  beginOperatorMutation: jest.fn(() => jest.fn()),
  getAuthenticatedClient: jest.fn(),
  getCurrentConfig: () => ({ url: 'https://facility.invalid', anonKey: 'anon' }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({ __esModule: true, default: () => null }));
jest.mock('react-native-gesture-handler', () => ({}));

afterEach(() => setLanguage('en'));

const line = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  grn_item_id: `lot-${id}`,
  disp_qty: 5,
  grn_details: { id: 'g1', gr_no: 'A0001', date: '2026-10-01', customer_name: 'Fictional Traders' },
  grn_item_details: { item_name: 'Potatoes', qty: 20, stock: 10 },
  item_details: { id: 'i1' },
  ...extra,
});

it('marks only the line that is on a live invoice with its invoice number', async () => {
  const rpc = jest.fn(async () => ({
    data: { success: true, data: { dispatch: { disp_no: 'I0001', disp_date: '2026-10-01', customer_id: 'c1', items: [line('a', { invoice_details: { invoice_no: 'INV7' } }), line('b')] } } },
    error: null,
  }));
  jest.mocked(getAuthenticatedClient).mockResolvedValue({ rpc } as never);

  const result = await loadDispatchData('d1');

  const items = result.data!.items;
  expect(items.find((i) => i.unique_id === 'a')!.invoice_no).toBe('INV7');
  expect('invoice_no' in items.find((i) => i.unique_id === 'b')!).toBe(false);
});

it('words a line on an invoice with the sentence the header uses, and says nothing for another line', () => {
  const base = { unique_id: 'a' } as never;
  expect(invoicedLineText({ ...(base as object), invoice_no: 'INV7' } as never)).toBe('On invoice INV7. Delete or edit the invoice first.');
  expect(invoicedLineText(base)).toBeUndefined();
});

describe('the refusal "Cannot modify invoiced items"', () => {
  const server = 'Cannot modify invoiced items: Potatoes, Onions';

  it('is the app\'s sentence naming the items, never the server English', () => {
    expect(serverText(server, 'x', { write: true, form: true })).toBe('Potatoes, Onions are on invoices. Delete or edit those invoices first.');
    expect(serverText(`Database error: ${server} (SQLState: WH409)`, 'x')).toBe('Potatoes, Onions are on invoices. Delete or edit those invoices first.');
  });

  it('is in the singular for one item', () => {
    expect(serverText('Cannot modify invoiced items: Potatoes', 'x', { write: true, form: true })).toBe('Potatoes is on an invoice. Delete or edit the invoice first.');
  });

  it('is Gujarati in Gujarati, with the names kept', () => {
    setLanguage('gu');
    const text = serverText(server, 'x', { write: true, form: true });
    expect(text).toContain('Potatoes, Onions');
    expect(text).not.toMatch(/Cannot modify/);
    expect(text).toMatch(/ઇન્વૉઇસ/);
  });
});
