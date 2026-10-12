/**
 * The stock trend card opens its chart full screen: sliding in normally, and
 * fading in when the phone asks for reduced motion (docs/STYLE_GUIDE.md §9).
 */
import React from 'react';
import { Modal } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import type { MonthlyTrendPoint } from '@/types/report.types';
import { StockTrendChart } from '../StockTrendChart';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-gifted-charts', () => ({ LineChart: 'LineChart' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
let mockReduceMotion = false;
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => mockReduceMotion,
}));

const point = (month: string, stock: number): MonthlyTrendPoint => ({
  month,
  grn_count: 0,
  grn_quantity: 0,
  dispatch_count: 0,
  dispatch_quantity: 0,
  invoice_amount: 0,
  stock_level_end: stock,
});
const TRENDS = [point('2026-08', 120), point('2026-09', 180), point('2026-10', 150)];

function openFullScreen() {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<StockTrendChart trends={TRENDS} />);
  });
  const modal = () => tree.root.findByType(Modal);
  expect(modal().props.visible).toBe(false);
  const card = tree.root.find(
    node => typeof node.type !== 'string' && typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Stock level trend. ') && typeof node.props.onPress === 'function'
  );
  act(() => card.props.onPress());
  const opened = modal().props;
  act(() => tree.unmount());
  return opened;
}

afterEach(() => {
  mockReduceMotion = false;
});

describe('stock trend, full screen', () => {
  it('slides in when motion is not reduced', () => {
    mockReduceMotion = false;
    const modal = openFullScreen();
    expect(modal.visible).toBe(true);
    expect(modal.animationType).toBe('slide');
  });

  it('fades in when Reduce Motion is on', () => {
    mockReduceMotion = true;
    const modal = openFullScreen();
    expect(modal.visible).toBe(true);
    expect(modal.animationType).toBe('fade');
  });
});
