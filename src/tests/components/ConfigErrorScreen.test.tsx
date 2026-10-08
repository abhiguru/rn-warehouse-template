import React from 'react';
import { act, create } from 'react-test-renderer';
import ConfigErrorScreen from '@/components/ConfigErrorScreen';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

let renderer: ReturnType<typeof create> | undefined;
const byLabel = (label: string) =>
  renderer!.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');

afterEach(async () => {
  if (renderer) await act(async () => { renderer!.unmount(); });
  renderer = undefined;
});

it('shows the error details and a retry button only when no server change is offered', async () => {
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
