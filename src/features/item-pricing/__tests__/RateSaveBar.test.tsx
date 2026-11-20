/** RateSaveBar: content above the buttons, Discard beside Save, collapsed to the buttons, its height reported. */
import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { RateSaveBar } from '../components/RateSaveBar';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

const buttonNames = () => screen.getAllByRole('button').map(b => b.props.accessibilityLabel);

it('shows the note, the hint and a full-width Save; Save is disabled and busy as told', async () => {
  const onPress = jest.fn();
  await render(
    <RateSaveBar helper="You are offline." primary={{ label: 'Save rate', onPress, disabled: true, loading: true, loadingText: 'Saving' }}>
      <Text>Starts on 1 Jan 2027</Text>
    </RateSaveBar>
  );
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(screen.getByText('Starts on 1 Jan 2027')).toBeOnTheScreen();
  expect(screen.getByText('You are offline.')).toBeOnTheScreen();
  // The loading text replaces the label while it waits.
  const save = screen.getByRole('button', { name: 'Saving' });
  expect(save).toBeDisabled();
  expect(save).toBeBusy();
  expect(save).toHaveStyle({ width: '100%' });
  expect(screen.queryByText('Save rate')).not.toBeOnTheScreen();
});

it('puts Discard before Save, and collapsed keeps the two buttons but drops the content', async () => {
  const user = userEvent.setup({ delay: 0 });
  const discard = jest.fn();
  const save = jest.fn();
  const element = (collapsed: boolean) => (
    <RateSaveBar helper="hint" primary={{ label: 'Save', onPress: save }} discard={{ label: 'Discard', onPress: discard }} collapsed={collapsed}>
      <Text>Summary line</Text>
    </RateSaveBar>
  );
  await render(element(false));
  expect(buttonNames()).toEqual(['Discard', 'Save']);
  expect(screen.getByText('Summary line')).toBeOnTheScreen();
  expect(screen.getByText('hint')).toBeOnTheScreen();

  await screen.rerender(element(true));
  expect(buttonNames()).toEqual(['Discard', 'Save']);
  expect(screen.queryByText('Summary line')).not.toBeOnTheScreen();
  expect(screen.queryByText('hint')).not.toBeOnTheScreen();

  await user.press(screen.getByRole('button', { name: 'Discard' }));
  expect(discard).toHaveBeenCalledTimes(1);
  expect(save).not.toHaveBeenCalled();
});

it('reports its measured height on every layout', async () => {
  const onHeight = jest.fn();
  await render(<RateSaveBar primary={{ label: 'Save', onPress: jest.fn() }} onHeight={onHeight} />);
  // The bar is a plain View with no role or text: only its test id reaches it.
  await fireEvent(screen.getByTestId('save-bar'), 'layout', { nativeEvent: { layout: { height: 96 } } });
  expect(onHeight).toHaveBeenCalledWith(96);
});
