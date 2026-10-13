/**
 * A stand-in for FlashList that draws only a window of its rows, so a test can
 * take rows off the screen and bring them back, as scrolling does on a phone
 * (a row that leaves the window unmounts; one that comes back mounts again).
 *
 *   jest.mock('@shopify/flash-list', () => require('@/tests/helpers/windowedFlashListMock'));
 *   act(() => setFlashListWindow(0, 1));   // only the first row
 *   act(() => setFlashListWindow());       // every row again
 *
 * Like flashListMock, the host element is named "FlashList" and keeps the
 * list's props, and the header, the empty component and the footer are drawn.
 * The window starts open; call resetFlashListWindow() before each test.
 */
import React from 'react';

type Part = React.ComponentType | React.ReactElement | null | undefined;
const draw = (part: Part) => (part ? (React.isValidElement(part) ? part : React.createElement(part as React.ComponentType)) : null);

interface FlashListProps<T> {
  data?: readonly T[] | null;
  renderItem: (info: { item: T; index: number }) => React.ReactElement | null;
  keyExtractor?: (item: T, index: number) => string;
  ListHeaderComponent?: Part;
  ListEmptyComponent?: Part;
  ListFooterComponent?: Part;
}

let range = { start: 0, end: Infinity };
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const read = () => range;

/** Draw only rows start..end-1 (by index in `data`); no arguments draws every row. */
export function setFlashListWindow(start = 0, end = Infinity) {
  range = { start, end };
  listeners.forEach((listener) => listener());
}
/** Opens the window for the lists drawn next, without telling lists still mounted from an earlier test. */
export const resetFlashListWindow = () => {
  range = { start: 0, end: Infinity };
};

export function FlashList<T>(props: FlashListProps<T>) {
  const { start, end } = React.useSyncExternalStore(subscribe, read);
  const data = props.data ?? [];
  return React.createElement(
    'FlashList',
    props as unknown as Record<string, unknown>,
    draw(props.ListHeaderComponent),
    data.length === 0
      ? draw(props.ListEmptyComponent)
      : data.map((item, index) =>
          index >= start && index < end
            ? React.createElement(React.Fragment, { key: props.keyExtractor ? props.keyExtractor(item, index) : index }, props.renderItem({ item, index }))
            : null
        ),
    draw(props.ListFooterComponent)
  );
}
