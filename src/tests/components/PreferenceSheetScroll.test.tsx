/**
 * WH-199: the customer form's State picker (about 37 choices) could not be scrolled, so Gujarat could not be chosen.
 * PreferenceSheet now puts its choices in a ScrollView: more than 8 choices make the sheet tall and scrollable, a short list
 * keeps a maximum height, and the selected row is scrolled into view when the sheet opens (measured, not computed).
 * (WH-211: the customer State picker moved to the searchable sheet; see CustomerStateSheet.test.tsx.)
 */
import React from 'react';
import { Dimensions, ScrollView } from 'react-native';
import { fireEvent, render, screen, userEvent, within } from '@testing-library/react-native';
import { PreferenceSheet, type PreferenceOption } from '@/features/settings/components/PreferenceSheet';
import { ItemGstTreatment } from '@/features/gst/ItemGstTreatment';
import { INDIAN_STATES } from '@/features/gst/indianStates';
import { t as tr } from '@/i18n';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { role: 'admin' } } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-reanimated', () => ({ ...jest.requireActual('react-native-reanimated'), useReducedMotion: () => true }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@/config/backendFeatures', () => ({ backendHasFeature: () => true }));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
jest.mock('@/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/services/gstService', () => ({
  GstTreatmentUnconfirmedError: class extends Error {},
  getItemGstTreatment: jest.fn(async () => 'taxable'),
  setItemGstTreatment: jest.fn(async (_id: string, value: string) => value),
}));

const user = userEvent.setup({ delay: 0 });
// A negative check also sees hidden-but-mounted nodes.
const hidden = { includeHiddenElements: true } as const;
afterEach(() => {
  jest.restoreAllMocks();
});

const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
type Host = ReturnType<typeof screen.getByTestId>;
/** Every host element of the screen (the root included): for what has no role or text a query can reach. */
const everyHost = (): Host[] => screen.container.queryAll(() => true);
const rows = () => screen.queryAllByRole('radio');
const rowByLabel = (label: string) => screen.getByRole('radio', { name: label });
const closeButtons = () => screen.queryAllByRole('button', { name: tr('common.close') });
const sheetStyle = () => {
  // SheetFrame's sheet View is the one with accessibilityViewIsModal.
  const view = everyHost().filter(n => n.props.accessibilityViewIsModal === true)[0];
  return flat(view.props.style);
};
const states: PreferenceOption<string>[] = [
  { value: '', label: 'No state' },
  ...INDIAN_STATES.map(s => ({ value: s.name, label: s.name })),
];
const short: PreferenceOption<string>[] = [
  { value: 'system', label: 'System' },
  { value: 'en', label: 'English' },
  { value: 'gu', label: 'Gujarati' },
];

describe('PreferenceSheet with a long list (the states)', () => {
  it('puts every choice inside the ScrollView with the -scroll testID and makes the sheet tall', async () => {
    await render(<PreferenceSheet visible title="State" options={states} selected="" onSelect={jest.fn()} onClose={jest.fn()} testID="s" />);
    const scroll = screen.getByTestId('s-scroll');
    expect(scroll.type).toBe('RCTScrollView');
    expect(everyHost().filter(n => (n.type as unknown) === 'RCTScrollView')).toHaveLength(1);
    expect(flat(scroll.props.style)).toEqual({ flex: 1 });
    expect(sheetStyle().height).toBe('88%');
    const inScroll = within(scroll).getAllByRole('radio');
    expect(inScroll).toHaveLength(states.length);
    expect(states.length).toBeGreaterThan(30);
  });

  it('has Gujarat and the last state present, and pressing each calls onSelect with its value', async () => {
    const onSelect = jest.fn();
    await render(<PreferenceSheet visible title="State" options={states} selected="" onSelect={onSelect} onClose={jest.fn()} testID="s" />);
    const last = states[states.length - 1];
    for (const option of [states.find(o => o.value === 'Gujarat')!, last]) {
      await user.press(rowByLabel(option.label));
      expect(onSelect).toHaveBeenLastCalledWith(option.value);
    }
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('every state is selectable', async () => {
    const onSelect = jest.fn();
    await render(<PreferenceSheet visible title="State" options={states} selected="" onSelect={onSelect} onClose={jest.fn()} />);
    // The rows are found once, by role, and pressed with fireEvent: a role query and a full press for each of the 37
    // states take longer than the test may.
    const byLabel = new Map(rows().map(row => [row.props.accessibilityLabel ?? within(row).getByText(/./).props.children, row]));
    for (const option of states) {
      await fireEvent.press(byLabel.get(option.label)!);
      expect(onSelect).toHaveBeenLastCalledWith(option.value);
    }
    expect(onSelect).toHaveBeenCalledTimes(states.length);
  });

  it('scrolls to the selected row (Gujarat) at its measured y when that row reports its layout', async () => {
    // The jest ScrollView keeps scrollTo on its prototype and there is no native view: it is recorded there
    // (the spy is undone by restoreAllMocks).
    const scrollTo = jest.spyOn(ScrollView.prototype as unknown as { scrollTo: (options: unknown) => void }, 'scrollTo').mockImplementation(() => undefined);
    await render(<PreferenceSheet visible title="State" options={states} selected="Gujarat" onSelect={jest.fn()} onClose={jest.fn()} testID="s" />);
    const gujarat = rowByLabel('Gujarat');
    expect(typeof gujarat.props.onLayout).toBe('function');
    await fireEvent(gujarat, 'layout', { nativeEvent: { layout: { x: 0, y: 1234, width: 300, height: 48 } } });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ y: 1234, animated: false });
  });

  it('only the selected row measures itself, and nothing else scrolls', async () => {
    await render(<PreferenceSheet visible title="State" options={states} selected="Gujarat" onSelect={jest.fn()} onClose={jest.fn()} />);
    const measuring = rows().filter(n => typeof n.props.onLayout === 'function');
    expect(measuring).toHaveLength(1);
    expect(within(measuring[0]).getByText(/Gujarat/)).toBeOnTheScreen();
  });

  it('exposes the selected state on the selected row only and keeps every row reachable', async () => {
    await render(<PreferenceSheet visible title="State" options={states} selected="Gujarat" onSelect={jest.fn()} onClose={jest.fn()} testID="s" />);
    const selected = rows().filter(n => n.props.accessibilityState?.selected === true);
    expect(selected).toHaveLength(1);
    expect(selected).toEqual(screen.getAllByRole('radio', { selected: true }));
    expect(within(selected[0]).getByText(/Gujarat/)).toBeOnTheScreen();
    expect(selected[0]).toBeSelected();
    expect(selected[0].props.accessibilityState).toMatchObject({ selected: true, checked: true });
    // The backdrop (the full-screen scrim, WH-267) is hidden from the screen reader on purpose; it is looked at below.
    const isScrim = (n: Host) => { const s = flat(n.props.style); return s.position === 'absolute' && s.top === 0 && s.right === 0 && s.bottom === 0 && s.left === 0; };
    const isHidden = (n: Host) =>
      n.props.accessible === false || n.props.importantForAccessibility === 'no-hide-descendants' || n.props.importantForAccessibility === 'no' || n.props.accessibilityElementsHidden === true;
    const notReachable = everyHost().filter(n => isHidden(n) && !isScrim(n));
    // Names only, so a failure prints a short list and not the tree.
    expect(notReachable.map(n => String(n.type))).toEqual([]);
    expect(screen.queryAllByTestId('s').filter(n => n.props.accessibilityRole === 'radiogroup').length).toBeGreaterThan(0);
  });

  it('the backdrop is no screen-reader stop (WH-267), and tapping it still closes the sheet', async () => {
    const onClose = jest.fn();
    await render(<PreferenceSheet visible title="State" options={states} selected="" onSelect={jest.fn()} onClose={onClose} />);
    // The backdrop is hidden from the screen reader, so no query reaches it: it is the full-screen pressable host.
    const backdrops = everyHost().filter(n => {
      const s = flat(n.props.style);
      return n.props.importantForAccessibility === 'no' && s.position === 'absolute' && s.top === 0 && s.right === 0 && s.bottom === 0 && s.left === 0;
    });
    expect(backdrops).toHaveLength(1);
    expect(backdrops[0].props.accessible).toBe(false);
    expect(backdrops[0].props.importantForAccessibility).toBe('no');
    expect(backdrops[0].props.accessibilityLabel).toBeUndefined();
    await fireEvent.press(backdrops[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the Close X closes the sheet (WH-219: it replaces Done)', async () => {
    const onClose = jest.fn();
    await render(<PreferenceSheet visible title="State" options={states} selected="" onSelect={jest.fn()} onClose={onClose} />);
    const done = closeButtons();
    expect(done.length).toBeGreaterThan(0);
    await user.press(done[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('PreferenceSheet with a short list (language)', () => {
  it('is not tall, limits the choices to 60% of the window, and still selects and closes', async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    await render(<PreferenceSheet visible title="Language" options={short} selected="en" onSelect={onSelect} onClose={onClose} testID="l" />);
    const scroll = screen.getByTestId('l-scroll');
    const { maxHeight, flex } = flat(scroll.props.style);
    expect(flex).toBeUndefined();
    expect(maxHeight).toBeGreaterThan(0);
    expect(maxHeight).toBeCloseTo(Dimensions.get('window').height * 0.6);
    expect(sheetStyle().height).toBeUndefined();
    expect(rows().filter(n => typeof n.props.onLayout === 'function')).toHaveLength(0);
    await user.press(rowByLabel('Gujarati'));
    expect(onSelect).toHaveBeenCalledWith('gu');
    await user.press(closeButtons()[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('exactly 8 choices is still short and 9 is tall', async () => {
    const make = (n: number) => Array.from({ length: n }, (_, i) => ({ value: `v${i}`, label: `Option ${i}` }));
    await render(<PreferenceSheet visible title="T" options={make(8)} selected="v0" onSelect={jest.fn()} onClose={jest.fn()} />);
    expect(sheetStyle().height).toBeUndefined();
    await screen.rerender(<PreferenceSheet visible title="T" options={make(9)} selected="v0" onSelect={jest.fn()} onClose={jest.fn()} />);
    expect(sheetStyle().height).toBe('88%');
  });

  it('renders nothing when not visible', async () => {
    await render(<PreferenceSheet visible={false} title="T" options={short} selected="en" onSelect={jest.fn()} onClose={jest.fn()} />);
    expect(everyHost().filter(n => (n.type as unknown) === 'RCTScrollView')).toHaveLength(0);
    expect(screen.queryAllByRole('radio', hidden)).toHaveLength(0);
  });
});

describe('the item GST treatment sheet (another caller)', () => {
  it('renders as a short sheet inside the scroll view and selecting calls the service', async () => {
    const { setItemGstTreatment } = require('@/services/gstService');
    await render(<ItemGstTreatment itemId="item-1" />);
    await user.press(await screen.findByTestId('item-gst-treatment-row'));
    expect(screen.getByTestId('item-gst-treatment-sheet-scroll')).toBeOnTheScreen();
    expect(sheetStyle().height).toBeUndefined();
    expect(rows()).toHaveLength(2);
    await user.press(rowByLabel(tr('gst.item.exemptAgri')));
    expect(setItemGstTreatment).toHaveBeenCalledWith('item-1', 'exempt_agri');
  });
});
