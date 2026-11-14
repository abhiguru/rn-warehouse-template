/**
 * WH-199: the customer form's State picker (about 37 choices) could not be scrolled, so Gujarat could not be chosen.
 * PreferenceSheet now puts its choices in a ScrollView: more than 8 choices make the sheet tall and scrollable, a short list
 * keeps a maximum height, and the selected row is scrolled into view when the sheet opens (measured, not computed).
 * (WH-211: the customer State picker moved to the searchable sheet; see CustomerStateSheet.test.tsx.)
 */
import React from 'react';
import { Dimensions, ScrollView, Text } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
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

let tree: ReactTestRenderer | undefined;

afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  jest.restoreAllMocks();
});

async function render(element: React.ReactElement) {
  await act(async () => {
    tree = create(element);
  });
}
const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
/** Pressable draws a composite over a host View, both carrying the props: keep the outermost of each pair. */
const outermost = (nodes: ReactTestInstance[]) => nodes.filter(n => !nodes.includes(n.parent as ReactTestInstance));
const pressables = (root: ReactTestInstance, role: string) =>
  outermost(root.findAll(n => n.props.accessibilityRole === role && typeof n.props.onPress === 'function'));
const rows = () => pressables(tree!.root, 'radio');
const textOf = (node: ReactTestInstance) => node.findAllByType(Text).map(x => [x.props.children].flat().join('')).join('|');
const rowByLabel = (label: string) => rows().find(n => textOf(n).split('|').includes(label));
const buttonByLabel = (label: string) => pressables(tree!.root, 'button').filter(n => n.props.accessibilityLabel === label);
const sheetStyle = () => {
  // SheetFrame's sheet View is the one with accessibilityViewIsModal.
  const view = tree!.root.findAll(n => n.props.accessibilityViewIsModal === true)[0];
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
    const scroll = tree!.root.findByType(ScrollView);
    expect(scroll.props.testID).toBe('s-scroll');
    expect(flat(scroll.props.style)).toEqual({ flex: 1 });
    expect(sheetStyle().height).toBe('88%');
    const inScroll = pressables(scroll, 'radio');
    expect(inScroll).toHaveLength(states.length);
    expect(states.length).toBeGreaterThan(30);
  });

  it('has Gujarat and the last state present, and pressing each calls onSelect with its value', async () => {
    const onSelect = jest.fn();
    await render(<PreferenceSheet visible title="State" options={states} selected="" onSelect={onSelect} onClose={jest.fn()} testID="s" />);
    const last = states[states.length - 1];
    for (const option of [states.find(o => o.value === 'Gujarat')!, last]) {
      const row = rowByLabel(option.label);
      expect(row).toBeDefined();
      await act(async () => row!.props.onPress());
      expect(onSelect).toHaveBeenLastCalledWith(option.value);
    }
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('every state is selectable', async () => {
    const onSelect = jest.fn();
    await render(<PreferenceSheet visible title="State" options={states} selected="" onSelect={onSelect} onClose={jest.fn()} />);
    for (const option of states) {
      await act(async () => rowByLabel(option.label)!.props.onPress());
      expect(onSelect).toHaveBeenLastCalledWith(option.value);
    }
    expect(onSelect).toHaveBeenCalledTimes(states.length);
  });

  it('scrolls to the selected row (Gujarat) at its measured y when that row reports its layout', async () => {
    await render(<PreferenceSheet visible title="State" options={states} selected="Gujarat" onSelect={jest.fn()} onClose={jest.fn()} testID="s" />);
    const scrollTo = jest.fn();
    // The ref is the ScrollView instance; stand in for its native method.
    const instance = tree!.root.findByType(ScrollView).instance as { scrollTo?: unknown };
    instance.scrollTo = scrollTo;
    const gujarat = rowByLabel('Gujarat')!;
    expect(typeof gujarat.props.onLayout).toBe('function');
    act(() => gujarat.props.onLayout({ nativeEvent: { layout: { x: 0, y: 1234, width: 300, height: 48 } } }));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ y: 1234, animated: false });
  });

  it('only the selected row measures itself, and nothing else scrolls', async () => {
    await render(<PreferenceSheet visible title="State" options={states} selected="Gujarat" onSelect={jest.fn()} onClose={jest.fn()} />);
    const measuring = rows().filter(n => typeof n.props.onLayout === 'function');
    expect(measuring).toHaveLength(1);
    expect(textOf(measuring[0])).toContain('Gujarat');
  });

  it('exposes the selected state on the selected row only and keeps every row reachable', async () => {
    await render(<PreferenceSheet visible title="State" options={states} selected="Gujarat" onSelect={jest.fn()} onClose={jest.fn()} testID="s" />);
    const selected = rows().filter(n => n.props.accessibilityState?.selected === true);
    expect(selected).toHaveLength(1);
    expect(textOf(selected[0])).toContain('Gujarat');
    expect(selected[0].props.accessibilityState).toMatchObject({ selected: true, checked: true });
    const hidden = tree!.root.findAll(
      n => n.props.accessible === false || n.props.importantForAccessibility === 'no-hide-descendants' || n.props.importantForAccessibility === 'no' || n.props.accessibilityElementsHidden === true,
    );
    expect(hidden).toEqual([]);
    expect(tree!.root.findAll(n => n.props.testID === 's' && n.props.accessibilityRole === 'radiogroup').length).toBeGreaterThan(0);
  });

  it('Done closes the sheet', async () => {
    const onClose = jest.fn();
    await render(<PreferenceSheet visible title="State" options={states} selected="" onSelect={jest.fn()} onClose={onClose} />);
    const done = buttonByLabel(tr('common.done'));
    expect(done.length).toBeGreaterThan(0);
    await act(async () => done[0].props.onPress());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('PreferenceSheet with a short list (language)', () => {
  it('is not tall, limits the choices to 60% of the window, and still selects and closes', async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    await render(<PreferenceSheet visible title="Language" options={short} selected="en" onSelect={onSelect} onClose={onClose} testID="l" />);
    const scroll = tree!.root.findByType(ScrollView);
    expect(scroll.props.testID).toBe('l-scroll');
    const { maxHeight, flex } = flat(scroll.props.style);
    expect(flex).toBeUndefined();
    expect(maxHeight).toBeGreaterThan(0);
    expect(maxHeight).toBeCloseTo(Dimensions.get('window').height * 0.6);
    expect(sheetStyle().height).toBeUndefined();
    expect(rows().filter(n => typeof n.props.onLayout === 'function')).toHaveLength(0);
    await act(async () => rowByLabel('Gujarati')!.props.onPress());
    expect(onSelect).toHaveBeenCalledWith('gu');
    await act(async () => buttonByLabel(tr('common.done'))[0].props.onPress());
    expect(onClose).toHaveBeenCalled();
  });

  it('exactly 8 choices is still short and 9 is tall', async () => {
    const make = (n: number) => Array.from({ length: n }, (_, i) => ({ value: `v${i}`, label: `Option ${i}` }));
    await render(<PreferenceSheet visible title="T" options={make(8)} selected="v0" onSelect={jest.fn()} onClose={jest.fn()} />);
    expect(sheetStyle().height).toBeUndefined();
    await act(async () => tree!.update(<PreferenceSheet visible title="T" options={make(9)} selected="v0" onSelect={jest.fn()} onClose={jest.fn()} />));
    expect(sheetStyle().height).toBe('88%');
  });

  it('renders nothing when not visible', async () => {
    await render(<PreferenceSheet visible={false} title="T" options={short} selected="en" onSelect={jest.fn()} onClose={jest.fn()} />);
    expect(tree!.root.findAllByType(ScrollView)).toHaveLength(0);
  });
});

describe('the item GST treatment sheet (another caller)', () => {
  it('renders as a short sheet inside the scroll view and selecting calls the service', async () => {
    const { setItemGstTreatment } = require('@/services/gstService');
    await render(<ItemGstTreatment itemId="item-1" />);
    await act(async () => tree!.root.findByProps({ testID: 'item-gst-treatment-row' }).props.onPress());
    expect(tree!.root.findByType(ScrollView).props.testID).toBe('item-gst-treatment-sheet-scroll');
    expect(sheetStyle().height).toBeUndefined();
    expect(rows()).toHaveLength(2);
    await act(async () => rowByLabel(tr('gst.item.exemptAgri'))!.props.onPress());
    expect(setItemGstTreatment).toHaveBeenCalledWith('item-1', 'exempt_agri');
  });
});
