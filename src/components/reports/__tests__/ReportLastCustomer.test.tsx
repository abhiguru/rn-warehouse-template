/**
 * The "Last opened" row above a report's customers list, in all four themes.
 */
import React from 'react';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { BRANDS, getTokens, touchTarget, type Mode } from '@/theme/tokens';
import { ReportLastCustomer } from '../ReportLastCustomer';

let mockState: Record<string, unknown> = {};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));

async function renderRow(element: React.ReactElement, brand = 'orange', mode: Mode = 'light') {
  mockState = { theme: { preference: mode, brand } };
  await render(element);
}
const texts = () => screen.getAllByText(/./).map(node => [node.props.children].flat().join(''));

const MODES: Mode[] = ['light', 'dark'];
describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('last opened customer in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('is one labelled button on theme tokens that opens the customer', async () => {
    const onPress = jest.fn();
    const customer = { id: 'c1', name: 'Green Valley Traders' };
    await renderRow(
      <ReportLastCustomer customer={customer} onPress={onPress} accessibilityHint="Shows this customer's GRNs" />,
      brand,
      mode
    );
    expect(texts()).toEqual(['Last opened', 'Green Valley Traders']);
    const row = screen.getByRole('button', { name: 'Last opened: Green Valley Traders' });
    expect(screen.getByHintText("Shows this customer's GRNs")).toBe(row);
    expect(row).toHaveStyle({ backgroundColor: t.surface.card, minHeight: touchTarget });
    await fireEvent(row, 'responderGrant', { persist: jest.fn(), touchHistory: { touchBank: [] }, nativeEvent: { touches: [] } });
    expect(row).toHaveStyle({ backgroundColor: t.surface.cardPressed });
    await fireEvent(row, 'responderRelease', { persist: jest.fn(), touchHistory: { touchBank: [] }, nativeEvent: { touches: [] } });
    const user = userEvent.setup();
    await user.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(customer);
  });
});

it('names a customer that has no name "Customer"', async () => {
  await renderRow(<ReportLastCustomer customer={{ id: 'c9', name: '' }} onPress={jest.fn()} />);
  expect(texts()).toEqual(['Last opened', 'Customer']);
  expect(screen.getByRole('button', { name: 'Last opened: Customer' })).toBeOnTheScreen();
});
