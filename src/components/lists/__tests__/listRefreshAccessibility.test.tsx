/**
 * WH-220: every list offers a screen-reader "Refresh" action (TalkBack actions menu, VoiceOver rotor) that runs the
 * list's own refresh, and the last-updated line shows the date as well as the time when the load was on another day.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { listRefreshAccessibility } from '../listRefreshAccessibility';
import { LastUpdatedLine } from '../ListLoadErrors';
import { setLanguage } from '@/i18n';

jest.mock('@/hooks/useTheme', () => ({
  useThemedStyles: (make: (t: unknown) => unknown) => make(new Proxy({}, { get: () => new Proxy({}, { get: () => '#000' }) })),
}));

afterEach(() => setLanguage('en'));

describe('listRefreshAccessibility', () => {
  it('offers one action named refresh, labelled Refresh in English and in Gujarati', () => {
    expect(listRefreshAccessibility(jest.fn()).accessibilityActions).toEqual([{ name: 'refresh', label: 'Refresh' }]);
    setLanguage('gu');
    expect(listRefreshAccessibility(jest.fn()).accessibilityActions).toEqual([{ name: 'refresh', label: 'રિફ્રેશ કરો' }]);
  });

  it('runs the list refresh once for the refresh action, and for no other action', () => {
    const onRefresh = jest.fn();
    const { onAccessibilityAction } = listRefreshAccessibility(onRefresh);
    onAccessibilityAction({ nativeEvent: { actionName: 'print' } } as never);
    expect(onRefresh).not.toHaveBeenCalled();
    onAccessibilityAction({ nativeEvent: { actionName: 'refresh' } } as never);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('LastUpdatedLine with the date', () => {
  const lineText = (at: number, withDate: boolean) => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<LastUpdatedLine at={at} withDate={withDate} />); });
    return tree.root.findByType(Text).props.children as string;
  };
  const earlier = new Date(2026, 9, 9, 16, 5).getTime();

  it('shows date and time for another day in English, and Gujarati digits in Gujarati', () => {
    expect(lineText(earlier, true)).toBe('Last updated 09/10/26, 4:05 pm');
    setLanguage('gu');
    const gu = lineText(earlier, true);
    expect(gu).toContain('૦૯/૧૦/૨૬');
    expect(gu).toContain('૪:૦૫');
    expect(gu).not.toMatch(/[0-9]/);
  });

  it('shows only the time when it was loaded today, and without withDate shows only the time', () => {
    expect(lineText(Date.now(), true)).toMatch(/^Last updated \d{1,2}:\d{2} (am|pm)$/);
    expect(lineText(earlier, false)).toBe('Last updated 4:05 pm');
  });
});
