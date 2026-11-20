import React from 'react';
import { Alert } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
import { BRANDS, getTokens, type Mode } from '@/theme/tokens';
import { DispatchFormHeader } from '../DispatchFormHeader';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const MODES: Mode[] = ['light', 'dark'];

describe('DispatchFormHeader', () => {
  afterEach(() => jest.restoreAllMocks());

  describe.each(BRANDS.flatMap(brand => MODES.map(mode => [brand, mode] as const)))('%s %s', (brand, mode) => {
    it('renders on surface.header with a header title and labelled cancel button', async () => {
      const user = userEvent.setup({ delay: 0 });
      mockState = { theme: { preference: mode, brand } };
      const t = getTokens(brand, mode);
      const onCancel = jest.fn();
      await render(
        <DispatchFormHeader
          title="Create dispatch"
          onCancel={onCancel}
          confirmCancel={false}
          rightAction={{ icon: 'check', label: 'Save', onPress: jest.fn() }}
        />
      );

      expect(screen.root).toHaveStyle({ backgroundColor: t.surface.header });
      expect(screen.getByRole('header', { name: 'Create dispatch' })).toBeOnTheScreen();

      await user.press(screen.getByRole('button', { name: 'Cancel dispatch' }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  it('asks before discarding when confirmCancel is on', async () => {
    const user = userEvent.setup({ delay: 0 });
    mockState = { theme: { preference: 'light', brand: 'orange' } };
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<DispatchFormHeader title="Create dispatch" onCancel={jest.fn()} />);
    await user.press(screen.getByRole('button', { name: 'Cancel dispatch' }));
    expect(alertSpy).toHaveBeenCalledWith(
      'Discard this dispatch?',
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ text: 'Discard dispatch' })]),
      expect.anything()
    );
  });
});
