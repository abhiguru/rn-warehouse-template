/**
 * WH-303: the strip on a GRN that says a change replaced someone's newer entry (Design offline-capture.md 6.2, DQ12 c).
 * Real: the strip, InlineValidation, Button, the sentence helper and the translations. Nothing is faked.
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { ReplacedStrip } from '../ReplacedStrip';
import { setLanguage } from '@/i18n';
import type { RpcGrnReplacement } from '@/types/rpc-canonical.types';

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
// Only the theme is read from the store: the app's own selector over a fixed theme.
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (sel: (s: unknown) => unknown) => sel({ theme: { preference: 'light', brand: 'orange' } }),
}));

const entry = (n: number, over: Partial<RpcGrnReplacement> = {}): RpcGrnReplacement => ({
  id: `r${n}`,
  kind: 'field',
  field: 'rack',
  newer_value: `D-${n}`,
  newer_by_name: 'Meena Fictional',
  newer_at: '2026-11-27T16:15:00+05:30',
  sent_value: `C-${n}`,
  sent_by_name: 'Ravi Fictional',
  sent_at: '2026-11-27T16:20:00+05:30',
  recorded_at: null,
  ...over,
});

const entries = (count: number): RpcGrnReplacement[] => Array.from({ length: count }, (_, index) => entry(index + 1));

const props = { canMarkChecked: true, needsConnection: false, onMarkChecked: jest.fn() };

// The fixture's entries are of 27 Nov 2026: today is fixed to that day (only the clock is faked), so a time reads without its
// date, as the app says it for today.
beforeEach(() => {
  jest.useFakeTimers({
    now: new Date('2026-11-27T12:00:00+05:30'),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'performance', 'hrtime'],
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  setLanguage('en');
});

describe('ReplacedStrip', () => {
  it('shows nothing when there are no entries', async () => {
    await render(<ReplacedStrip {...props} entries={[]} />);
    expect(screen.queryByTestId('grn-details-replaced-strip')).not.toBeOnTheScreen();
  });

  it('shows the title and one sentence per entry when there are three or fewer, with no Show all', async () => {
    await render(<ReplacedStrip {...props} entries={entries(3)} />);
    expect(screen.getByText("A change here replaced someone's newer entry. Check it is right.")).toBeOnTheScreen();
    expect(screen.getAllByTestId(/^grn-details-replaced-line-/)).toHaveLength(3);
    expect(screen.getByTestId('grn-details-replaced-line-r1')).toHaveTextContent(/Rack: D-1 \(Meena Fictional, 4:15 pm\) was replaced by C-1 \(Ravi Fictional, 4:20 pm\)\./);
    expect(screen.queryByTestId('grn-details-replaced-show-all')).not.toBeOnTheScreen();
  });

  it('shows the first three of five, then Show all 5 reveals every entry and goes away', async () => {
    await render(<ReplacedStrip {...props} entries={entries(5)} />);
    expect(screen.getAllByTestId(/^grn-details-replaced-line-/)).toHaveLength(3);
    expect(screen.queryByTestId('grn-details-replaced-line-r4')).not.toBeOnTheScreen();

    await userEvent.press(screen.getByRole('button', { name: 'Show all 5' }));

    expect(screen.getAllByTestId(/^grn-details-replaced-line-/)).toHaveLength(5);
    expect(screen.getByTestId('grn-details-replaced-line-r5')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Show all 5' })).not.toBeOnTheScreen();
  });

  it('Mark as checked hands over the id of every entry, including the ones Show all had not opened', async () => {
    await render(<ReplacedStrip {...props} entries={entries(5)} />);
    await userEvent.press(screen.getByRole('button', { name: 'Mark as checked' }));
    expect(props.onMarkChecked).toHaveBeenCalledTimes(1);
    expect(props.onMarkChecked).toHaveBeenCalledWith(['r1', 'r2', 'r3', 'r4', 'r5']);
  });

  it('has no Mark as checked for a person who is not an administrator', async () => {
    await render(<ReplacedStrip {...props} canMarkChecked={false} entries={entries(2)} />);
    expect(screen.getByTestId('grn-details-replaced-strip')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Mark as checked/ })).not.toBeOnTheScreen();
  });

  it('with no connection, Mark as checked is disabled, says it needs a connection and sends nothing', async () => {
    await render(<ReplacedStrip {...props} needsConnection entries={entries(2)} />);
    const button = screen.getByTestId('grn-details-replaced-mark-checked');
    expect(button).toBeDisabled();
    expect(screen.getByRole('button', { name: /Mark as checked, needs a connection/i })).toBeOnTheScreen();
    expect(screen.getByTestId('grn-details-replaced-mark-checked-needs-connection')).toBeOnTheScreen();
    await userEvent.press(button);
    expect(props.onMarkChecked).not.toHaveBeenCalled();
  });

  it('while the mark is being sent, Mark as checked is disabled', async () => {
    await render(<ReplacedStrip {...props} busy entries={entries(2)} />);
    expect(screen.getByTestId('grn-details-replaced-mark-checked')).toBeDisabled();
  });

  it('names the lot by its item, with the mark when two lots are of one item (DQ11)', async () => {
    const lot = (n: number, mark: string) => entry(n, { lot_id: `l${n}`, lot_item_name: 'Potato', lot_package_mark: mark, lot_rack: `A-${n}` });
    await render(<ReplacedStrip {...props} entries={[lot(1, 'M1'), lot(2, 'M2')]} repeatedItemNames={new Set(['Potato'])} />);
    expect(screen.getByTestId('grn-details-replaced-line-r1')).toHaveTextContent(/^Potato \(M1\), Rack: D-1/);
    expect(screen.getByTestId('grn-details-replaced-line-r2')).toHaveTextContent(/^Potato \(M2\), Rack: D-2/);
  });
});
