/**
 * WH-304 A-5 (contract product/tech/app-offline-holding-list.md spec step 27, Product PQ7; Design 4.2, 4.3, 7.9): on "Unsent items",
 * under another person's items, an administrator whose facility has the holding list sees "Move to the holding list". It is
 * disabled with the needs-connection line while offline, and after the confirmation it calls `moveOtherPersonToHolding` with that
 * person's subject. Nobody else sees it. The move's own work is tested in handOver.test.ts (K9).
 *
 * The dialog's button text and the failed-move text are Design's open DQ11, so they are not asserted here: the test presses the
 * dialog's second choice, which is the move.
 *
 * Real: UnsentItemsScreen, usePermissions, i18n. Stood in: the unsent list and the other people's subjects (a phone with other
 * people's rows needs a second signed-in person), `holdingOn`/`moveOtherPersonToHolding` (the move itself is K9's), the alert.
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { UnsentItemsScreen } from '@/features/unsent/UnsentItemsScreen';
import { moveOtherPersonToHolding } from '@/features/holding/handOver';
import { setLanguage } from '@/i18n';

let mockRole = 'admin';
let mockHoldingOn = true;
let mockOffline = false;
const mockAsk = jest.fn();
const mockList = { loaded: true, rows: [], lastSentAt: null, others: [{ name: 'Ravi Fictional', count: 2 }] };

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'p1', role: mockRole, name: 'Neha Fictional' } } }),
}));
jest.mock('@/features/holding/handOver', () => ({
  holdingOn: () => mockHoldingOn,
  moveOtherPersonToHolding: jest.fn(async () => ({ moved: 2, remaining: 0 })),
}));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => mockOffline }));
jest.mock('@/features/unsent/unsentList', () => ({
  ...jest.requireActual('@/features/unsent/unsentList'),
  // One object for every render: a new `others` array each time would restart the screen's effect forever.
  useUnsentList: () => mockList,
}));
jest.mock('@/features/unsent/unsentQueue', () => ({
  deleteItem: jest.fn(),
  otherPeopleBySubject: async () => [{ subject: 'subject-ravi', name: 'Ravi Fictional', count: 2 }],
}));
jest.mock('@/features/unsent/sendEngine', () => ({ sendNow: jest.fn() }));
jest.mock('@/features/unsent/useFormDraft', () => ({ requestContinue: jest.fn() }));
jest.mock('@/features/unsent/formDrafts', () => ({ endFormDraft: jest.fn() }));
jest.mock('@/utils/alert', () => ({ askAlert: (...args: unknown[]) => mockAsk(...args), showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, Stack: { Screen: () => null } }));
jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/components/ui/HeaderBackButton', () => ({ HeaderBackButton: () => null }));

const user = userEvent.setup({ delay: 0 });
const show = async () => {
  await render(<UnsentItemsScreen />);
  await screen.findByTestId('unsent-other-person');
};

beforeEach(() => {
  mockRole = 'admin';
  mockHoldingOn = true;
  mockOffline = false;
  mockAsk.mockReset();
  mockAsk.mockImplementation(async (_title: string, _message: string, choices: { value: unknown }[]) => choices[1].value);
  jest.mocked(moveOtherPersonToHolding).mockClear();
});
afterEach(async () => {
  await setLanguage('en');
});

describe('A-5: Move to the holding list', () => {
  it('an administrator with the holding list on sees it under the other person\'s items', async () => {
    await show();
    expect(screen.getByTestId('unsent-move-to-holding')).toHaveTextContent('Move to the holding list');
    expect(screen.getByTestId('unsent-move-to-holding')).toBeEnabled();
    expect(screen.queryByTestId('unsent-move-needs-connection')).not.toBeOnTheScreen();
  });

  it.each(['supervisor', 'staff', 'customer'])('%s does not see it', async role => {
    mockRole = role;
    await show();
    expect(screen.queryByTestId('unsent-move-to-holding')).not.toBeOnTheScreen();
  });

  it('an administrator whose server has no holding list does not see it', async () => {
    mockHoldingOn = false;
    await show();
    expect(screen.queryByTestId('unsent-move-to-holding')).not.toBeOnTheScreen();
  });

  it('offline: disabled, with the needs-connection line, and a press moves nothing', async () => {
    mockOffline = true;
    await show();
    expect(screen.getByTestId('unsent-move-to-holding')).toBeDisabled();
    expect(screen.getByTestId('unsent-move-needs-connection')).toHaveTextContent('Needs a connection');
    await user.press(screen.getByTestId('unsent-move-to-holding'));
    expect(mockAsk).not.toHaveBeenCalled();
    expect(moveOtherPersonToHolding).not.toHaveBeenCalled();
  });

  it('asks first, naming the person, and moves with that person\'s subject once confirmed', async () => {
    await show();
    await user.press(screen.getByTestId('unsent-move-to-holding'));
    expect(mockAsk.mock.calls[0][0]).toBe("Move Ravi Fictional's items to the holding list?");
    expect(mockAsk.mock.calls[0][1]).toBe('A supervisor or administrator can then accept or reject each one there.');
    expect(moveOtherPersonToHolding).toHaveBeenCalledTimes(1);
    expect(moveOtherPersonToHolding).toHaveBeenCalledWith('subject-ravi');
  });

  it('cancelling the question moves nothing', async () => {
    mockAsk.mockImplementation(async (_title: string, _message: string, choices: { value: unknown }[]) => choices[0].value);
    await show();
    await user.press(screen.getByTestId('unsent-move-to-holding'));
    expect(mockAsk).toHaveBeenCalledTimes(1);
    expect(moveOtherPersonToHolding).not.toHaveBeenCalled();
  });
});
