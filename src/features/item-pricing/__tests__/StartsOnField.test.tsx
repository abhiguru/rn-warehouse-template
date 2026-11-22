/**
 * "Starts on": the chips (Today, the first of next month, the next 1 April, Other date),
 * the Android calendar that opens at once on Other date, and the earliest day it offers. Today is 14/10/26.
 */
import React from 'react';
import { Platform } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { StartsOnField } from '../components/StartsOnField';
import type { StartsOnChoice } from '../editModel';
import { chip, chipState } from '@/tests/helpers/rateEditorFixtures';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: 'DateTimePicker', DateTimePickerAndroid: { open: jest.fn() } }));

const TODAY = '2026-10-14';
const originalOS = Platform.OS;
const onChange = jest.fn();

type Props = Partial<React.ComponentProps<typeof StartsOnField>>;
const mount = async (over: Props = {}, today = TODAY) => {
  const props = { choice: null as StartsOnChoice | null, day: null as string | null, today, canStartInPast: true, onChange, ...over };
  await render(<StartsOnField {...props} />);
};
const lastCalendar = () => {
  const calls = jest.mocked(DateTimePickerAndroid.open).mock.calls;
  return calls[calls.length - 1][0];
};
const ymd = (d: Date | undefined) => (d ? [d.getFullYear(), d.getMonth() + 1, d.getDate()] : undefined);

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
});
afterEach(() => {
  Platform.OS = originalOS;
});

it('offers Today, 01/11/26, 01/04/27 and Other date with none chosen, and asks for a day', async () => {
  await mount();
  expect(chipState()).toEqual(['Today:off', '01/11/26:off', '01/04/27:off', 'Other date:off']);
  expect(screen.getByText('Choose a start date.')).toBeOnTheScreen();
});

it('offers no 01/04/26 chip for a start in 2026 that falls on the first of next month', async () => {
  await mount({}, '2026-03-20');
  expect(chipState()).toEqual(['Today:off', '01/04/26:off', 'Other date:off']);
});

it('a chip reports its choice and day', async () => {
  await mount();
  await userEvent.press(chip('01/04/27'));
  expect(onChange).toHaveBeenLastCalledWith('april', '2027-04-01');
  await userEvent.press(chip('Today'));
  expect(onChange).toHaveBeenLastCalledWith('today', TODAY);
});

it('shows the chosen chip as on', async () => {
  await mount({ choice: 'april', day: '2027-04-01' });
  expect(chipState()[2]).toBe('01/04/27:on');
  expect(screen.queryByText('Choose a start date.')).not.toBeOnTheScreen();
});

describe('Other date', () => {
  it('a manager: the calendar opens at once on 01/11/26, three years back with no floor from the server', async () => {
    await mount();
    await userEvent.press(chip('Other date'));
    const opts = lastCalendar();
    expect(ymd(opts.value)).toEqual([2026, 11, 1]);
    expect(ymd(opts.minimumDate)).toEqual([2023, 10, 15]);
    expect(ymd(opts.maximumDate)).toEqual([2028, 10, 13]);
  });

  it('the calendar starts on the day of the oldest GRN when the server sent it', async () => {
    await mount({ earliest: '2022-01-01' });
    await userEvent.press(chip('Other date'));
    expect(ymd(lastCalendar().minimumDate)).toEqual([2022, 1, 1]);
  });

  it('without the right to start in the past the calendar starts today, so 13/10/26 cannot be chosen', async () => {
    await mount({ canStartInPast: false, earliest: '2022-01-01' });
    await userEvent.press(chip('Other date'));
    expect(ymd(lastCalendar().minimumDate)).toEqual([2026, 10, 14]);
  });

  it('a day picked is reported as Other date', async () => {
    await mount();
    await userEvent.press(chip('Other date'));
    lastCalendar().onChange!({ type: 'set' } as never, new Date(2026, 9, 1));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('other', '2026-10-01');
  });

  it('a calendar closed without a day reports nothing', async () => {
    await mount();
    await userEvent.press(chip('Other date'));
    lastCalendar().onChange!({ type: 'dismissed' } as never, new Date(2026, 9, 1));
    expect(onChange).not.toHaveBeenCalled();
    expect(chipState()).toEqual(['Today:off', '01/11/26:off', '01/04/27:off', 'Other date:off']);
  });

  it('with Other date chosen the calendar reopens on the day chosen', async () => {
    await mount({ choice: 'other', day: '2027-01-05' });
    await userEvent.press(chip('Other date'));
    expect(ymd(lastCalendar().value)).toEqual([2027, 1, 5]);
  });
});

it('a correction shows its own day as text and offers no chip', async () => {
  await mount({ choice: 'fixed', day: '2026-04-01', fixed: true });
  expect(chipState()).toEqual([]);
  expect(screen.getByText('01/04/26 (a correction keeps the start date)')).toBeOnTheScreen();
});

it('shows the error of the field instead of the hint', async () => {
  await mount({ choice: 'other', day: '2021-12-31', error: 'Choose a start date on or after 01/01/22.' });
  expect(screen.getByText('Choose a start date on or after 01/01/22.')).toBeOnTheScreen();
});

it('each date chip is read aloud as a date in words, not as DD/MM/YY', async () => {
  await mount();
  expect(screen.getAllByRole('radio').map(n => n.props.accessibilityLabel as string)).toEqual(['Today', '1 Nov 2026', '1 Apr 2027', 'Other date']);
  expect(screen.getByText('01/11/26')).toBeOnTheScreen();
  expect(screen.getByText('01/04/27')).toBeOnTheScreen();
});
