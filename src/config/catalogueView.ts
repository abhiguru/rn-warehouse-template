/**
 * How the association's catalogue is shown on Add facility (app/facility-catalogue.tsx,
 * docs/CENTRAL_LOGIN.md, style guide §3.5): each member's availability, the order of the
 * list, the place line and the "last seen" line. Pure: no network and no React.
 */
import type { CatalogueFacility } from './centralSession';
import { formatRelativeTime } from '@/utils/formatters';
import { t } from '@/i18n';

/**
 * - `online`: the association's service reached the facility at its last check;
 * - `offline`: it did not (the facility can still be tried: the check may be a minute old);
 * - `no_server`: a member with no app server yet, which cannot be added or opened.
 * null: nothing is reported (a catalogue from before central service 0.8.0), so no tag.
 */
export type CatalogueAvailability = 'online' | 'offline' | 'no_server';

export function catalogueAvailability(facility: Pick<CatalogueFacility, 'origin' | 'online'>): CatalogueAvailability | null {
  if (facility.origin === null) return 'no_server';
  if (facility.online === true) return 'online';
  if (facility.online === false) return 'offline';
  return null;
}

/** Online and not reported first, then offline, then the members with no app server yet. */
const rank = (facility: Pick<CatalogueFacility, 'origin' | 'online'>): number => {
  const availability = catalogueAvailability(facility);
  return availability === 'no_server' ? 2 : availability === 'offline' ? 1 : 0;
};

/**
 * The order of the list: by availability (above), then by name ignoring case and accents (as
 * the Customers rail, src/features/customer/railKey.ts), then by id so that two members with
 * the same name always keep the same order.
 */
export function sortCatalogue<T extends Pick<CatalogueFacility, 'id' | 'name' | 'origin' | 'online'>>(list: readonly T[]): T[] {
  return [...list].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * The second line of a row: "Town, District". The district is left out when there is none or
 * it is the town's own name ("Jamnagar, Jamnagar" says nothing twice).
 */
export function placeText(facility: Pick<CatalogueFacility, 'town' | 'city' | 'district'>): string {
  const town = facility.town || facility.city;
  const district = facility.district;
  if (!district || district.toLowerCase() === town.toLowerCase()) return town;
  return town ? `${town}, ${district}` : district;
}

/**
 * The line under an offline row: when the association's service last reached the facility.
 * Under a minute is its own sentence because the relative time is written as a sentence
 * start ("Just now").
 */
export function lastSeenText(iso: string | null, now: Date = new Date()): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return t('central.catalogue.neverSeen');
  if (now.getTime() - Date.parse(iso) < 60 * 1000) return t('central.catalogue.lastSeenJustNow');
  return t('central.catalogue.lastSeen', { time: formatRelativeTime(iso, undefined, now) });
}
