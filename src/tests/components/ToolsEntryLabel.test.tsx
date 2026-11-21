/**
 * G-08: the cog in the list headers leads to Customers, Items, Users, Item
 * pricing and Temperature as well as to the person's settings, so it is
 * spoken "Tools and settings", not "Open settings". The cog, its place and
 * where it goes stay.
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { t } from '@/i18n';
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

describe('the cog in a list header', () => {
  it('is spoken "Tools and settings" and opens Settings', async () => {
    await render(<FilteredListHeader title="Orders" config={config} filters={filters} />);
    const cog = screen.getByRole('button', { name: 'Tools and settings' });
    expect(cog.children[0]).toMatchObject({ props: { name: 'cog-outline' } });

    expect(screen.queryByLabelText('Open settings')).not.toBeOnTheScreen();
    await userEvent.press(cog);
    expect(router.push).toHaveBeenCalledWith('/settings');
  });

  it('has the Gujarati name in the words of the Settings screen ("tools" as in Warehouse tools)', () => {
    expect(t('common.toolsAndSettings', undefined, 'gu')).toBe('સાધનો અને સેટિંગ');
    expect(t('settings.features.title', undefined, 'gu')).toContain('સાધનો');
  });
});
