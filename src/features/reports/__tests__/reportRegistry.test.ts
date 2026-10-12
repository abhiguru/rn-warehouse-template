import fs from 'fs';
import path from 'path';
import { REPORTS, reportById } from '../reportRegistry';
import { canOpenScreen } from '@/config/roles';
import { decideRoute } from '@/navigation/routeAccess';
import { setLanguage } from '@/i18n';
import { en } from '@/i18n/locales/en';
import { gu } from '@/i18n/locales/gu';

const APP_DIR = path.resolve(__dirname, '../../../../app');
const ROLES = ['admin', 'supervisor', 'staff', 'customer'];

afterEach(() => setLanguage('en'));

describe('report registry', () => {
  it('lists the eight reports once each, in the order of the Reports tab', () => {
    expect(REPORTS.map((report) => report.id)).toEqual([
      'customer-activity',
      'stock-summary',
      'item-stock-summary',
      'dispatch-activity',
      'grn-activity',
      'invoice-history',
      'stock-aging',
      'operations-dashboard',
    ]);
    expect(new Set(REPORTS.map((report) => report.id)).size).toBe(8);
  });

  it('has a screen file for every route, and no report screen is left out', () => {
    for (const report of REPORTS) {
      expect(report.route).toBe(`/reports/${report.id}`);
      expect(fs.existsSync(path.join(APP_DIR, 'reports', `${report.id}.tsx`))).toBe(true);
    }
    const files = fs.readdirSync(path.join(APP_DIR, 'reports')).filter((name) => name.endsWith('.tsx'));
    expect(files.map((name) => name.replace(/\.tsx$/, '')).sort()).toEqual(REPORTS.map((report) => report.id).sort());
  });

  it('the root stack declares every report route from the registry', () => {
    const layout = fs.readFileSync(path.join(APP_DIR, '_layout.tsx'), 'utf8');
    // One <Stack.Screen> per report, named by its id: a report added to the registry is declared with it.
    expect(layout).toMatch(
      /\{REPORTS\.map\(\(report\) => \(\s*<Stack\.Screen\s+key=\{report\.id\}\s+name=\{`reports\/\$\{report\.id\}`\}\s+options=\{\{ headerShown: false \}\}\s*\/>\s*\)\)\}/
    );
    // No report route is declared by hand beside the table.
    expect(layout).not.toMatch(/name="reports\//);
  });

  it('files the reports under their categories and marks the ones without a period', () => {
    const byCategory = (category: string) => REPORTS.filter((report) => report.category === category).map((report) => report.id);
    expect(byCategory('stock')).toEqual(['stock-summary', 'item-stock-summary', 'stock-aging']);
    expect(byCategory('movement')).toEqual(['dispatch-activity', 'grn-activity']);
    expect(byCategory('financial')).toEqual(['invoice-history']);
    expect(byCategory('operations')).toEqual(['customer-activity', 'operations-dashboard']);
    expect(REPORTS.filter((report) => !report.hasPeriod).map((report) => report.id)).toEqual(['stock-summary', 'item-stock-summary', 'stock-aging']);
  });

  it('gates the operations dashboard only, with the gate the route guard uses', () => {
    expect(REPORTS.filter((report) => report.gate).map((report) => [report.id, report.gate])).toEqual([
      ['operations-dashboard', 'operationsDashboard'],
    ]);
    for (const report of REPORTS) {
      for (const role of ROLES) {
        const offered = !report.gate || canOpenScreen(role, report.gate);
        expect([report.id, role, decideRoute(`reports/${report.id}`, { isSignedIn: true, role })]).toEqual([report.id, role, offered ? 'allow' : 'home']);
      }
    }
  });

  it('has a title and a description in English and in Gujarati, and they follow the language', () => {
    const camel = (id: string) => id.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase());
    for (const report of REPORTS) {
      const key = camel(report.id) as keyof typeof en.reports.titles;
      setLanguage('en');
      expect(report.title).toBe(en.reports.titles[key]);
      expect(report.description).toBe(en.nav.reports.descriptions[key]);
      const english = [report.title, report.description];

      setLanguage('gu');
      expect(report.title).toBe(gu.reports.titles[key]);
      expect(report.description).toBe(gu.nav.reports.descriptions[key]);
      for (const text of [report.title, report.description]) {
        expect(text).toMatch(/[઀-૿]/);
        expect(english).not.toContain(text);
      }
    }
  });

  it('finds a report by its id and nothing by a word every object has', () => {
    expect(reportById('stock-aging')).toBe(REPORTS[6]);
    setLanguage('gu');
    // The definition itself, not a copy: its title still follows the language.
    expect(reportById('stock-aging')?.title).toBe(gu.reports.titles.stockAging);
    for (const id of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'length', '0', '', 'stock', 'Stock-Aging', '/reports/stock-aging']) {
      expect(reportById(id)).toBeUndefined();
    }
  });
});
