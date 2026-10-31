import React from 'react';
import { BackHandler } from 'react-native';
import { act, create } from 'react-test-renderer';
import { useMarkLeavingOnBack } from '../useMarkLeavingOnBack';

function Probe({ onLeaving }: { onLeaving: () => void }) {
  useMarkLeavingOnBack(onLeaving);
  return null;
}

describe('useMarkLeavingOnBack', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reports the hardware Back key and lets Back go on', () => {
    const remove = jest.fn();
    let press: (() => boolean | null | undefined) | undefined;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      press = handler;
      return { remove };
    });
    const onLeaving = jest.fn();
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<Probe onLeaving={onLeaving} />); });

    expect(onLeaving).not.toHaveBeenCalled();
    expect(press?.()).toBe(false);
    expect(onLeaving).toHaveBeenCalledTimes(1);

    act(() => tree.unmount());
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
