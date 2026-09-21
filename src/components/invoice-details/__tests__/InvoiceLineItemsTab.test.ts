import { groupItemsByGrnItem, InvoiceLineItem } from '../InvoiceLineItemsTab';

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useListColors', () => ({
  useListColors: jest.fn(() => ({})),
}));

const makeLine = (
  id: string,
  dispatchNo: string,
  quantity: number
): InvoiceLineItem => ({
  id,
  item_name: 'Example Potatoes',
  grn_id: '20252868-b5d6-11f1-98b6-336cf2ba48b4',
  grn_item_id: 'a0003-item',
  grn_quantity: 100,
  dispatch_no: dispatchNo,
  dispatch_qty: quantity,
  duration: '1',
  charge: 5,
  charge_per_unit: 5,
  labour_rate: 2,
  tax: 5,
});

describe('groupItemsByGrnItem', () => {
  it('calculates monetary tax from the percentage for grouped dispatch lines', () => {
    const groups = groupItemsByGrnItem([
      makeLine('line-1', 'I0001', 20),
      makeLine('line-2', 'I0002', 10),
      makeLine('line-3', 'I0003', 70),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      total_dispatch_qty: 100,
      total_base_amount: 700,
      total_tax_amount: 35,
      total_amount: 735,
      tax_rate: 5,
    });
    expect(groups[0].dispatch_items.map((item) => item.tax)).toEqual([
      7,
      3.5,
      24.5,
    ]);
  });

  it('preserves the GRN UUID used by the details route', () => {
    const [group] = groupItemsByGrnItem([
      makeLine('line-1', 'I0001', 20),
    ]);

    expect(group.grn_id).toBe('20252868-b5d6-11f1-98b6-336cf2ba48b4');
  });
});
