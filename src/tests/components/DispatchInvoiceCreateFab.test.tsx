/**
 * Create actions on the Dispatches and Invoices list reports (style guide §14.1):
 * a 56 px floating button on brand.fill with shadow[3], shown only to roles
 * that can create.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import DispatchTab from '../../../app/(tabs)/dispatch';
import InvoicesTab from '../../../app/(tabs)/invoices';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
const mockDispatch = jest.fn();
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock('@/components/lists', () => ({ DispatchFlashList: () => null, InvoiceFlashList: () => null }));
jest.mock('@/components/list/ListErrorBoundary', () => ({
  ListErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
let mockCanCreate = true;
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canCreate: mockCanCreate }) }));

const MODES: Mode[] = ['light', 'dark'];

const CASES = [
  { name: 'Dispatches', Screen: DispatchTab, label: 'Create dispatch', route: '/dispatch-form/step1' },
  { name: 'Invoices', Screen: InvoicesTab, label: 'Create invoice', route: '/invoice-form/step1' },
] as const;

function render(Screen: React.ComponentType, brand: string, mode: Mode) {
  mockState = { theme: { preference: mode, brand } };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Screen />);
  });
  return tree;
}

function findFab(tree: ReactTestRenderer, label: string) {
  return tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
}

describe.each(CASES)('$name tab create action', ({ Screen, label, route }) => {
  beforeEach(() => {
    mockCanCreate = true;
    mockPush.mockClear();
  });

  it.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))(
    'is a 56 px brand.fill floating button in %s %s',
    (brand, mode) => {
      const t = getTokens(brand, mode);
      const tree = render(Screen, brand, mode);
      const [fab] = findFab(tree, label);
      expect(fab).toBeDefined();
      const style = StyleSheet.flatten(
        typeof fab.props.style === 'function' ? fab.props.style({ pressed: false }) : fab.props.style
      );
      expect(style).toMatchObject({ position: 'absolute', width: 56, height: 56, backgroundColor: t.brand.fill });
      act(() => fab.props.onPress());
      expect(mockPush).toHaveBeenCalledWith(route);
      act(() => tree.unmount());
    }
  );

  it('is hidden for roles that cannot create', () => {
    mockCanCreate = false;
    const tree = render(Screen, 'orange', 'light');
    expect(findFab(tree, label)).toHaveLength(0);
    act(() => tree.unmount());
  });
});
