import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import StyleGuideScreen from '../../../app/style-guide';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('@/hooks/useHaptics', () => ({ triggerLightTap: jest.fn(), triggerSelection: jest.fn(), triggerMediumTap: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: { back: jest.fn() } }));

const MODES: Mode[] = ['light', 'dark'];

describe('style guide gallery', () => {
  describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('%s %s', (brand, mode) => {
    it('renders every section with the theme background and no failing contrast rows', async () => {
      mockState = { theme: { preference: mode, brand } };
      await render(<StyleGuideScreen />);
      for (const section of ['Theme', 'Brand', 'Surfaces and text', 'Status', 'Typography', 'Spacing',
        'Shape and elevation', 'Buttons', 'Fields and selection', 'Selection', 'Tags, avatars and indicators',
        'Steps', 'Reports', 'Dialogs and alerts', 'States', 'Formats', 'Content']) {
        // A section heading is drawn in capitals; match the whole text without regard to case.
        const heading = new RegExp(`^${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        expect(screen.getAllByText(heading)[0]).toBeOnTheScreen();
      }
      expect(screen.queryByText('Fails')).not.toBeOnTheScreen();

      expect(screen.root).toHaveStyle({ backgroundColor: getTokens(brand, mode).background.base });
    });
  });
});
