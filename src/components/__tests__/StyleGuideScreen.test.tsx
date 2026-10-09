import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import StyleGuideScreen from '../../../app/style-guide';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: { back: jest.fn() } }));

const MODES: Mode[] = ['light', 'dark'];

function renderIn(brand: (typeof BRANDS)[number], mode: Mode) {
  mockState = { theme: { preference: mode, brand } };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
<StyleGuideScreen />
    );
  });
  return tree;
}

function allText(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAll(node => (node.type as unknown) === 'Text')
    .map(node => [].concat(node.props.children).join(''));
}

describe('style guide gallery', () => {
  describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('%s %s', (brand, mode) => {
    it('renders every section with the theme background and no failing contrast rows', () => {
      const tree = renderIn(brand, mode);
      const text = allText(tree);
      for (const section of ['Theme', 'Brand', 'Surfaces and text', 'Status', 'Typography', 'Spacing',
        'Shape and elevation', 'Buttons', 'Fields and selection', 'Selection', 'Tags, avatars and indicators',
        'Steps', 'Reports', 'Dialogs and alerts', 'States', 'Formats', 'Content']) {
        expect(text.some(t => t.toUpperCase() === section.toUpperCase())).toBe(true);
      }
      expect(text).not.toContain('Fails');

      const t = getTokens(brand, mode);
      const screen = tree.root.findAll(node => {
        const style = [].concat(node.props.style ?? []).filter(Boolean) as Array<{ backgroundColor?: string }>;
        return style.some(s => s && s.backgroundColor === t.background.base);
      });
      expect(screen.length).toBeGreaterThan(0);
      act(() => tree.unmount());
    });
  });
});
