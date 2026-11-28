/**
 * WH-362: when the phone's secure store stays unreadable, the load-error screen says so in Design's words (Part 12.1) and
 * offers "Try again" only. Every other cause keeps today's screen, with its connection text and "Change warehouse server".
 * Real: `ConfigErrorScreen` and the app's translations. The theme is the only fake.
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import ConfigErrorScreen from '@/components/ConfigErrorScreen';
import { setLanguage } from '@/i18n';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

afterEach(() => { setLanguage('en'); });

const buttons = () => screen.queryAllByRole('button').map(node => node.props.accessibilityLabel ?? '');

it('English: the title, the text and "Try again" only; no connection hint and no way to leave the facility', async () => {
  const onRetry = jest.fn();
  await render(<ConfigErrorScreen storeUnreadable onRetry={onRetry} onChangeServer={jest.fn()} toFacilities />);
  expect(screen.getByRole('header', { name: "Couldn't start the app" })).toBeOnTheScreen();
  expect(screen.getByText("This phone couldn't read the app's saved sign-in. Nothing has been deleted. Try again. If it keeps happening, restart the phone.")).toBeOnTheScreen();
  expect(screen.queryByText(/connection/i)).not.toBeOnTheScreen();
  expect(buttons()).toEqual(['Try starting the app again']);
  expect(screen.getByRole('button', { name: 'Try starting the app again' })).toHaveTextContent('Try again');
  await userEvent.setup({ delay: 0 }).press(screen.getByRole('button', { name: 'Try starting the app again' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

it('Gujarati: the same screen in Design\'s words', async () => {
  setLanguage('gu');
  await render(<ConfigErrorScreen storeUnreadable onRetry={jest.fn()} onChangeServer={jest.fn()} />);
  expect(screen.getByRole('header', { name: 'ઍપ શરૂ થઈ શકી નથી' })).toBeOnTheScreen();
  expect(screen.getByText('આ ફોન ઍપનું સાચવેલું લૉગિન વાંચી શક્યો નથી. કંઈ કાઢી નાખ્યું નથી. ફરી પ્રયાસ કરો. વારંવાર થાય તો ફોન બંધ કરીને ફરી ચાલુ કરો.')).toBeOnTheScreen();
  expect(buttons()).toEqual(['ઍપ ફરી શરૂ કરવાનો પ્રયાસ કરો']);
});

it('any other cause keeps today\'s title, text and both buttons', async () => {
  await render(<ConfigErrorScreen error="Fictional unreachable origin" onRetry={jest.fn()} onChangeServer={jest.fn()} />);
  expect(screen.getByRole('header', { name: "Couldn't load app settings" })).toBeOnTheScreen();
  expect(screen.queryByText("Couldn't start the app")).not.toBeOnTheScreen();
  expect(screen.getByText(/Check your connection and try again/)).toBeOnTheScreen();
  expect(buttons()).toEqual(['Retry loading configuration', 'Change warehouse server']);
});
