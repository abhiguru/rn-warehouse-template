import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { SortBar, sortDirectionLabel, type SortOption } from '../SortBar';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' } }),
}));

type Field = 'date' | 'number' | 'name' | 'legacy';
const OPTIONS: SortOption<Field>[] = [
  { field: 'date', label: 'Date', icon: 'calendar-outline', kind: 'date' },
  { field: 'number', label: 'Number', icon: 'pound', kind: 'number' },
  { field: 'name', label: 'Name', icon: 'sort-alphabetical-ascending', kind: 'text' },
  { field: 'legacy', label: 'Legacy', icon: 'calendar-outline' },
];

function directionLabel(field: Field, order: 'asc' | 'desc'): string {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <SortBar options={OPTIONS} field={field} order={order} onFieldChange={jest.fn()} onOrderToggle={jest.fn()} />
    );
  });
  const button = renderer.root.findAll(
    node =>
      node.props.accessibilityRole === 'button' &&
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith('Sorted')
  )[0];
  const label = button.props.accessibilityLabel as string;
  act(() => renderer.unmount());
  return label;
}

describe('SortBar direction label', () => {
  it('names a date order as newest or oldest first', () => {
    expect(directionLabel('date', 'desc')).toBe('Sorted newest first. Sort oldest first');
    expect(directionLabel('date', 'asc')).toBe('Sorted oldest first. Sort newest first');
  });

  it('names a number order as highest or lowest number first, not as dates', () => {
    expect(directionLabel('number', 'desc')).toBe('Sorted highest number first. Sort lowest number first');
    expect(directionLabel('number', 'asc')).toBe('Sorted lowest number first. Sort highest number first');
  });

  it('names a text order as A to Z or Z to A', () => {
    expect(directionLabel('name', 'asc')).toBe('Sorted A to Z. Sort Z to A');
    expect(directionLabel('name', 'desc')).toBe('Sorted Z to A. Sort A to Z');
  });

  it('treats an option with no kind as a date, as before', () => {
    expect(directionLabel('legacy', 'desc')).toBe('Sorted newest first. Sort oldest first');
    expect(sortDirectionLabel(undefined, 'asc')).toBe('Sorted oldest first. Sort newest first');
  });
});
