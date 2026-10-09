import React from 'react';
import { Alert } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Brand, type Mode } from '@/theme/tokens';
import GRNFormHeader from '../GRNFormHeader';
import GRNFormBottomNav from '../GRNFormBottomNav';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 10, left: 0, right: 0 }),
}));

jest.useFakeTimers();

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    mounted.splice(0).forEach(tree => tree.unmount());
    jest.runOnlyPendingTimers();
  });
});

const THEMES = BRANDS.flatMap(brand => (['light', 'dark'] as Mode[]).map(mode => [brand, mode] as const));

function renderIn(brand: Brand, mode: Mode, element: React.ReactElement) {
  mockState = { theme: { preference: mode, brand } };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  mounted.push(tree);
  return tree;
}

function flatStyle(style: unknown): Record<string, unknown> {
  const list = ([] as unknown[]).concat(style as never).flat(Infinity as 1);
  return Object.assign({}, ...list.filter(Boolean));
}

describe('GRN form chrome', () => {
  describe.each(THEMES)('%s %s', (brand, mode) => {
    const t = getTokens(brand, mode);

    it('renders the header on surface.header with a header-role title', () => {
      const tree = renderIn(brand, mode, <GRNFormHeader title="Create GRN" onCancel={jest.fn()} />);
      const title = tree.root.find(node => node.props.accessibilityRole === 'header' && (node.type as unknown) === 'Text');
      expect(flatStyle(title.props.style).color).toBe(t.text.primary);
      const container = tree.root.findAll(node => (node.type as unknown) === 'View')[0];
      expect(flatStyle(container.props.style).backgroundColor).toBe(t.surface.header);
    });

    it('renders the bottom bar with a brand-filled primary button', () => {
      const tree = renderIn(
        brand,
        mode,
        <GRNFormBottomNav currentStep={2} totalSteps={3} onPrevious={jest.fn()} onNext={jest.fn()} />
      );
      const next = tree.root.find(node => node.props.accessibilityLabel === 'Next: step 3' && typeof node.props.onPress === 'function');
      const style = typeof next.props.style === 'function' ? next.props.style({ pressed: false }) : next.props.style;
      expect(flatStyle(style).backgroundColor).toBe(t.brand.fill);
      expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Back to the previous step').length).toBeGreaterThan(0);
    });
  });

  it('asks before discarding the GRN', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onCancel = jest.fn();
    const tree = renderIn('orange', 'light', <GRNFormHeader title="Create GRN" onCancel={onCancel} />);
    const cancel = tree.root.find(node => node.props.accessibilityLabel === 'Cancel GRN' && typeof node.props.onPress === 'function');
    act(() => cancel.props.onPress());
    expect(alert).toHaveBeenCalledWith('Discard this GRN?', expect.any(String), expect.any(Array), { cancelable: true });
    const buttons = alert.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    expect(buttons.map(b => b.text)).toEqual(['Keep editing', 'Discard GRN']);
    buttons[1].onPress?.();
    expect(onCancel).toHaveBeenCalled();
    alert.mockRestore();
  });
});
