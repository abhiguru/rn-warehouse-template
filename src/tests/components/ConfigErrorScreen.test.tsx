import React from 'react';
import { StyleSheet } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import ConfigErrorScreen from '@/components/ConfigErrorScreen';
import { BRANDS, getTokens, type Brand, type Mode } from '@/theme/tokens';

let mockTheme: { preference: Mode; brand: Brand } = { preference: 'light', brand: 'orange' };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: mockTheme }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');

const user = userEvent.setup({ delay: 0 });
const byLabel = (label: string) => screen.queryAllByRole('button', { name: label });
const button = (label: string) => screen.getByRole('button', { name: label });
// The mocked icon is a bare host element with no role or text; the theme background is on a plain View. Both are found by walking the tree.
type Node = NonNullable<typeof screen.root>;
function findHosts(match: (node: Node) => boolean): Node[] {
  const found: Node[] = [];
  const walk = (node: Node) => {
    if (typeof node.type === 'string' && match(node)) found.push(node);
    for (const child of node.children) if (typeof child !== 'string') walk(child as Node);
  };
  walk(screen.root as Node);
  return found;
}

afterEach(() => {
  mockTheme = { preference: 'light', brand: 'orange' };
});

it('shows the error details (development builds) and a retry button only when no server change is offered', async () => {
  const onRetry = jest.fn();
  await render(<ConfigErrorScreen error="Fictional unreachable origin" onRetry={onRetry} />);
  expect(screen.getByText(/Fictional unreachable origin/)).toBeOnTheScreen();
  expect(byLabel('Retry loading configuration')).toHaveLength(1);
  expect(byLabel('Change warehouse server')).toHaveLength(0);
  await user.press(button('Retry loading configuration'));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

it('opens server selection through onChangeServer without retrying', async () => {
  const onRetry = jest.fn();
  const onChangeServer = jest.fn();
  await render(<ConfigErrorScreen error="Fictional unreachable origin" onRetry={onRetry} onChangeServer={onChangeServer} />);
  expect(byLabel('Change warehouse server')).toHaveLength(1);
  await user.press(button('Change warehouse server'));
  expect(onChangeServer).toHaveBeenCalledTimes(1);
  expect(onRetry).not.toHaveBeenCalled();
});

it('disables the change-server button while a retry is in progress', async () => {
  let finishRetry!: () => void;
  const onRetry = jest.fn(() => new Promise<void>(resolve => { finishRetry = resolve; }));
  const onChangeServer = jest.fn();
  await render(<ConfigErrorScreen onRetry={onRetry} onChangeServer={onChangeServer} />);
  await user.press(button('Retry loading configuration'));
  expect(button('Retrying')).toBeDisabled();
  expect(button('Change warehouse server')).toBeDisabled();
  await act(async () => { finishRetry(); });
  expect(button('Change warehouse server')).toBeEnabled();
  expect(button('Change warehouse server').props.accessibilityState).toMatchObject({ disabled: false });
  expect(byLabel('Retry loading configuration')).toHaveLength(1);
});

describe.each(BRANDS.flatMap(brand => (['light', 'dark'] as Mode[]).map(mode => [brand, mode] as const)))(
  '%s %s theme',
  (brand, mode) => {
    it('renders on the theme background with the negative status icon', async () => {
      mockTheme = { preference: mode, brand };
      await render(<ConfigErrorScreen onRetry={jest.fn()} onChangeServer={jest.fn()} />);
      const t = getTokens(brand, mode);
      const backgrounds = findHosts(node => StyleSheet.flatten(node.props.style as never)?.backgroundColor === t.background.base);
      expect(backgrounds.length).toBeGreaterThan(0);
      const icon = findHosts(node => node.type === ('Icon' as unknown) && node.props.name === 'cloud-off-outline');
      expect(icon[0]).toHaveProp('color', t.status.negative.text);
    });
  }
);

it('with central login the second button reads My facilities and goes there', async () => {
  const onChangeServer = jest.fn();
  await render(<ConfigErrorScreen onRetry={jest.fn()} onChangeServer={onChangeServer} toFacilities />);
  expect(byLabel('Change warehouse server')).toHaveLength(0);
  expect(screen.getByText('My facilities')).toBeOnTheScreen();
  expect(screen.queryByText('Change server')).not.toBeOnTheScreen();
  await user.press(button('Back to My facilities'));
  expect(onChangeServer).toHaveBeenCalledTimes(1);
});

it('while the server is being updated it has its own title and text, Try again, and My facilities with central login', async () => {
  const onRetry = jest.fn();
  const onChangeServer = jest.fn();
  await render(<ConfigErrorScreen error="technical detail" upgrading onRetry={onRetry} onChangeServer={onChangeServer} toFacilities />);
  expect(screen.getByText('Server being updated')).toBeOnTheScreen();
  expect(screen.getByText("The facility's server is being updated. Try again in a few minutes.")).toBeOnTheScreen();
  expect(screen.queryByText("Couldn't load app settings")).not.toBeOnTheScreen();
  expect(screen.queryByText(/technical detail/)).not.toBeOnTheScreen();
  expect(screen.getByText('Try again')).toBeOnTheScreen();
  expect(screen.getByText('My facilities')).toBeOnTheScreen();
  await user.press(button('Retry loading configuration'));
  expect(onRetry).toHaveBeenCalledTimes(1);
  await user.press(button('Back to My facilities'));
  expect(onChangeServer).toHaveBeenCalledTimes(1);
});
