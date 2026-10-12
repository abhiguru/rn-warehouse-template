/**
 * A stand-in for FlashList in component tests: it draws the header, every row
 * (or the empty component) and the footer, with no measuring and no recycling.
 *
 *   jest.mock('@shopify/flash-list', () => require('@/tests/helpers/flashListMock'));
 *
 * The host element is named "FlashList" and keeps the list's props, so a test
 * can pull to refresh (`props.refreshControl.props.onRefresh()`) or reach the
 * end (`props.onEndReached()`).
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

export function FlashList<T>(props: FlashListProps<T>) {
  const data = props.data ?? [];
  return React.createElement(
    'FlashList',
    props as unknown as Record<string, unknown>,
    draw(props.ListHeaderComponent),
    data.length === 0
      ? draw(props.ListEmptyComponent)
      : data.map((item, index) =>
          React.createElement(React.Fragment, { key: props.keyExtractor ? props.keyExtractor(item, index) : index }, props.renderItem({ item, index }))
        ),
    draw(props.ListFooterComponent)
  );
}
