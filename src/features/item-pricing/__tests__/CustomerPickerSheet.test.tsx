import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { CUSTOMER_PICKER_SNAP_POINTS, CustomerPickerSheet } from '../components/CustomerPickerSheet';
import { searchService } from '@/services/search-service';

let sheetProps: Record<string, unknown> = {};
jest.mock('@/components/common/SearchableBottomSheet', () => ({
  SearchableBottomSheet: (props: Record<string, unknown>) => { sheetProps = props; return null; },
}));
jest.mock('@/services/search-service', () => ({ searchService: { searchCustomers: jest.fn() } }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

describe('CustomerPickerSheet (P-28)', () => {
  it('opens as a tall sheet whose height does not change after typing', () => {
    act(() => { create(<CustomerPickerSheet visible onClose={jest.fn()} onSelect={jest.fn()} />); });
    expect(CUSTOMER_PICKER_SNAP_POINTS[0]).toBe('90%');
    expect(sheetProps.snapPoints).toBe(CUSTOMER_PICKER_SNAP_POINTS);
    expect(sheetProps.title).toBe('Choose a customer');
    expect(sheetProps.emptyInitialText).toBe('Type part of the name or the mobile number.');
  });

  it('tells two customers of the same name apart by city and mobile', async () => {
    jest.mocked(searchService.searchCustomers).mockResolvedValue([
      { label: 'Review Orchard A', value: 'a1', city: 'Rajkot', mobile: '919000000011', type: 'customer' },
      { label: 'Review Orchard A', value: 'a2', city: 'Surat', mobile: '919000000012', type: 'customer' },
    ] as never);
    act(() => { create(<CustomerPickerSheet visible onClose={jest.fn()} onSelect={jest.fn()} />); });
    const found = await (sheetProps.searchFn as (q: string) => Promise<{ id: string; name: string; city?: string; mobile?: string }[]>)('orchard a');
    expect(found.map(c => c.id)).toEqual(['a1', 'a2']);
    const render = (c: unknown) => create((sheetProps.renderItem as (c: unknown, s: () => void) => React.ReactElement)(c, jest.fn()));
    const lines = found.map(c => {
      let r!: ReturnType<typeof create>;
      act(() => { r = render(c); });
      return r.root.findAllByType(Text).map(n => [n.props.children].flat().join('')).slice(-1)[0];
    });
    expect(lines).toEqual(['Rajkot · +91 90000 00011', 'Surat · +91 90000 00012']);
    expect(lines[0]).not.toBe(lines[1]);
  });

  it('hands the chosen customer to the caller', () => {
    const onSelect = jest.fn();
    act(() => { create(<CustomerPickerSheet visible onClose={jest.fn()} onSelect={onSelect} />); });
    const customer = { id: 'a1', name: 'Review Orchard A' };
    (sheetProps.onSelect as (c: unknown) => void)(customer);
    expect(onSelect).toHaveBeenCalledWith(customer);
  });
});
