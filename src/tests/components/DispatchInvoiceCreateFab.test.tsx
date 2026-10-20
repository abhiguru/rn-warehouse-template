/**
 * Create actions on the Dispatches and Invoices list reports (style guide §14.1):
 * a 56 px floating button on brand.fill with shadow[3], shown only to roles
 * that can create.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { registerDispatchForm } from '@/features/dispatch/utils/openDispatchForms';
import { showAlert } from '@/utils/alert';
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
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  // The Invoices tab takes "Create invoice" again once it is back in front.
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('@/utils/alert', () => ({ showAlert: jest.fn() }));
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

describe('Dispatches tab: Create dispatch', () => {
  beforeEach(() => {
    mockCanCreate = true;
    mockPush.mockClear();
    mockDispatch.mockClear();
    jest.mocked(showAlert).mockClear();
  });

  it('empties the form before step 1 opens, so a new dispatch carries nothing an earlier form left', () => {
    const tree = render(DispatchTab, 'orange', 'light');
    const [fab] = findFab(tree, 'Create dispatch');

    act(() => fab.props.onPress());

    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'dispatchForm/resetForm' }));
    expect(mockPush).toHaveBeenCalledWith('/dispatch-form/step1');
    expect(mockDispatch.mock.invocationCallOrder[0]).toBeLessThan(mockPush.mock.invocationCallOrder[0]);
    act(() => tree.unmount());
  });

  it('a second tap before the tab is back in front opens nothing more', () => {
    const tree = render(DispatchTab, 'orange', 'light');
    const [fab] = findFab(tree, 'Create dispatch');

    act(() => { fab.props.onPress(); fab.props.onPress(); });

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  // Review 2026-10-20, finding 3: the form that is open (maybe hidden under other screens) is asked about BEFORE the
  // store is emptied; emptying it first would leave the open form without its data.
  it('while another dispatch form is open: says which, and resets and opens nothing', () => {
    const release = registerDispatchForm({ kind: 'edit', id: 'd-7', number: 'DD0007' });
    try {
      const tree = render(DispatchTab, 'orange', 'light');
      const [fab] = findFab(tree, 'Create dispatch');

      act(() => fab.props.onPress());

      expect(showAlert).toHaveBeenCalledWith('Another dispatch is open', 'Finish or cancel the edit of dispatch DD0007 first.', expect.any(Array));
      expect(mockDispatch).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();

      // A later tap, once that form is closed, opens as usual.
      release();
      act(() => fab.props.onPress());
      expect(mockPush).toHaveBeenCalledWith('/dispatch-form/step1');
      act(() => tree.unmount());
    } finally {
      release();
    }
  });
});
