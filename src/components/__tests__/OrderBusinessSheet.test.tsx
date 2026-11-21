/**
 * The business chooser on Create order (phone review 2026-10-14, PW-01), in all
 * four themes: its rows with their cities, the wait, the failure, the account
 * with no business, and how high the sheet is for few and for many businesses.
 */
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { setLanguage } from '@/i18n';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import type { OwnBusiness } from '@/features/customer/ownBusinesses';
import { OrderBusinessSheet } from '../OrderBusinessSheet';

let mockState: Record<string, unknown> = {};
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
// The facility's answer to "which businesses are this account's own".
const mockRead = jest.fn<Promise<OwnBusiness[]>, []>();
// What the facility says about the account when the list is empty (null: no clear answer).
const mockStatus = jest.fn<Promise<'active' | 'revoked' | 'none' | null>, []>();
jest.mock('@/features/customer/ownBusinesses', () => ({ readOwnBusinesses: () => mockRead(), readAccessStatus: () => mockStatus() }));

const business = (n: number): OwnBusiness => ({ id: `b${n}`, name: `Fictional Business ${n}`, city: `Town ${n}` });
const TWO: OwnBusiness[] = [
  { id: 'b1', name: 'Amber Field Traders', city: 'Northgate' },
  { id: 'b2', name: 'Birchwood Produce', city: 'Southmere' },
];

afterEach(() => {
  mockRead.mockReset();
  mockStatus.mockReset().mockResolvedValue(null);
  setLanguage('en');
});

const element = (visible: boolean, onPick = jest.fn(), onClose = jest.fn()) => <OrderBusinessSheet visible={visible} onClose={onClose} onPick={onPick} />;
async function open(brand = 'orange', mode: Mode = 'light') {
  mockState = { theme: { preference: mode, brand } };
  const onPick = jest.fn();
  const onClose = jest.fn();
  await render(element(true, onPick, onClose));
  return { onPick, onClose };
}
/** The business rows: the only buttons that carry the "Opens the order" hint. */
const rows = () => screen.queryAllByRole('button').filter(node => node.props.accessibilityHint === 'Opens the order for this business');
const rowLabels = () => rows().map(row => row.props.accessibilityLabel);
const flat = (style: unknown) => (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

type HostNode = NonNullable<typeof screen.root>;
/**
 * Icons are drawn as a bare 'Icon' host with no role or text (the vector-icons mock), so they can only be
 * found by walking the rendered tree.
 */
const icon = (name: string): HostNode | undefined => {
  let found: HostNode | undefined;
  const walk = (node: HostNode) => {
    if (!found && (node.type as unknown) === 'Icon' && node.props.name === name) found = node;
    for (const child of node.children) if (typeof child !== 'string') walk(child as HostNode);
  };
  walk(screen.root as HostNode);
  return found;
};
/**
 * The sheet itself: the view that rises from the bottom. It has no role, label or test id, so it is found
 * from the title above its content: the nearest ancestor that marks itself modal.
 */
const sheet = (): HostNode => {
  let node = screen.getByRole('header', { name: 'Choose a business' }).parent;
  while (node && node.props.accessibilityViewIsModal !== true) node = node.parent;
  if (!node) throw new Error('no modal sheet around the title');
  return node;
};
const scroll = () => flat(screen.getByTestId('order-business-scroll').props.style);

const MODES: Mode[] = ['light', 'dark'];
describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('business chooser in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('lists the businesses with their cities on theme tokens', async () => {
    mockRead.mockResolvedValue(TWO);
    await open(brand, mode);
    for (const text of ['Choose a business', 'Amber Field Traders', 'Northgate', 'Birchwood Produce', 'Southmere']) {
      expect(screen.getByText(text)).toBeOnTheScreen();
    }
    expect(sheet()).toHaveStyle({ backgroundColor: t.surface.sheet });
    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toHaveStyle({ backgroundColor: t.surface.card });
    // Held down, the row takes the pressed surface.
    const pressing = userEvent.setup({ delay: 0 }).longPress(rows()[0], { duration: 400 });
    await waitFor(() => expect(rows()[0]).toHaveStyle({ backgroundColor: t.surface.cardPressed }));
    await pressing;
    expect(screen.getByText('Amber Field Traders')).toHaveStyle({ color: t.text.primary });
    expect(screen.getByText('Northgate')).toHaveStyle({ color: t.text.secondary });
    expect(icon('chevron-right')?.props.color).toBe(t.icon.secondary);
  });

  it('shows a spinner in the brand colour while the facility has not answered', async () => {
    mockRead.mockReturnValue(new Promise(() => {}));
    await open(brand, mode);
    const spinner = screen.getByTestId('order-business-loading');
    expect(spinner.props.color).toBe(t.brand.tint);
    expect(spinner.props.accessibilityLabel).toBe('Loading…');
    expect(rows()).toHaveLength(0);
    expect(screen.getByText('Choose a business')).toBeOnTheScreen();
  });

  it('says so when the businesses cannot be read, and when the account has none', async () => {
    mockRead.mockRejectedValue(new Error('offline'));
    await open(brand, mode);
    expect(await screen.findByText("Couldn't load your businesses")).toBeOnTheScreen();
    expect(screen.getByText('Check your connection and try again.')).toBeOnTheScreen();
    expect(icon('alert-circle-outline')?.props.color).toBe(t.status.negative.text);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    await screen.unmount();

    mockRead.mockReset().mockResolvedValue([]);
    await open(brand, mode);
    expect(await screen.findByText('No business linked')).toBeOnTheScreen();
    expect(screen.getByText('No business is linked to your account. Ask your facility to link one.')).toBeOnTheScreen();
    expect(icon('account-off-outline')?.props.color).toBe(t.icon.secondary);
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();
    expect(rows()).toHaveLength(0);
  });
});

describe('how high the sheet is', () => {
  const shortLimit = Dimensions.get('window').height * 0.6;

  it.each([2, 5])('is as high as its rows for %d businesses, and lets them scroll before they leave the screen', async count => {
    mockRead.mockResolvedValue(Array.from({ length: count }, (_, index) => business(index + 1)));
    await open();
    expect(rows()).toHaveLength(count);
    expect(flat(sheet().props.style).height).toBeUndefined();
    expect(scroll()).toMatchObject({ maxHeight: shortLimit });
    expect(scroll().flex).toBeUndefined();
  });

  it('is tall with a scrolling list for six businesses', async () => {
    mockRead.mockResolvedValue(Array.from({ length: 6 }, (_, index) => business(index + 1)));
    await open();
    expect(rows()).toHaveLength(6);
    expect(flat(sheet().props.style).height).toBe('88%');
    expect(scroll()).toMatchObject({ flex: 1 });
    expect(scroll().maxHeight).toBeUndefined();
  });

  it.each([
    ['waiting', () => mockRead.mockReturnValue(new Promise(() => {}))],
    ['failed', () => mockRead.mockRejectedValue(new Error('offline'))],
    ['none', () => mockRead.mockResolvedValue([])],
  ])('is as high as its content while %s', async (_state, arrange) => {
    arrange();
    await open();
    expect(flat(sheet().props.style).height).toBeUndefined();
    expect(scroll()).toMatchObject({ maxHeight: shortLimit });
  });
});

describe('choosing and closing', () => {
  const user = userEvent.setup({ delay: 0 });

  it('tags a deactivated business in its row and its spoken label, and still lets it be picked', async () => {
    mockRead.mockResolvedValue([
      { id: 'b1', name: 'Amber Field Traders', city: 'Northgate', active: false },
      { id: 'b2', name: 'Birchwood Produce', city: 'Southmere', active: true },
    ]);
    const { onPick } = await open();
    expect(rowLabels()).toEqual(['Amber Field Traders, Northgate, Deactivated', 'Birchwood Produce, Southmere']);
    await user.press(rows()[0]);
    expect(onPick).toHaveBeenCalledWith({ id: 'b1', name: 'Amber Field Traders', city: 'Northgate' });
  });

  it('hands back the business pressed, and reads its city with its name', async () => {
    mockRead.mockResolvedValue(TWO);
    const { onPick, onClose } = await open();
    expect(rowLabels()).toEqual(['Amber Field Traders, Northgate', 'Birchwood Produce, Southmere']);
    expect(screen.getAllByRole('button', { name: /, (Northgate|Southmere)$/ })).toHaveLength(2);
    await user.press(screen.getByRole('button', { name: 'Birchwood Produce, Southmere' }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith({ id: 'b2', name: 'Birchwood Produce', city: 'Southmere' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('gives a business with no city one line, and one with no name the word for it', async () => {
    mockRead.mockResolvedValue([{ id: 'b1', name: 'Amber Field Traders', city: '' }, { id: 'b2', name: '', city: 'Southmere' }]);
    const { onPick } = await open();
    expect(rowLabels()).toEqual(['Amber Field Traders', 'Customer, Southmere']);
    // The row draws the initials and the name, and no second line.
    const drawn = within(rows()[0]).getAllByText(/./, { includeHiddenElements: true }).map(node => node.props.children);
    expect(drawn).toEqual(['AF', 'Amber Field Traders']);
    await user.press(rows()[1]);
    expect(onPick).toHaveBeenCalledWith({ id: 'b2', name: '', city: 'Southmere' });
  });

  it('closes on the X (Close) without choosing', async () => {
    mockRead.mockResolvedValue(TWO);
    const { onPick, onClose } = await open();
    await user.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('draws nothing and asks nothing while closed, and asks the facility again each time it opens', async () => {
    mockRead.mockResolvedValue(TWO);
    mockState = { theme: { preference: 'light', brand: 'orange' } };
    await render(element(false));
    expect(screen.toJSON()).toBeNull();
    expect(mockRead).not.toHaveBeenCalled();

    await screen.rerender(element(true));
    expect(mockRead).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Amber Field Traders')).toBeOnTheScreen();
    expect(rows()).toHaveLength(2);

    await screen.rerender(element(false));
    expect(screen.toJSON()).toBeNull();
    mockRead.mockResolvedValue([TWO[0], TWO[1], business(3)]);
    await screen.rerender(element(true));
    expect(mockRead).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Fictional Business 3')).toBeOnTheScreen();
    expect(rows()).toHaveLength(3);
  });

  it('reads again on Try again and then lists the businesses', async () => {
    mockRead.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(TWO);
    await open();
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    expect(rows()).toHaveLength(0);
    await user.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Amber Field Traders')).toBeOnTheScreen();
    expect(mockRead).toHaveBeenCalledTimes(2);
    expect(rowLabels()).toEqual(['Amber Field Traders, Northgate', 'Birchwood Produce, Southmere']);
    expect(screen.queryByText("Couldn't load your businesses")).not.toBeOnTheScreen();
  });
});

it('speaks Gujarati', async () => {
  setLanguage('gu');
  mockRead.mockResolvedValue([]);
  await open();
  expect(await screen.findByText('કોઈ વેપારી જોડાયેલ નથી')).toBeOnTheScreen();
  expect(screen.getByText('વેપારી પસંદ કરો')).toBeOnTheScreen();
  expect(screen.getByText('તમારા ખાતા સાથે કોઈ વેપારી જોડાયેલ નથી. તમારા કોલ્ડ સ્ટોરેજને વેપારી જોડવા કહો.')).toBeOnTheScreen();
});

describe('an empty list: revoked or no business linked (migration 80, get_my_access_status)', () => {
  const REVOKED = 'Your cold storage has removed your businesses. Ask them to add one.';
  const NO_BUSINESS = 'No business is linked to your account. Ask your facility to link one.';

  it("'revoked' says so in the sheet: no sign-out, the sheet stays open", async () => {
    mockRead.mockResolvedValue([]);
    mockStatus.mockResolvedValue('revoked');
    const { onClose } = await open();
    expect(await screen.findByText(REVOKED)).toBeOnTheScreen();
    expect(screen.queryByText(NO_BUSINESS)).not.toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each([
    ['none', () => mockStatus.mockResolvedValue('none')],
    ['active', () => mockStatus.mockResolvedValue('active')],
    ['an unknown text', () => mockStatus.mockResolvedValue('banned' as never)],
    ['a failed call or a missing function (null)', () => mockStatus.mockResolvedValue(null)],
  ])('%s keeps the "No business linked" guidance', async (_name, arrange) => {
    mockRead.mockResolvedValue([]);
    arrange();
    const { onClose } = await open();
    expect(await screen.findByText('No business linked')).toBeOnTheScreen();
    expect(screen.getByText(NO_BUSINESS)).toBeOnTheScreen();
    expect(screen.queryByText(REVOKED)).not.toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not ask when there are businesses', async () => {
    mockRead.mockResolvedValue(TWO);
    mockStatus.mockResolvedValue('revoked');
    await open();
    expect(await screen.findByText('Amber Field Traders')).toBeOnTheScreen();
    expect(mockStatus).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(2);
  });
});
