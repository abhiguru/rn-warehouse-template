import React from 'react';
import { Alert } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
import { BRANDS, getTokens, type Brand, type Mode } from '@/theme/tokens';
import GRNFormHeader from '../GRNFormHeader';
import WizardBottomBar from '../WizardBottomBar';

let mockState: { theme: { preference: string; brand: string } } = { theme: { preference: 'light', brand: 'orange' } };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 10, left: 0, right: 0 }),
}));

const THEMES = BRANDS.flatMap(brand => (['light', 'dark'] as Mode[]).map(mode => [brand, mode] as const));

async function renderIn(brand: Brand, mode: Mode, element: React.ReactElement) {
  mockState = { theme: { preference: mode, brand } };
  return render(element);
}

describe('GRN form chrome', () => {
  describe.each(THEMES)('%s %s', (brand, mode) => {
    const t = getTokens(brand, mode);

    it('renders the header on surface.header with a header-role title', async () => {
      await renderIn(brand, mode, <GRNFormHeader title="Create GRN" onCancel={jest.fn()} />);
      expect(screen.getByRole('header', { name: 'Create GRN' })).toHaveStyle({ color: t.text.primary });
      expect(screen.root).toHaveStyle({ backgroundColor: t.surface.header });
    });

    it('renders the bottom bar with a brand-filled primary button', async () => {
      await renderIn(
        brand,
        mode,
        <WizardBottomBar currentStep={2} totalSteps={3} onPrevious={jest.fn()} onNext={jest.fn()} />
      );
      expect(screen.getByLabelText('Next')).toHaveStyle({ backgroundColor: t.brand.fill });
      expect(screen.getByLabelText('Back')).toBeOnTheScreen();
    });
  });

  // Same bar on every step as the dispatch and invoice wizards (§14.3)
  it('shows Next alone on step 1, Back and Next in the middle, Back and the save action on review', async () => {
    const user = userEvent.setup({ delay: 0 });
    const first = await renderIn('orange', 'light', <WizardBottomBar currentStep={1} totalSteps={3} onNext={jest.fn()} />);
    expect(screen.getAllByLabelText('Next')).toHaveLength(1);
    expect(screen.queryByLabelText('Back')).not.toBeOnTheScreen();
    await first.unmount();

    const onPrevious = jest.fn();
    const onNext = jest.fn();
    const middle = await renderIn(
      'orange',
      'light',
      <WizardBottomBar currentStep={2} totalSteps={3} onPrevious={onPrevious} onNext={onNext} />
    );
    await user.press(screen.getByLabelText('Back'));
    await user.press(screen.getByLabelText('Next'));
    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    await middle.unmount();

    await renderIn(
      'orange',
      'light',
      <WizardBottomBar currentStep={3} totalSteps={3} onPrevious={jest.fn()} onNext={jest.fn()} nextLabel="Save GRN" />
    );
    expect(screen.getAllByLabelText('Back')).toHaveLength(1);
    expect(screen.getAllByLabelText('Save GRN')).toHaveLength(1);
  });

  it('asks before discarding the GRN', async () => {
    const user = userEvent.setup({ delay: 0 });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onCancel = jest.fn();
    await renderIn('orange', 'light', <GRNFormHeader title="Create GRN" onCancel={onCancel} />);
    await user.press(screen.getByLabelText('Cancel GRN'));
    expect(alert).toHaveBeenCalledWith('Discard this GRN?', expect.any(String), expect.any(Array), { cancelable: true });
    const buttons = alert.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    expect(buttons.map(b => b.text)).toEqual(['Keep editing', 'Discard GRN']);
    buttons[1].onPress?.();
    expect(onCancel).toHaveBeenCalled();
    alert.mockRestore();
  });
});
