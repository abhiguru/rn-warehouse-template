/** The screen reader hook: starts from the last known answer, and a switch event beats an older answer. */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { resetScreenReaderKnown, useScreenReader } from '../useScreenReader';

const seen: boolean[] = [];
function Probe() {
  const on = useScreenReader();
  seen.push(on);
  return null;
}
let changed: ((on: boolean) => void) | undefined;
const listen = () =>
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((name: string, handler: (on: boolean) => void) => {
    if (name === 'screenReaderChanged') changed = handler;
    return { remove: jest.fn() };
  }) as never);

beforeEach(() => { seen.length = 0; changed = undefined; resetScreenReaderKnown(); });
afterEach(() => jest.restoreAllMocks());

it('starts the next screen as on when the last answer was on (no table drawn first)', async () => {
  listen();
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
  await render(<Probe />);
  expect(seen[0]).toBe(false);
  seen.length = 0;
  await render(<Probe />);
  expect(seen[0]).toBe(true);
  expect(seen).not.toContain(false);
});

it('keeps a switch event that comes before the first answer: the older answer "off" is ignored', async () => {
  listen();
  let answer!: (on: boolean) => void;
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockReturnValue(new Promise<boolean>((resolve) => { answer = resolve; }));
  await render(<Probe />);
  await act(async () => { changed!(true); });
  await act(async () => { answer(false); });
  expect(seen[seen.length - 1]).toBe(true);
});
