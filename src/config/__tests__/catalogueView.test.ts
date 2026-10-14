/**
 * How the catalogue is shown (src/config/catalogueView.ts): availability, the order of the
 * list, the place line and the "last seen" line.
 */
import { catalogueAvailability, lastSeenText, placeText, sortCatalogue } from '../catalogueView';
import type { CatalogueFacility } from '../centralSession';
import { setLanguage } from '@/i18n';

afterEach(() => setLanguage('en'));

const entry = (id: string, name: string, origin: string | null, online: boolean | null): CatalogueFacility => ({
  id,
  name,
  city: 'Deesa',
  town: 'Deesa',
  district: 'Banaskantha',
  origin,
  operator: '',
  online,
  lastSeenAt: null,
});

describe('catalogueAvailability', () => {
  it('is online, offline, no app server, or nothing reported', () => {
    expect(catalogueAvailability(entry('a', 'A', 'https://a.example.test', true))).toBe('online');
    expect(catalogueAvailability(entry('b', 'B', 'https://b.example.test', false))).toBe('offline');
    expect(catalogueAvailability(entry('c', 'C', 'https://c.example.test', null))).toBeNull();
    expect(catalogueAvailability(entry('d', 'D', null, null))).toBe('no_server');
    // Without an app server nothing else counts, whatever was sent.
    expect(catalogueAvailability(entry('e', 'E', null, true))).toBe('no_server');
  });
});

describe('sortCatalogue', () => {
  // Alphabetical order would be Alpha, Beta, gamma, Mango, Same, Same, Zeta: the groups change it.
  const list = [
    entry('alpha', 'Alpha Cold', null, null),
    entry('zeta', 'Zeta Cold', 'https://zeta.example.test', true),
    entry('beta', 'Beta Cold', 'https://beta.example.test', false),
    entry('same-b', 'Same Name Cold', 'https://same-b.example.test', true),
    entry('mango', 'Mango Cold', 'https://mango.example.test', null),
    entry('same-a', 'Same Name Cold', 'https://same-a.example.test', true),
    entry('gamma', 'gamma cold', 'https://gamma.example.test', true),
  ];

  it('puts online and not reported first, then offline, then no app server; by name inside a group, then by id', () => {
    expect(sortCatalogue(list).map(item => item.id)).toEqual(['gamma', 'mango', 'same-a', 'same-b', 'zeta', 'beta', 'alpha']);
  });

  it('ignores letter case and accents in names, and leaves the list it was given as it was', () => {
    const accented = [entry('e2', 'Élan Cold', 'https://e2.example.test', true), entry('d1', 'Dhruv Cold', 'https://d1.example.test', true), entry('f3', 'farm cold', 'https://f3.example.test', true)];
    expect(sortCatalogue(accented).map(item => item.id)).toEqual(['d1', 'e2', 'f3']);
    expect(accented.map(item => item.id)).toEqual(['e2', 'd1', 'f3']);
  });
});

describe('placeText', () => {
  const place = (town: string, district: string, city = town) => placeText({ town, city, district });

  it('writes "Town, District", without a district that is missing or the town itself', () => {
    expect(place('Dehgam', 'Gandhinagar')).toBe('Dehgam, Gandhinagar');
    expect(place('Jamnagar', 'Jamnagar')).toBe('Jamnagar');
    expect(place('Mehsana', 'mehsana')).toBe('Mehsana');
    expect(place('Deesa', '')).toBe('Deesa');
    expect(place('', 'Mehsana', '')).toBe('Mehsana');
    expect(place('', '', 'Rajkot')).toBe('Rajkot');
    expect(place('', '', '')).toBe('');
  });
});

describe('lastSeenText', () => {
  const now = new Date('2026-10-14T12:00:00.000Z');
  const before = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it('says when the facility was last reached', () => {
    expect(lastSeenText(before(30 * 1000), now)).toBe('Last seen just now');
    expect(lastSeenText(before(12 * 60 * 1000), now)).toBe('Last seen 12 min ago');
    expect(lastSeenText(before(3 * 60 * 60 * 1000), now)).toBe('Last seen 3 h ago');
    // A phone clock a little behind the service's.
    expect(lastSeenText(before(-5 * 1000), now)).toBe('Last seen just now');
  });

  it('says it was never reached when there is no time or it cannot be read', () => {
    expect(lastSeenText(null, now)).toBe('Not reached yet');
    expect(lastSeenText('soon', now)).toBe('Not reached yet');
  });

  it('in Gujarati, with Gujarati digits', () => {
    setLanguage('gu');
    expect(lastSeenText(before(12 * 60 * 1000), now)).toBe('છેલ્લો સંપર્ક: ૧૨ મિનિટ પહેલાં');
    expect(lastSeenText(before(30 * 1000), now)).toBe('છેલ્લો સંપર્ક: હમણાં જ');
    expect(lastSeenText(null, now)).toBe('હજુ સંપર્ક થયો નથી');
  });
});
