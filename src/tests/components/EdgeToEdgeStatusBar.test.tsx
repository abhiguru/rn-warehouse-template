import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { Platform, StatusBar } from 'react-native';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';

jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
  StatusBar: {
    setBarStyle: jest.fn(),
  },
}));

type EdgeToEdgeStatusBarProps = React.ComponentProps<
  typeof EdgeToEdgeStatusBar
>;

const mountedRenderers: ReactTestRenderer[] = [];

const getBarStyleCalls = (): Array<
  Parameters<typeof StatusBar.setBarStyle>
> => StatusBar.setBarStyle.mock.calls;

const mountStatusBar = async (
  props: EdgeToEdgeStatusBarProps
): Promise<ReactTestRenderer> => {
  let renderer!: ReactTestRenderer;

  await act(async () => {
    renderer = create(<EdgeToEdgeStatusBar {...props} />);
  });
  mountedRenderers.push(renderer);

  return renderer;
};

const updateStatusBar = async (
  renderer: ReactTestRenderer,
  props: EdgeToEdgeStatusBarProps
): Promise<void> => {
  await act(async () => {
    renderer.update(<EdgeToEdgeStatusBar {...props} />);
  });
};

const unmountStatusBar = async (
  renderer: ReactTestRenderer
): Promise<void> => {
  const rendererIndex = mountedRenderers.indexOf(renderer);
  if (rendererIndex !== -1) mountedRenderers.splice(rendererIndex, 1);

  await act(async () => {
    renderer.unmount();
  });
};

describe('EdgeToEdgeStatusBar', () => {
  beforeEach(() => {
    Platform.OS = 'ios';
    StatusBar.setBarStyle.mockClear();
  });

  afterEach(async () => {
    await act(async () => {
      while (mountedRenderers.length > 0) {
        mountedRenderers.pop()?.unmount();
      }
    });
    StatusBar.setBarStyle.mockClear();
  });

  it('applies the mounted style through the supported StatusBar API', async () => {
    const renderer = await mountStatusBar({
      barStyle: 'dark-content',
      animated: true,
    });

    expect(getBarStyleCalls()).toEqual([['dark-content', true]]);
    expect(renderer.toJSON()).toBeNull();

    await unmountStatusBar(renderer);
    expect(getBarStyleCalls()).toEqual([['dark-content', true]]);
  });

  it('defaults animated to false', async () => {
    const renderer = await mountStatusBar({ barStyle: 'light-content' });

    expect(getBarStyleCalls()).toEqual([['light-content', false]]);

    await unmountStatusBar(renderer);
  });

  it('reapplies an updated top entry', async () => {
    const renderer = await mountStatusBar({
      barStyle: 'dark-content',
      animated: false,
    });
    StatusBar.setBarStyle.mockClear();

    await updateStatusBar(renderer, {
      barStyle: 'light-content',
      animated: true,
    });

    expect(getBarStyleCalls()).toEqual([['light-content', true]]);

    await unmountStatusBar(renderer);
  });

  it('reapplies when only the animated flag changes', async () => {
    const renderer = await mountStatusBar({
      barStyle: 'default',
      animated: false,
    });
    StatusBar.setBarStyle.mockClear();

    await updateStatusBar(renderer, {
      barStyle: 'default',
      animated: true,
    });

    expect(getBarStyleCalls()).toEqual([['default', true]]);

    await unmountStatusBar(renderer);
  });

  it('does not activate an initially inactive entry', async () => {
    const renderer = await mountStatusBar({
      barStyle: 'light-content',
      active: false,
    });

    expect(getBarStyleCalls()).toEqual([]);

    await unmountStatusBar(renderer);
    expect(getBarStyleCalls()).toEqual([]);
  });

  it('activates with the latest props and removes itself on deactivation', async () => {
    const renderer = await mountStatusBar({
      barStyle: 'dark-content',
      active: false,
    });

    await updateStatusBar(renderer, {
      barStyle: 'light-content',
      animated: true,
      active: false,
    });
    expect(getBarStyleCalls()).toEqual([]);

    await updateStatusBar(renderer, {
      barStyle: 'light-content',
      animated: true,
      active: true,
    });
    expect(getBarStyleCalls()).toEqual([['light-content', true]]);
    StatusBar.setBarStyle.mockClear();

    await updateStatusBar(renderer, {
      barStyle: 'light-content',
      animated: true,
      active: false,
    });
    expect(getBarStyleCalls()).toEqual([]);

    await updateStatusBar(renderer, {
      barStyle: 'light-content',
      animated: true,
      active: true,
    });
    expect(getBarStyleCalls()).toEqual([['light-content', true]]);

    await unmountStatusBar(renderer);
  });

  it('restores the prior stack entry when the top entry unmounts', async () => {
    const bottom = await mountStatusBar({
      barStyle: 'light-content',
      animated: true,
    });
    const top = await mountStatusBar({ barStyle: 'dark-content' });
    expect(getBarStyleCalls()).toEqual([
      ['light-content', true],
      ['dark-content', false],
    ]);
    StatusBar.setBarStyle.mockClear();

    await unmountStatusBar(top);
    expect(getBarStyleCalls()).toEqual([['light-content', true]]);

    await unmountStatusBar(bottom);
    expect(getBarStyleCalls()).toEqual([['light-content', true]]);
  });

  it('does not reapply a non-top prop update but restores its latest value later', async () => {
    const bottom = await mountStatusBar({
      barStyle: 'light-content',
      animated: true,
    });
    const top = await mountStatusBar({ barStyle: 'dark-content' });
    StatusBar.setBarStyle.mockClear();

    await updateStatusBar(bottom, {
      barStyle: 'default',
      animated: false,
    });
    expect(getBarStyleCalls()).toEqual([]);

    await updateStatusBar(top, {
      barStyle: 'light-content',
      animated: true,
    });
    expect(getBarStyleCalls()).toEqual([['light-content', true]]);

    await unmountStatusBar(top);
    expect(getBarStyleCalls()).toEqual([
      ['light-content', true],
      ['default', false],
    ]);

    await unmountStatusBar(bottom);
  });

  it('is a no-op on web for mount, prop updates, active changes, and unmount', async () => {
    Platform.OS = 'web';
    const renderer = await mountStatusBar({
      barStyle: 'dark-content',
      animated: true,
    });

    await updateStatusBar(renderer, {
      barStyle: 'light-content',
      animated: false,
    });
    await updateStatusBar(renderer, {
      barStyle: 'light-content',
      animated: false,
      active: false,
    });
    await updateStatusBar(renderer, {
      barStyle: 'light-content',
      animated: false,
      active: true,
    });

    await unmountStatusBar(renderer);
    expect(getBarStyleCalls()).toEqual([]);
  });
});
