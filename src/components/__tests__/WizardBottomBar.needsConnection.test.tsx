/**
 * WH-381, Design offline-capture.md Part 13.1 B and 13.4: a WizardBottomBar whose primary action needs the server and the
 * phone is offline (`needsConnectionTestID` given) says "Needs a connection" once above the buttons, disables the primary
 * button with the reason at the end of its screen-reader label, and never calls `onNext`. Left out, the bar is as before.
 *
 * ===== AGREE WITH DEVELOPMENT =====
 *  - Passing `needsConnectionTestID` is what says "offline" (the bar has no connection hook of its own); the screens pass it
 *    only while offline (DispatchReviewStep, InvoiceReviewStep).
 *  - Back stays enabled (Design 13.1 B: only the final action is disabled).
 * ==================================
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import WizardBottomBar from '../WizardBottomBar';
import { setLanguage } from '@/i18n';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 34, left: 0, right: 0 }),
}));

afterEach(async () => { await setLanguage('en'); });

const draw = (props: Partial<React.ComponentProps<typeof WizardBottomBar>> = {}) => {
  const onNext = jest.fn();
  const onPrevious = jest.fn();
  return render(
    <WizardBottomBar currentStep={3} totalSteps={3} onPrevious={onPrevious} onNext={onNext} nextLabel="Create dispatch" nextTestID="bar-next" {...props} />
  ).then(() => ({ onNext, onPrevious }));
};

describe('WizardBottomBar needsConnectionTestID (WH-381, Design 13.1 B)', () => {
  it('offline: one "Needs a connection" line above the bar, the primary button disabled and spoken with the reason, Back still works', async () => {
    const { onNext, onPrevious } = await draw({ needsConnectionTestID: 'dispatch-form-bottom-bar-needs-connection' });
    expect(screen.getByTestId('dispatch-form-bottom-bar-needs-connection')).toHaveTextContent('Needs a connection');
    expect(screen.getAllByText('Needs a connection')).toHaveLength(1);
    const next = screen.getByRole('button', { name: 'Create dispatch, needs a connection' });
    expect(next).toBeDisabled();
    await userEvent.press(next);
    expect(onNext).not.toHaveBeenCalled();
    await userEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onPrevious).toHaveBeenCalledTimes(1);
  });

  it('offline, Gujarati: the line says the Design words', async () => {
    await setLanguage('gu');
    await draw({ needsConnectionTestID: 'invoice-form-bottom-bar-needs-connection' });
    expect(screen.getByTestId('invoice-form-bottom-bar-needs-connection')).toHaveTextContent('કનેક્શન જોઈએ');
    expect(screen.getByTestId('bar-next')).toBeDisabled();
    expect(screen.getByTestId('bar-next')).toHaveAccessibleName(/, કનેક્શન જોઈએ$/);
  });

  it('with the testID left out the bar is as before: no line, the button enabled and pressing it calls onNext', async () => {
    const { onNext } = await draw();
    expect(screen.queryByText('Needs a connection')).not.toBeOnTheScreen();
    const next = screen.getByRole('button', { name: 'Create dispatch' });
    expect(next).toBeEnabled();
    await userEvent.press(next);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('a spoken label of its own gets the reason after it', async () => {
    await draw({ needsConnectionTestID: 'x-needs-connection', nextAccessibilityLabel: 'Create this dispatch' });
    expect(screen.getByRole('button', { name: 'Create this dispatch, needs a connection' })).toBeDisabled();
  });
});
