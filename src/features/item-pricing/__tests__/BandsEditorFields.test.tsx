/** The per-band "From" inputs report to the screen, so Save can scroll to them and Next can leave them. */
import React from 'react';
import { create, act } from 'react-test-renderer';

const mockState = { theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1' } } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(() => Promise.resolve(null)), setItem: jest.fn(() => Promise.resolve()) }));

import { BandsEditor } from '../components/BandsEditor';
import type { Draft, EditorContext } from '../editModel';

describe('BandsEditor From inputs', () => {
  it('register under firstFrom and band.<i>.from and pass Next on', () => {
    const draft = {
      priceType: 'monthly', startsOn: null, startsOnChoice: null, firstFrom: 0, labour: '1', tax: '5',
      bands: [{ upTo: '40', rent: '3' }, { upTo: '100', rent: '4', fromText: '61' }],
    } as unknown as Draft;
    const ctx = { customerId: 'c1', mode: 'addCustomer', rows: [], editingIds: [], today: '2026-10-14' } as unknown as EditorContext;
    const registered: string[] = [];
    const next: string[] = [];
    const fields = { register: (k: string, n: unknown) => { if (n) registered.push(k); }, onFocus: jest.fn(), next: (k: string) => next.push(k) };
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<BandsEditor draft={draft} ctx={ctx} errors={{}} onChange={jest.fn()} fields={fields} />); });
    const input = (id: string) => tree.root.findAll(n => n.props.testID === id && typeof n.type !== 'string')[0];
    expect(input('first-from').props.onSubmitEditing).toBeDefined();
    input('band-1-from').props.onSubmitEditing();
    expect(next).toEqual(['band.1.from']);
    expect(registered).toEqual(expect.arrayContaining(['firstFrom', 'band.1.from']));
    act(() => tree.unmount());
  });
});
