/**
 * WH-158 (contract section 7): the Reports registry entry of the accountant pack. Written BEFORE the build.
 * The existing registry test lists the eleven reports; it needs the twelfth added when the entry lands.
 */
import { REPORTS, reportById } from '../reportRegistry';
import { setLanguage } from '@/i18n';
import { en } from '@/i18n/locales/en';
import { gu } from '@/i18n/locales/gu';

afterEach(() => setLanguage('en'));

it('lists the accountant pack: id, icon, category, period, gate, feature and route', () => {
  const report = reportById('accountant-pack' as never);
  expect(report).toBeDefined();
  expect(REPORTS.some(r => r.id === ('accountant-pack' as never))).toBe(true);
  expect(report).toMatchObject({
    id: 'accountant-pack', icon: 'folder-zip-outline', category: 'financial', hasPeriod: true,
    gate: 'accountantPack', feature: 'accountantPack', route: '/reports/accountant-pack',
  });
});

it('its title and description follow the language (English and the spec\'s Gujarati draft)', () => {
  const report = reportById('accountant-pack' as never)!;
  setLanguage('en');
  expect(report.title).toBe('Accountant pack');
  expect(report.title).toBe(en.reports.titles.accountantPack);
  expect(report.description).toBe("Month's invoices, receipts and stock for your accountant");
  expect(report.description).toBe(en.nav.reports.descriptions.accountantPack);
  setLanguage('gu');
  expect(report.title).toBe('હિસાબનીશ માટેની ફાઇલો');
  expect(report.title).toBe(gu.reports.titles.accountantPack);
  expect(report.description).toBe('મહિનાના ઇન્વૉઇસ, આવક અને સ્ટોક, તમારા હિસાબનીશ માટે');
});
