/**
 * While a screen reader is on the lines are cards: TalkBack's explore-by-touch does not reach a table
 * cell (the wrapper around its input ignores touches), and a card's input is reached. Font scale 1.0
 * and 411 dp draw a table otherwise.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { makeInvoiceStore, fillNewInvoice, groupLines, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';
import { ConnectedEditor, openAllGroups } from '@/tests/helpers/invoiceItemsHarness';
import { resetScreenReaderKnown } from '@/hooks/useScreenReader';

let mockStore: InvoiceStore;
jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFixtures').storeHooks(() => mockStore));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('react-native-keyboard-aware-scroll-view', () => ({ listenToKeyboardEvents: () => (component: unknown) => component }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 411, height: 800, scale: 3, fontScale: 1 }),
}));

let changed: ((on: boolean) => void) | undefined;
const remove = jest.fn();
afterEach(() => {
  resetScreenReaderKnown();
  jest.restoreAllMocks();
  changed = undefined;
  remove.mockClear();
});

async function mount(initiallyOn: boolean) {
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(initiallyOn);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((name: string, handler: (on: boolean) => void) => {
    if (name === 'screenReaderChanged') changed = handler;
    return { remove };
  }) as never);
  mockStore = makeInvoiceStore();
  fillNewInvoice(mockStore, groupLines(2));
  await render(<ConnectedEditor />);
  await openAllGroups();
}
const isTable = () => screen.queryAllByTestId(/^line-/).length > 0;

describe('the lines with a screen reader', () => {
  it('are a table with none on, at font scale 1.0 and 411 dp', async () => {
    await mount(false);
    expect(isTable()).toBe(true);
  });

  it('are cards when it is on from the start', async () => {
    await mount(true);
    expect(isTable()).toBe(false);
  });

  it('turn into cards when it is switched on while the step is open, and back into a table when it is switched off', async () => {
    await mount(false);
    expect(isTable()).toBe(true);
    await act(async () => { changed!(true); });
    expect(isTable()).toBe(false);
    await act(async () => { changed!(false); });
    expect(isTable()).toBe(true);
  });

  it('stop listening when the step closes', async () => {
    await mount(false);
    await screen.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
