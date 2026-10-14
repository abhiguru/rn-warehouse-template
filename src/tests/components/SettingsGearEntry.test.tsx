/**
 * SR-O03: the way to Settings from the list and report headers is a gear,
 * which a first-time user recognises, not the person's initials. The button
 * and where it goes are unchanged; since G-08 it is spoken "Tools and settings".
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { FilteredListHeader } from '@/features/filters/components/FilteredListHeader';
import type { FilterListDefinition } from '@/features/filters/types';
import type { useListFilters } from '@/features/filters/useListFilters';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange' }, auth: { userProfile: { id: 'u1', name: 'Asha Fictional', role: 'staff' } } }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/features/filters/components/FilterBar', () => ({ FilterBar: () => null }));
jest.mock('@/features/filters/components/ListSearchField', () => ({ ListSearchField: () => null }));

const config = { listKey: 'test-list', title: 'Test', fields: [], fastFilters: [] } as unknown as FilterListDefinition;
const filters = { search: '', setSearch: jest.fn(), hasAny: false } as unknown as ReturnType<typeof useListFilters>;

describe('the Settings entry in the list header', () => {
  let tree: ReactTestRenderer;
  afterEach(() => act(() => tree.unmount()));

  it('is a cog icon, not an avatar, spoken "Tools and settings", and opens Settings', async () => {
    await act(async () => {
      tree = create(<FilteredListHeader title="GRNs" config={config} filters={filters} />);
    });
    const button = tree.root.find(node => node.props.accessibilityLabel === 'Tools and settings' && typeof node.props.onPress === 'function');
    const icons = button.findAll(node => (node.type as unknown) === 'Icon').map(node => node.props.name);
    expect(icons).toEqual(['cog-outline']);
    // No initials are drawn in the button.
    expect(button.findAll(node => typeof node.props.children === 'string' && /^[A-Z]{1,2}$/.test(node.props.children))).toHaveLength(0);
    act(() => button.props.onPress());
    expect(router.push).toHaveBeenCalledWith('/settings');
  });
});

describe('every header with a Settings entry', () => {
  const root = path.resolve(__dirname, '../../..');
  it.each([
    'src/features/filters/components/FilteredListHeader.tsx',
    'src/components/GRNListFiori.tsx',
    'app/(tabs)/reports.tsx',
  ])('%s draws the gear and no avatar', file => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const entry = source.slice(source.indexOf("router.push('/settings')"));
    expect(entry.slice(0, 600)).toContain('name="cog-outline"');
    expect(source).not.toMatch(/<Avatar\b/);
  });
});
