/**
 * SR-O03: the way to Settings from the list and report headers is a gear,
 * which a first-time user recognises, not the person's initials. The button
 * and where it goes are unchanged; since G-08 it is spoken "Tools and settings".
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, userEvent, within } from '@testing-library/react-native';
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
  it('is a cog icon, not an avatar, spoken "Tools and settings", and opens Settings', async () => {
    const user = userEvent.setup({ delay: 0 });
    await render(<FilteredListHeader title="GRNs" config={config} filters={filters} />);
    const button = screen.getByRole('button', { name: 'Tools and settings' });
    // The icon is a host named Icon (the vector-icons stand-in) with no role or text: found by its type under the button.
    const icons = button.queryAll(node => (node.type as unknown) === 'Icon').map(node => node.props.name);
    expect(icons).toEqual(['cog-outline']);
    // No initials are drawn in the button.
    expect(within(button).queryAllByText(/^[A-Z]{1,2}$/, { includeHiddenElements: true })).toHaveLength(0);
    await user.press(button);
    expect(router.push).toHaveBeenCalledWith('/settings');
  });
});

describe('every header with a Settings entry', () => {
  const root = path.resolve(__dirname, '../../..');
  it.each([
    'src/features/filters/components/FilteredListHeader.tsx',
    'app/(tabs)/reports.tsx',
  ])('%s draws the gear and no avatar', file => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const entry = source.slice(source.indexOf("router.push('/settings')"));
    expect(entry.slice(0, 600)).toContain('name="cog-outline"');
    expect(source).not.toMatch(/<Avatar\b/);
  });

  // Since 2026-10-18 the GRN tab draws the shared list header, so its gear is the one tested above.
  it('the GRN tab uses the shared list header and draws no header of its own', () => {
    const source = fs.readFileSync(path.join(root, 'src/components/GRNListFiori.tsx'), 'utf8');
    expect(source).toContain('<FilteredListHeader');
    expect(source).not.toContain("router.push('/settings')");
    expect(source).not.toMatch(/<Avatar\b/);
  });
});
