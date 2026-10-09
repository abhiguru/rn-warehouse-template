import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import GRNFilterOverlay from '../GRNFilterOverlay';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../DateRangePicker', () => 'DateRangePicker');
jest.mock('../FilterChip', () => 'FilterChip');

const MODES: Mode[] = ['light', 'dark'];

function flatStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatStyle));
  return (style as Record<string, unknown>) || {};
}

describe('GRNFilterOverlay', () => {
  describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('%s %s', (brand, mode) => {
    it('renders on theme tokens with a selected radio and a primary action', () => {
      mockState = { theme: { preference: mode, brand } };
      const t = getTokens(brand, mode);
      let tree!: ReactTestRenderer;
      act(() => {
        tree = create(
          <GRNFilterOverlay
            visible
            onClose={jest.fn()}
            onApply={jest.fn()}
            currentFilters={{ selectedItems: [{ id: '1', label: 'Potato', type: 'item' }], stockStatus: 'in_stock' }}
            activeFilterCount={2}
          />
        );
      });

      const title = tree.root.findAll(n => (n.type as unknown) === 'Text' && n.props.children === 'Filter GRNs')[0];
      expect(flatStyle(title.props.style).color).toBe(t.text.primary);

      const radios = tree.root.findAll(n => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function');
      const selected = radios.filter(r => r.props.accessibilityState?.selected);
      expect(selected).toHaveLength(1);
      expect(selected[0].props.accessibilityLabel).toBe('In stock');

      const apply = tree.root.findAll(n => n.props.accessibilityLabel === 'Show results, 2 filters' && typeof n.props.onPress === 'function')[0];
      expect(flatStyle(apply.props.style({ pressed: false })).backgroundColor).toBe(t.brand.fill);
    });
  });
});
