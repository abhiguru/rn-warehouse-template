/**
 * "Starts on": the chips (Today, the first of next month, the next 1 April, Other date),
 * the Android calendar that opens at once on Other date, and the earliest day it offers. Today is 14 Oct 2026.
 */
import React from 'react';
import { Platform, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { StartsOnField } from '../components/StartsOnField';
import type { StartsOnChoice } from '../editModel';
import { chip, chipState, textsOf } from '@/tests/helpers/rateEditorFixtures';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: 'DateTimePicker', DateTimePickerAndroid: { open: jest.fn() } }));

const TODAY = '2026-10-14';
const originalOS = Platform.OS;
const onChange = jest.fn();
let tree: ReactTestRenderer | undefined;

type Props = Partial<React.ComponentProps<typeof StartsOnField>>;
const mount = (over: Props = {}, today = TODAY) => {
  const props = { choice: null as StartsOnChoice | null, day: null as string | null, today, canStartInPast: true, onChange, ...over };
  act(() => { tree = create(<StartsOnField {...props} />); });
  return tree!;
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
  act(() => tree?.unmount());
  tree = undefined;
  Platform.OS = originalOS;
});

it('offers Today, 1 Nov 2026, 1 Apr 2027 and Other date with none chosen, and asks for a day', () => {
  const t = mount();
  expect(chipState(t)).toEqual(['Today:off', '1 Nov 2026:off', '1 Apr 2027:off', 'Other date:off']);
  expect(textsOf(t)).toContain('Choose a start date.');
});

it('offers no 1 Apr chip for a start in 2026 that falls on the first of next month', () => {
  const t = mount({}, '2026-03-20');
  expect(chipState(t)).toEqual(['Today:off', '1 Apr 2026:off', 'Other date:off']);
});

it('a chip reports its choice and day', () => {
  const t = mount();
  act(() => { chip(t, '1 Apr 2027').props.onPress(); });
  expect(onChange).toHaveBeenLastCalledWith('april', '2027-04-01');
  act(() => { chip(t, 'Today').props.onPress(); });
  expect(onChange).toHaveBeenLastCalledWith('today', TODAY);
});

it('shows the chosen chip as on', () => {
  const t = mount({ choice: 'april', day: '2027-04-01' });
  expect(chipState(t)[2]).toBe('1 Apr 2027:on');
  expect(textsOf(t)).not.toContain('Choose a start date.');
});

describe('Other date', () => {
  it('a manager: the calendar opens at once on 1 Nov 2026, three years back with no floor from the server', () => {
    const t = mount();
    act(() => { chip(t, 'Other date').props.onPress(); });
    const opts = lastCalendar();
    expect(ymd(opts.value)).toEqual([2026, 11, 1]);
    expect(ymd(opts.minimumDate)).toEqual([2023, 10, 15]);
    expect(ymd(opts.maximumDate)).toEqual([2028, 10, 13]);
  });

  it('the calendar starts on the day of the oldest GRN when the server sent it', () => {
    const t = mount({ earliest: '2022-01-01' });
    act(() => { chip(t, 'Other date').props.onPress(); });
    expect(ymd(lastCalendar().minimumDate)).toEqual([2022, 1, 1]);
  });

  it('without the right to start in the past the calendar starts today, so 13 Oct cannot be chosen', () => {
    const t = mount({ canStartInPast: false, earliest: '2022-01-01' });
    act(() => { chip(t, 'Other date').props.onPress(); });
    expect(ymd(lastCalendar().minimumDate)).toEqual([2026, 10, 14]);
  });

  it('a day picked is reported as Other date', () => {
    const t = mount();
    act(() => { chip(t, 'Other date').props.onPress(); });
    act(() => { lastCalendar().onChange!({ type: 'set' } as never, new Date(2026, 9, 1)); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('other', '2026-10-01');
  });

  it('a calendar closed without a day reports nothing', () => {
    const t = mount();
    act(() => { chip(t, 'Other date').props.onPress(); });
    act(() => { lastCalendar().onChange!({ type: 'dismissed' } as never, undefined); });
    expect(onChange).not.toHaveBeenCalled();
    expect(chipState(t)).toEqual(['Today:off', '1 Nov 2026:off', '1 Apr 2027:off', 'Other date:off']);
  });

  it('with Other date chosen the calendar reopens on the day chosen', () => {
    const t = mount({ choice: 'other', day: '2027-01-05' });
    act(() => { chip(t, 'Other date').props.onPress(); });
    expect(ymd(lastCalendar().value)).toEqual([2027, 1, 5]);
  });
});

it('a correction shows its own day as text and offers no chip', () => {
  const t = mount({ choice: 'fixed', day: '2026-04-01', fixed: true });
  expect(chipState(t)).toEqual([]);
  expect(t.root.findAllByType(Text).map(n => [n.props.children].flat(Infinity).join(''))).toContain('1 Apr 2026 (a correction keeps the start date)');
});

it('shows the error of the field instead of the hint', () => {
  const t = mount({ choice: 'other', day: '2021-12-31', error: 'Choose a start date on or after 1 Jan 2022.' });
  expect(textsOf(t)).toContain('Choose a start date on or after 1 Jan 2022.');
});
