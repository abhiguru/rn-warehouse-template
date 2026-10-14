/**
 * The business chooser on Create order (phone review 2026-10-14, PW-01), in all
 * four themes: its rows with their cities, the wait, the failure, the account
 * with no business, and how high the sheet is for few and for many businesses.
 */
import React from 'react';
import { Dimensions, ScrollView, StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
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

let tree: ReactTestRenderer | undefined;
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = undefined;
  mockRead.mockReset();
  mockStatus.mockReset().mockResolvedValue(null);
  setLanguage('en');
});

const element = (visible: boolean, onPick = jest.fn(), onClose = jest.fn()) => <OrderBusinessSheet visible={visible} onClose={onClose} onPick={onPick} />;
async function open(brand = 'orange', mode: Mode = 'light') {
  mockState = { theme: { preference: mode, brand } };
  const onPick = jest.fn();
  const onClose = jest.fn();
  await act(async () => {
    tree = create(element(true, onPick, onClose));
  });
  return { onPick, onClose };
}
const rows = () => tree!.root.findAll(node => typeof node.props.testID === 'string' && node.props.testID.startsWith('order-business-b') && typeof node.props.onPress === 'function');
const texts = () => tree!.root.findAll(node => (node.type as unknown) === 'Text').map(node => [node.props.children].flat().join(''));
const flat = (style: unknown) => (StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style) ?? {}) as Record<string, unknown>;
const pressable = (label: string) => tree!.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const icon = (name: string) => tree!.root.findAll(node => (node.type as unknown) === 'Icon' && node.props.name === name)[0];
/** The sheet itself: the view that rises from the bottom. */
const sheet = () => tree!.root.findAll(node => node.props.accessibilityViewIsModal === true)[0];
const scroll = () => tree!.root.findByType(ScrollView);

const MODES: Mode[] = ['light', 'dark'];
describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('business chooser in %s %s', (brand, mode) => {
  const t = getTokens(brand, mode);

  it('lists the businesses with their cities on theme tokens', async () => {
    mockRead.mockResolvedValue(TWO);
    await open(brand, mode);
    expect(texts()).toEqual(expect.arrayContaining(['Choose a business', 'Cancel', 'Amber Field Traders', 'Northgate', 'Birchwood Produce', 'Southmere']));
    expect(flat(sheet().props.style).backgroundColor).toBe(t.surface.sheet);
    expect(rows()).toHaveLength(2);
    expect(flat(rows()[0].props.style).backgroundColor).toBe(t.surface.card);
    expect(flat(rows()[0].props.style({ pressed: true })).backgroundColor).toBe(t.surface.cardPressed);
    const text = (value: string) => tree!.root.findAll(node => (node.type as unknown) === 'Text' && node.props.children === value)[0];
    expect(flat(text('Amber Field Traders').props.style).color).toBe(t.text.primary);
    expect(flat(text('Northgate').props.style).color).toBe(t.text.secondary);
    expect(icon('chevron-right').props.color).toBe(t.icon.secondary);
  });

  it('shows a spinner in the brand colour while the facility has not answered', async () => {
    mockRead.mockReturnValue(new Promise(() => {}));
    await open(brand, mode);
    const spinner = tree!.root.findAll(node => node.props.testID === 'order-business-loading')[0];
    expect(spinner.props.color).toBe(t.brand.tint);
    expect(spinner.props.accessibilityLabel).toBe('Loading…');
    expect(rows()).toHaveLength(0);
    expect(texts()).toContain('Choose a business');
  });

  it('says so when the businesses cannot be read, and when the account has none', async () => {
    mockRead.mockRejectedValue(new Error('offline'));
    await open(brand, mode);
    expect(texts()).toEqual(expect.arrayContaining(["Couldn't load your businesses", 'Check your connection and try again.']));
    expect(icon('alert-circle-outline').props.color).toBe(t.status.negative.text);
    expect(pressable('Try again')).toBeDefined();
    act(() => tree!.unmount());

    mockRead.mockReset().mockResolvedValue([]);
    await open(brand, mode);
    expect(texts()).toEqual(expect.arrayContaining(['No business linked', 'No business is linked to your account. Ask your facility to link one.']));
    expect(icon('account-off-outline').props.color).toBe(t.icon.secondary);
    expect(pressable('Try again')).toBeUndefined();
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
    expect(flat(scroll().props.style)).toMatchObject({ maxHeight: shortLimit });
    expect(flat(scroll().props.style).flex).toBeUndefined();
  });

  it('is tall with a scrolling list for six businesses', async () => {
    mockRead.mockResolvedValue(Array.from({ length: 6 }, (_, index) => business(index + 1)));
    await open();
    expect(rows()).toHaveLength(6);
    expect(flat(sheet().props.style).height).toBe('88%');
    expect(flat(scroll().props.style)).toMatchObject({ flex: 1 });
    expect(flat(scroll().props.style).maxHeight).toBeUndefined();
  });

  it.each([
    ['waiting', () => mockRead.mockReturnValue(new Promise(() => {}))],
    ['failed', () => mockRead.mockRejectedValue(new Error('offline'))],
    ['none', () => mockRead.mockResolvedValue([])],
  ])('is as high as its content while %s', async (_state, arrange) => {
    arrange();
    await open();
    expect(flat(sheet().props.style).height).toBeUndefined();
    expect(flat(scroll().props.style)).toMatchObject({ maxHeight: shortLimit });
  });
});

describe('choosing and closing', () => {
  it('tags a deactivated business in its row and its spoken label, and still lets it be picked', async () => {
    mockRead.mockResolvedValue([
      { id: 'b1', name: 'Amber Field Traders', city: 'Northgate', active: false },
      { id: 'b2', name: 'Birchwood Produce', city: 'Southmere', active: true },
    ]);
    const { onPick } = await open();
    expect(rows().map(row => row.props.accessibilityLabel)).toEqual(['Amber Field Traders, Northgate, Deactivated', 'Birchwood Produce, Southmere']);
    act(() => rows()[0].props.onPress());
    expect(onPick).toHaveBeenCalledWith({ id: 'b1', name: 'Amber Field Traders', city: 'Northgate' });
  });

  it('hands back the business pressed, and reads its city with its name', async () => {
    mockRead.mockResolvedValue(TWO);
    const { onPick, onClose } = await open();
    expect(rows().map(row => row.props.accessibilityLabel)).toEqual(['Amber Field Traders, Northgate', 'Birchwood Produce, Southmere']);
    expect(rows().every(row => row.props.accessibilityRole === 'button' && row.props.accessibilityHint === 'Opens the order for this business')).toBe(true);
    act(() => rows()[1].props.onPress());
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith({ id: 'b2', name: 'Birchwood Produce', city: 'Southmere' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('gives a business with no city one line, and one with no name the word for it', async () => {
    mockRead.mockResolvedValue([{ id: 'b1', name: 'Amber Field Traders', city: '' }, { id: 'b2', name: '', city: 'Southmere' }]);
    const { onPick } = await open();
    expect(rows().map(row => row.props.accessibilityLabel)).toEqual(['Amber Field Traders', 'Customer, Southmere']);
    expect(rows()[0].findAll(node => (node.type as unknown) === 'Text').map(node => node.props.children)).toEqual(['AF', 'Amber Field Traders']);
    act(() => rows()[1].props.onPress());
    expect(onPick).toHaveBeenCalledWith({ id: 'b2', name: '', city: 'Southmere' });
  });

  it('closes on Cancel without choosing', async () => {
    mockRead.mockResolvedValue(TWO);
    const { onPick, onClose } = await open();
    act(() => pressable('Cancel').props.onPress());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('draws nothing and asks nothing while closed, and asks the facility again each time it opens', async () => {
    mockRead.mockResolvedValue(TWO);
    mockState = { theme: { preference: 'light', brand: 'orange' } };
    await act(async () => {
      tree = create(element(false));
    });
    expect(tree!.toJSON()).toBeNull();
    expect(mockRead).not.toHaveBeenCalled();

    await act(async () => tree!.update(element(true)));
    expect(mockRead).toHaveBeenCalledTimes(1);
    expect(rows()).toHaveLength(2);

    await act(async () => tree!.update(element(false)));
    expect(tree!.toJSON()).toBeNull();
    mockRead.mockResolvedValue([TWO[0], TWO[1], business(3)]);
    await act(async () => tree!.update(element(true)));
    expect(mockRead).toHaveBeenCalledTimes(2);
    expect(rows()).toHaveLength(3);
  });

  it('reads again on Try again and then lists the businesses', async () => {
    mockRead.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(TWO);
    await open();
    expect(rows()).toHaveLength(0);
    await act(async () => pressable('Try again').props.onPress());
    expect(mockRead).toHaveBeenCalledTimes(2);
    expect(rows().map(row => row.props.accessibilityLabel)).toEqual(['Amber Field Traders, Northgate', 'Birchwood Produce, Southmere']);
    expect(texts()).not.toContain("Couldn't load your businesses");
  });
});

it('speaks Gujarati', async () => {
  setLanguage('gu');
  mockRead.mockResolvedValue([]);
  await open();
  expect(texts()).toEqual(expect.arrayContaining(['વેપારી પસંદ કરો', 'કોઈ વેપારી જોડાયેલ નથી', 'તમારા ખાતા સાથે કોઈ વેપારી જોડાયેલ નથી. તમારા કોલ્ડ સ્ટોરેજને વેપારી જોડવા કહો.']));
});

describe('an empty list: revoked or no business linked (migration 80, get_my_access_status)', () => {
  const NO_BUSINESS = ['No business linked', 'No business is linked to your account. Ask your facility to link one.'];

  it("'revoked' says so in the sheet: no sign-out, the sheet stays open", async () => {
    mockRead.mockResolvedValue([]);
    mockStatus.mockResolvedValue('revoked');
    const { onClose } = await open();
    expect(texts()).toContain('Your cold storage has removed your businesses. Ask them to add one.');
    expect(texts()).not.toContain('No business is linked to your account. Ask your facility to link one.');
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
    expect(texts()).toEqual(expect.arrayContaining(NO_BUSINESS));
    expect(texts()).not.toContain('Your cold storage has removed your businesses. Ask them to add one.');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not ask when there are businesses', async () => {
    mockRead.mockResolvedValue(TWO);
    mockStatus.mockResolvedValue('revoked');
    await open();
    expect(mockStatus).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(2);
  });
});
