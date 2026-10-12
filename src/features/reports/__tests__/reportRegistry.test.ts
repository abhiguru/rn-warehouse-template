import fs from 'fs';
import path from 'path';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { REPORTS, reportById } from '../reportRegistry';
import { NavigationStack } from '../../../../app/_layout';
import { canOpenScreen } from '@/config/roles';
import { decideRoute } from '@/navigation/routeAccess';
import { setLanguage } from '@/i18n';
import { en } from '@/i18n/locales/en';
import { gu } from '@/i18n/locales/gu';

// The root stack of app/_layout.tsx is rendered with a Stack.Screen that records its name.
// The layout imports the whole app shell; only its stack is rendered, so the shell is stubbed.
jest.mock('expo-router', () => {
  const React = require('react');
  const Stack = ({ children }: { children?: React.ReactNode }) => React.createElement('Stack', null, children);
  Stack.Screen = ({ name }: { name: string }) => React.createElement('StackScreen', { name });
  return { Stack, DarkTheme: { colors: {} }, DefaultTheme: { colors: {} }, ThemeProvider: ({ children }: { children: React.ReactNode }) => children };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaInsetsContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
}));
jest.mock('@/hooks/useTheme', () => {
  const { getTokens } = require('@/theme/tokens');
  return { useTokens: () => getTokens('orange', 'light'), useTheme: jest.fn() };
});
jest.mock('@/store', () => ({ store: {}, persistor: {} }));
jest.mock('react-redux', () => ({ Provider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('redux-persist/integration/react', () => ({ PersistGate: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@tanstack/react-query', () => ({ QueryClientProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@gorhom/bottom-sheet', () => ({ BottomSheetModalProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/lib/queryClient', () => ({ queryClient: {} }));
jest.mock('@/config/sentryConfig', () => ({
  initializeSentry: jest.fn(), captureException: jest.fn(), captureMessage: jest.fn(), Sentry: { wrap: (c: unknown) => c },
}));
jest.mock('react-native-paper-dates', () => ({ en: {}, registerTranslation: jest.fn() }));
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn() }));
jest.mock('expo-navigation-bar', () => ({ setStyle: jest.fn() }));
jest.mock('@/components/OperatorServerSelection', () => ({ OperatorServerSelection: () => null }));
jest.mock('@/components/ConfigErrorScreen', () => () => null);
jest.mock('@/components/ErrorBoundary', () => ({ ErrorBoundary: ({ children }: { children: React.ReactNode }) => children }));

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
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(NavigationStack, { screenBackground: '#fff' }));
    });
    const stacks = tree.root.findAll((node) => (node.type as unknown) === 'Stack');
    expect(stacks).toHaveLength(1);
    const names = stacks[0].findAll((node) => (node.type as unknown) === 'StackScreen').map((node) => node.props.name as string);
    // One screen per report, named by its id, once each: a report removed from the stack fails here.
    expect(names.filter((name) => name.startsWith('reports/'))).toEqual(REPORTS.map((report) => `reports/${report.id}`));
    // The other screens are still declared beside them.
    expect(names).toEqual(expect.arrayContaining(['(tabs)', 'login', 'settings']));
    act(() => tree.unmount());
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
