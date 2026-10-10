import { setLanguage, t } from '..';

afterEach(() => setLanguage('en'));

describe('navigation in Gujarati', () => {
  it('names the five bottom tabs as the owner chose', () => {
    const tabs = ['orders', 'grn', 'dispatch', 'invoices', 'reports'] as const;
    expect(tabs.map(tab => t(`nav.tabs.${tab}`))).toEqual(['Orders', 'GRN', 'Dispatch', 'Invoices', 'Reports']);
    expect(tabs.map(tab => t(`nav.tabs.${tab}`, undefined, 'gu'))).toEqual(['ઑર્ડર', 'આવક', 'જાવક', 'બિલ', 'અહેવાલ']);
  });

  it('follows a language switch at run time', () => {
    expect(t('nav.screens.signIn')).toBe('Sign in');
    setLanguage('gu');
    expect(t('nav.screens.signIn')).toBe('સાઇન ઇન કરો');
    expect(t('nav.screens.enterCode')).toBe('OTP લખો');
    expect(t('nav.ordersView.queue')).toBe('કતાર');
  });

  it('reads a report card as its title, then its description', () => {
    setLanguage('gu');
    expect(t('nav.reports.cardLabel', { title: t('reports.titles.stockSummary'), description: t('nav.reports.descriptions.stockSummary') })).toBe(
      'સ્ટોકનો સારાંશ. હાલનો સ્ટોક એક નજરે જુઓ'
    );
  });
});
