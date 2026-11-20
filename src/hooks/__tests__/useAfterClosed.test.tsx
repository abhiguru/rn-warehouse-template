/**
 * "Show X after Y has closed": on iOS the next dialog waits for the first one's `onDismiss`, on Android it runs once
 * the first is hidden. When the dialog is not open, the next one runs at once.
 */
import { Platform } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useAfterClosed } from '../useAfterClosed';

type Api = ReturnType<typeof useAfterClosed>;
let api: { current: Api };
let setVisible: (visible: boolean) => Promise<void>;
const original = Platform.OS;

const render = async (visible: boolean) => {
  const { result, rerender } = await renderHook(({ visible: v }: { visible: boolean }) => useAfterClosed(v), {
    initialProps: { visible },
  });
  api = result;
  setVisible = async (v: boolean) => { await rerender({ visible: v }); };
};
afterEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original });
});
const platform = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });

describe('on iOS', () => {
  beforeEach(() => platform('ios'));

  it('waits for the dialog to report that it has closed', async () => {
    await render(true);
    const next = jest.fn();

    await act(async () => { api.current.later(next); });
    await setVisible(false);
    // Hidden, but still closing: a Modal opened now would be dropped.
    expect(next).not.toHaveBeenCalled();

    await act(async () => { api.current.onDismissed(); });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('runs what was asked in the same handler that hides the dialog', async () => {
    await render(true);
    const next = jest.fn();

    // later() first, then the flag: the order every screen uses.
    await act(async () => { api.current.later(next); await setVisible(false); });
    expect(next).not.toHaveBeenCalled();
    await act(async () => { api.current.onDismissed(); });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('still waits when asked after the dialog was hidden but before it reported closed', async () => {
    await render(true);
    const next = jest.fn();
    await setVisible(false);

    await act(async () => { api.current.later(next); });
    expect(next).not.toHaveBeenCalled();
    await act(async () => { api.current.onDismissed(); });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('runs at once when the dialog is not open nor closing', async () => {
    await render(false);
    const next = jest.fn();

    await act(async () => { api.current.later(next); });

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('runs once only: a second dismissal does nothing', async () => {
    await render(true);
    const next = jest.fn();
    await act(async () => { api.current.later(next); });
    await setVisible(false);

    await act(async () => { api.current.onDismissed(); api.current.onDismissed(); });

    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('on Android', () => {
  beforeEach(() => platform('android'));

  it('runs once the dialog is hidden, without any dismissal event', async () => {
    await render(true);
    const next = jest.fn();

    await act(async () => { api.current.later(next); });
    expect(next).not.toHaveBeenCalled();
    await setVisible(false);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('runs at once when the dialog is not open', async () => {
    await render(false);
    const next = jest.fn();

    await act(async () => { api.current.later(next); });

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('keeps only the latest request', async () => {
    await render(true);
    const first = jest.fn();
    const second = jest.fn();
    await act(async () => { api.current.later(first); api.current.later(second); });

    await setVisible(false);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
