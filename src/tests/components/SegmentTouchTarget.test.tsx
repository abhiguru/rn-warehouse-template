/**
 * WH-372: every segment of the shared SegmentedControl (Orders | Queue, GRN | Find goods, the language switch) is a
 * touch target at least `touchTarget` (48 dp on Android) tall, while the drawn pill stays the compact 32 dp.
 *
 * Jest has no layout engine, so the height is read from the style the real component gives each segment (the
 * pressable's own minHeight, and the wrapper and backdrop that draw the 32 dp look). Where a press lands on the
 * screen is a device check (Design's, WH-372). What Jest can show: the element with the role and the press handler IS
 * the tall pressable, and the drawn pill inside it has no handler of its own, so a press anywhere in the 48 dp area
 * reaches the one handler.
 */
import React from 'react';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
import { SegmentedControl } from '@/components/ui/RadioButton';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { GrnViewSwitch } from '@/features/find-goods/GrnViewSwitch';
import { setGrnView, useFindGoodsSession } from '@/features/find-goods/findGoodsSession';
import { touchTarget } from '@/theme/tokens';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange', language: 'en' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));

const flat = (style: StyleProp<ViewStyle>) => StyleSheet.flatten(style) ?? {};
function ViewReader() {
  return <Text testID="session-view">{useFindGoodsSession().view}</Text>;
}

/** Both segments of a switch, found by role, with the height their pressable asks for. */
function expectTallSegments(role: 'radio' | 'tab', names: [string, string]) {
  for (const name of names) {
    const segment = screen.getByRole(role, { name });
    const { minHeight, height } = flat(segment.props.style) as { minHeight?: number; height?: number };
    expect(Math.max(minHeight ?? 0, height ?? 0)).toBeGreaterThanOrEqual(touchTarget);
  }
}

/** The visible look: the backdrop is inset from the 48 dp wrapper by the same amount top and bottom. */
function drawnHeight(wrapperOf: ReturnType<typeof screen.getByRole>) {
  const wrapper = wrapperOf.parent!;
  const wrapperHeight = flat(wrapper.props.style).minHeight as number;
  const backdrop = wrapper.children.find(
    c => typeof c !== 'string' && (c as { props: { pointerEvents?: string } }).props.pointerEvents === 'none',
  ) as unknown as { props: { style: StyleProp<ViewStyle> } };
  const { top, bottom } = flat(backdrop.props.style) as { top: number; bottom: number };
  return { wrapperHeight, top, bottom, drawn: wrapperHeight - top - bottom };
}

describe('SegmentedControl: touch area and look', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
  ];

  it('each segment is at least 48 dp tall and the drawn pill stays 32 dp', async () => {
    await render(<SegmentedControl value="a" onValueChange={jest.fn()} options={options} />);
    expectTallSegments('radio', ['Alpha', 'Beta']);
    const { wrapperHeight, top, bottom, drawn } = drawnHeight(screen.getByRole('radio', { name: 'Alpha' }));
    expect(wrapperHeight).toBeGreaterThanOrEqual(touchTarget);
    expect(top).toBe(bottom);
    expect(drawn).toBe(32);
  });

  it('a press on a segment selects it, and the roles and selected state are unchanged', async () => {
    const onValueChange = jest.fn();
    await render(<SegmentedControl value="a" onValueChange={onValueChange} options={options} />);
    expect(screen.getByRole('radio', { name: 'Alpha', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Beta', selected: false })).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('radio', { name: 'Beta' }));
    expect(onValueChange).toHaveBeenCalledWith('b');
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  it('the pill inside a segment takes no press of its own, so the whole tall area is the one target', async () => {
    const onValueChange = jest.fn();
    await render(<SegmentedControl value="a" onValueChange={onValueChange} options={options} />);
    const pill = screen.getByText('Beta').parent!;
    expect(pill.props.onPress).toBeUndefined();
    expect(pill.props.onStartShouldSetResponder).toBeUndefined();
    await userEvent.press(screen.getByText('Beta'));
    expect(onValueChange).toHaveBeenCalledWith('b');
  });

  it('segments of the tab kind keep the tab role', async () => {
    await render(<SegmentedControl segmentRole="tab" value="b" onValueChange={jest.fn()} options={options} />);
    expect(screen.getByRole('tab', { name: 'Beta', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Alpha', selected: false })).toBeOnTheScreen();
  });
});

describe('GRN | Find goods switch', () => {
  beforeEach(() => setGrnView('grn'));

  it('both segments are at least 48 dp tall, drawn 32 dp, and roles and selected state hold', async () => {
    await render(<GrnViewSwitch view="grn" />);
    expectTallSegments('tab', ['GRN', 'Find goods']);
    expect(drawnHeight(screen.getByRole('tab', { name: 'GRN' })).drawn).toBe(32);
    expect(screen.getByRole('tab', { name: 'GRN', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Find goods', selected: false })).toBeOnTheScreen();
  });

  it('a press on Find goods selects it', async () => {
    await render(<><GrnViewSwitch view="grn" /><ViewReader /></>);
    expect(screen.getByTestId('session-view')).toHaveTextContent('grn');
    await userEvent.press(screen.getByRole('tab', { name: 'Find goods' }));
    expect(screen.getByTestId('session-view')).toHaveTextContent('find-goods');
  });
});

describe('LanguageSwitch', () => {
  it('both segments are at least 48 dp tall and drawn 32 dp, with radio roles and the language in effect selected', async () => {
    await render(<LanguageSwitch />);
    const english = screen.getByRole('radio', { name: 'English' });
    const gujarati = screen.getByRole('radio', { name: 'ગુજરાતી' });
    for (const segment of [english, gujarati]) {
      expect(flat(segment.props.style).minHeight).toBeGreaterThanOrEqual(touchTarget);
    }
    expect(drawnHeight(english).drawn).toBe(32);
    expect(screen.getByRole('radio', { name: 'English', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'ગુજરાતી', selected: false })).toBeOnTheScreen();
  });
});
