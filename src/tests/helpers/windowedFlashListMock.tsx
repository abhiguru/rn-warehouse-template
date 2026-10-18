/**
 * A stand-in for FlashList that draws only a window of its rows, so a test can
 * take rows off the screen and bring them back, as scrolling does on a phone
 * (a row that leaves the window unmounts; one that comes back mounts again).
 *
 *   jest.mock('@shopify/flash-list', () => require('@/tests/helpers/windowedFlashListMock'));
 *   act(() => setFlashListWindow(0, 1));   // only the first row
 *   act(() => setFlashListWindow());       // every row again
 *
 * Rows are RECYCLED, as FlashList does: a row that leaves the window gives its mounted slot back to
 * a pool (one per `getItemType`), and a row that enters takes the slot that was freed last for its own type. React
 * then updates the old row component with the new item's props instead of mounting it anew, so
 * state kept inside a row (a focus ring, an open flag) shows up on the wrong record, and a list
 * keyed by index or with one type for every kind of row draws the wrong part. A row that needs a
 * fresh start must say so with a `key` inside the row, as in FlashList.
 *
 * Like flashListMock, the host element is named "FlashList" and keeps the
 * list's props, and the header, the empty component and the footer are drawn.
 * `innerRef` gets a handle whose scrollToIndex moves the window to that row.
 * The window starts open; call resetFlashListWindow() before each test.
 */
import React from 'react';

type Part = React.ComponentType | React.ReactElement | null | undefined;
const draw = (part: Part) => (part ? (React.isValidElement(part) ? part : React.createElement(part as React.ComponentType)) : null);

interface FlashListProps<T> {
  data?: readonly T[] | null;
  renderItem: (info: { item: T; index: number }) => React.ReactElement | null;
  keyExtractor?: (item: T, index: number) => string;
  getItemType?: (item: T, index: number) => string | number | undefined;
  ListHeaderComponent?: Part;
  ListEmptyComponent?: Part;
  ListFooterComponent?: Part;
  /** The list's own ref, as KeyboardAwareFlashList hands it on. */
  innerRef?: (list: unknown) => void;
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

/** The mounted slots of a list: which slot each visible row sits in, and the free ones by row type. */
interface Slots {
  of: Map<string, string>;
  free: Map<string, string[]>;
  made: number;
}

export function FlashList<T>(props: FlashListProps<T>) {
  const { start, end } = React.useSyncExternalStore(subscribe, read);
  const slots = React.useRef<Slots>({ of: new Map(), free: new Map(), made: 0 }).current;
  const innerRef = props.innerRef;
  // scrollToIndex brings that row (and the rows around it) into the window, as scrolling would.
  React.useEffect(() => {
    innerRef?.({
      scrollToIndex: async ({ index }: { index: number }) => {
        setFlashListWindow(Math.max(0, index - 1), index + 4);
      },
    });
  }, [innerRef]);
  const data = props.data ?? [];

  // Rows that left the window give their slot back; rows that came in take a free slot of their type.
  const rows = data
    .map((item, index) => ({ item, index, key: props.keyExtractor ? props.keyExtractor(item, index) : String(index) }))
    .filter(({ index }) => index >= start && index < end);
  const visible = new Set(rows.map((row) => row.key));
  slots.of.forEach((slot, key) => {
    if (visible.has(key)) return;
    const type = slot.slice(0, slot.indexOf('#'));
    slots.free.set(type, [...(slots.free.get(type) ?? []), slot]);
    slots.of.delete(key);
  });
  const drawn = rows.map(({ item, index, key }) => {
    let slot = slots.of.get(key);
    if (!slot) {
      const type = String(props.getItemType?.(item, index) ?? 'default');
      const pool = slots.free.get(type) ?? [];
      slot = pool.pop() ?? `${type}#${slots.made++}`;
      slots.free.set(type, pool);
      slots.of.set(key, slot);
    }
    return React.createElement(React.Fragment, { key: slot }, props.renderItem({ item, index }));
  });
  return React.createElement(
    'FlashList',
    props as unknown as Record<string, unknown>,
    draw(props.ListHeaderComponent),
    data.length === 0 ? draw(props.ListEmptyComponent) : drawn,
    draw(props.ListFooterComponent)
  );
}
