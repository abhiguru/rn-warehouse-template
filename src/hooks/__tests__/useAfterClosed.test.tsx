/**
 * "Show X after Y has closed": on iOS the next dialog waits for the first one's `onDismiss`, on Android it runs once
 * the first is hidden. When the dialog is not open, the next one runs at once.
 */
import React from 'react';
import { Platform } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { useAfterClosed } from '../useAfterClosed';

type Api = ReturnType<typeof useAfterClosed>;
let api: Api;
let tree: ReactTestRenderer;
const original = Platform.OS;

function Probe({ visible }: { visible: boolean }) {
  api = useAfterClosed(visible);
  return null;
}
const render = async (visible: boolean) => { await act(async () => { tree = create(<Probe visible={visible} />); }); };
const setVisible = async (visible: boolean) => { await act(async () => { tree.update(<Probe visible={visible} />); }); };
afterEach(async () => {
  await act(async () => { tree.unmount(); });
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original });
});
const platform = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });

describe('on iOS', () => {
  beforeEach(() => platform('ios'));

  it('waits for the dialog to report that it has closed', async () => {
    await render(true);
    const next = jest.fn();

    await act(async () => { api.later(next); });
    await setVisible(false);
    // Hidden, but still closing: a Modal opened now would be dropped.
    expect(next).not.toHaveBeenCalled();

    await act(async () => { api.onDismissed(); });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('runs what was asked in the same handler that hides the dialog', async () => {
    await render(true);
    const next = jest.fn();

    // later() first, then the flag: the order every screen uses.
    await act(async () => { api.later(next); tree.update(<Probe visible={false} />); });
    expect(next).not.toHaveBeenCalled();
    await act(async () => { api.onDismissed(); });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('runs at once when the dialog is not open nor closing', async () => {
    await render(false);
    const next = jest.fn();

    await act(async () => { api.later(next); });

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('runs once only: a second dismissal does nothing', async () => {
    await render(true);
    const next = jest.fn();
    await act(async () => { api.later(next); });
    await setVisible(false);

    await act(async () => { api.onDismissed(); api.onDismissed(); });

    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('on Android', () => {
  beforeEach(() => platform('android'));

  it('runs once the dialog is hidden, without any dismissal event', async () => {
    await render(true);
    const next = jest.fn();

    await act(async () => { api.later(next); });
    expect(next).not.toHaveBeenCalled();
    await setVisible(false);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('runs at once when the dialog is not open', async () => {
    await render(false);
    const next = jest.fn();

    await act(async () => { api.later(next); });

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('keeps only the latest request', async () => {
    await render(true);
    const first = jest.fn();
    const second = jest.fn();
    await act(async () => { api.later(first); api.later(second); });

    await setVisible(false);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
