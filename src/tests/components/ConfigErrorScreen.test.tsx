import React from 'react';
import { act, create } from 'react-test-renderer';
import ConfigErrorScreen from '@/components/ConfigErrorScreen';
import { BRANDS, getTokens, type Brand, type Mode } from '@/theme/tokens';

let mockTheme: { preference: Mode; brand: Brand } = { preference: 'light', brand: 'orange' };
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: mockTheme }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialCommunityIcons: 'MaterialCommunityIcons' }));

let renderer: ReturnType<typeof create> | undefined;
// The pressable itself: it is the only node carrying both onPress and accessibilityState.
const byLabel = (label: string) =>
  renderer!.root.findAll(node =>
    node.props.accessibilityLabel === label &&
    typeof node.props.onPress === 'function' &&
    node.props.accessibilityState !== undefined);

afterEach(async () => {
  if (renderer) await act(async () => { renderer!.unmount(); });
  renderer = undefined;
  mockTheme = { preference: 'light', brand: 'orange' };
});

it('shows the error details (development builds) and a retry button only when no server change is offered', async () => {
  const onRetry = jest.fn();
  await act(async () => { renderer = create(<ConfigErrorScreen error="Fictional unreachable origin" onRetry={onRetry} />); });
  expect(JSON.stringify(renderer!.toJSON())).toContain('Fictional unreachable origin');
  expect(byLabel('Retry loading configuration')).toHaveLength(1);
  expect(byLabel('Change warehouse server')).toHaveLength(0);
  await act(async () => { byLabel('Retry loading configuration')[0].props.onPress(); });
  expect(onRetry).toHaveBeenCalledTimes(1);
});

it('opens server selection through onChangeServer without retrying', async () => {
  const onRetry = jest.fn();
  const onChangeServer = jest.fn();
  await act(async () => { renderer = create(<ConfigErrorScreen error="Fictional unreachable origin" onRetry={onRetry} onChangeServer={onChangeServer} />); });
  expect(byLabel('Change warehouse server')).toHaveLength(1);
  await act(async () => { byLabel('Change warehouse server')[0].props.onPress(); });
  expect(onChangeServer).toHaveBeenCalledTimes(1);
  expect(onRetry).not.toHaveBeenCalled();
});

it('disables the change-server button while a retry is in progress', async () => {
  let finishRetry!: () => void;
  const onRetry = jest.fn(() => new Promise<void>(resolve => { finishRetry = resolve; }));
  const onChangeServer = jest.fn();
  await act(async () => { renderer = create(<ConfigErrorScreen onRetry={onRetry} onChangeServer={onChangeServer} />); });
  await act(async () => { byLabel('Retry loading configuration')[0].props.onPress(); });
  expect(byLabel('Retrying')[0].props.disabled).toBe(true);
  expect(byLabel('Change warehouse server')[0].props.disabled).toBe(true);
  await act(async () => { finishRetry(); });
  expect(byLabel('Change warehouse server')[0].props.disabled).toBe(false);
  expect(byLabel('Retry loading configuration')).toHaveLength(1);
});

describe.each(BRANDS.flatMap(brand => (['light', 'dark'] as Mode[]).map(mode => [brand, mode] as const)))(
  '%s %s theme',
  (brand, mode) => {
    it('renders on the theme background with the negative status icon', async () => {
      mockTheme = { preference: mode, brand };
      await act(async () => { renderer = create(<ConfigErrorScreen onRetry={jest.fn()} onChangeServer={jest.fn()} />); });
      const t = getTokens(brand, mode);
      const backgrounds = renderer!.root.findAll(node =>
        [].concat(node.props.style ?? []).some((s: { backgroundColor?: string } | null) => s?.backgroundColor === t.background.base));
      expect(backgrounds.length).toBeGreaterThan(0);
      const icon = renderer!.root.findAll(node => (node.type as unknown) === 'MaterialCommunityIcons' && node.props.name === 'cloud-off-outline');
      expect(icon[0].props.color).toBe(t.status.negative.text);
    });
  }
);
