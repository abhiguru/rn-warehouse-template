/** The per-band "From" inputs report to the screen, so Save can scroll to them and Next can leave them. */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';

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
  it('register under firstFrom and band.<i>.from and pass Next on', async () => {
    const draft = {
      priceType: 'monthly', startsOn: null, startsOnChoice: null, firstFrom: 0, labour: '1', tax: '5',
      bands: [{ upTo: '40', rent: '3' }, { upTo: '100', rent: '4', fromText: '61' }],
    } as unknown as Draft;
    const ctx = { customerId: 'c1', mode: 'addCustomer', rows: [], editingIds: [], today: '2026-10-14' } as unknown as EditorContext;
    const registered: string[] = [];
    const next: string[] = [];
    const fields = { register: (k: string, n: unknown) => { if (n) registered.push(k); }, onFocus: jest.fn(), next: (k: string) => next.push(k) };
    await render(<BandsEditor draft={draft} ctx={ctx} errors={{}} onChange={jest.fn()} fields={fields} />);
    // The From inputs have a label shared with every band, so each is found by its test id (CG-68: no name tells them apart).
    expect(screen.getByTestId('first-from')).toHaveProp('onSubmitEditing');
    await userEvent.type(screen.getByTestId('band-1-from'), '', { submitEditing: true });
    expect(next).toEqual(['band.1.from']);
    expect(registered).toEqual(expect.arrayContaining(['firstFrom', 'band.1.from']));
  });
});
