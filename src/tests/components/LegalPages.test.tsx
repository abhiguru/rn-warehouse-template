/**
 * G-01, G-12: the Terms of service and Privacy policy pages never print a template
 * placeholder, never promise features the app does not have (booking system,
 * fingerprint login) and say that each cold storage keeps its records on its own
 * server.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
let mockServer: Record<string, string> | null = null;
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => mockServer }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ theme: { preference: 'light', brand: 'orange', language: 'en' } }),
}));

import TermsOfServiceScreen from '../../../app/terms-of-service';
import PrivacyPolicyScreen from '../../../app/privacy-policy';
import { LEGAL_UPDATED } from '@/constants/legal';

const PAGES: Array<[string, () => React.JSX.Element]> = [
  ['terms', () => <TermsOfServiceScreen />],
  ['privacy', () => <PrivacyPolicyScreen />],
];
const FORBIDDEN = [
  'Your Company Name',
  'example.com',
  'Booking System',
  'booking',
  'iometric',
  'Face ID',
  'December 2025',
  'secure cloud servers',
  'Cloud hosting',
];

let tree: ReactTestRenderer | undefined;
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  delete process.env.EXPO_PUBLIC_COMPANY_NAME;
  delete process.env.EXPO_PUBLIC_LEGAL_EMAIL;
});

async function pageText(render: () => React.JSX.Element): Promise<string> {
  await act(async () => {
    tree = create(render());
  });
  return tree!.root
    .findAllByType(Text)
    .map((node) => [node.props.children].flat(Infinity).join(''))
    .join('\n');
}

describe.each(PAGES)('%s page', (_name, render) => {
  it('names the connected cold storage and prints no placeholder or missing feature', async () => {
    mockServer = {
      companyName: 'Dev Cold Storage (fictional data)',
      displayName: 'Dev',
      origin: 'https://warehouse-dev.gurucold.in',
    };
    const text = await pageText(render);
    expect(text).toContain('Dev Cold Storage (fictional data)');
    expect(text).toContain(`Last updated: ${LEGAL_UPDATED}`);
    for (const word of FORBIDDEN) expect(text).not.toContain(word);
    expect(text).not.toContain('Email:');
  });

  it('says "the cold storage that runs your server" when no name is known', async () => {
    mockServer = null;
    const text = await pageText(render);
    expect(text).toContain('the cold storage that runs your server');
    for (const word of FORBIDDEN) expect(text).not.toContain(word);
    expect(text).not.toContain('Email:');
  });

  it('prints the contact address only when the build is given one', async () => {
    mockServer = null;
    process.env.EXPO_PUBLIC_LEGAL_EMAIL = 'office@cold.test';
    const text = await pageText(render);
    expect(text).toContain('Email: office@cold.test');
  });
});

describe('where the records are kept', () => {
  it('the privacy page says the records are on the cold storage\'s own server', async () => {
    mockServer = { companyName: 'Dev Cold Storage (fictional data)', displayName: 'Dev', origin: 'https://x.test' };
    const text = await pageText(() => <PrivacyPolicyScreen />);
    expect(text).toContain("Dev Cold Storage (fictional data)'s own server");
    expect(text).toContain('own server');
    expect(text).toContain('one-time code');
    expect(text).toContain('Gujarat Cold Storage Association');
  });
});

describe('CR-70: wording of the legal pages', () => {
  it('prints the cold storage name only inside sentences, never as a line of its own after one', async () => {
    mockServer = { companyName: 'Review North Cold Storage', displayName: 'North', origin: 'https://n.example.test' };
    for (const [, render] of PAGES) {
      const lines = (await pageText(render)).split('\n');
      expect(lines).not.toContain('Review North Cold Storage');
      act(() => tree?.unmount());
      tree = undefined;
    }
  });

  it('the Terms say "Terms of service", not "Terms and Conditions"', async () => {
    mockServer = null;
    const text = await pageText(PAGES[0][1]);
    expect(text).not.toMatch(/terms and conditions/i);
    expect(text).toContain('These Terms of service are an agreement');
  });

  it('the Privacy policy uses good English without a name and no crash-report bullet ends in a full stop', async () => {
    mockServer = null;
    const text = await pageText(PAGES[1][1]);
    expect(text).not.toContain('the own server');
    expect(text).toContain('the server of the cold storage you connected to');
    for (const line of text.split('\n').filter(l => l.startsWith('Crash reports'))) expect(line.endsWith('.')).toBe(false);
  });
});

// Review 2026-10-17, M09 (owner decision D22): crash reporting is switched on by the
// organisation that distributes the copy, not by the person; the page must say so, say
// what a report holds, and send a person who wants it off to that organisation.
describe('M09: crash reporting and Association sign-in wording', () => {
  const SECTION_1_BULLET =
    'Crash reports, if the organisation that distributes your copy of the App has switched them on: the App version, the phone model, your role, the text of the error and a short trail of what the App did just before it (such as requests made); phone numbers, codes and tokens are filtered out, but names and other words from your records may remain';
  const PROVIDER_BULLET =
    'Crash reports (Sentry/GlitchTip), only if the organisation that distributes your copy of the App switches them on: the app version, the phone model, your role, the error text and a short trail of recent activity, which may contain names from your records';
  const ASSOCIATION_SENTENCE =
    "Where your copy of the App uses the Association's sign-in, the Association's sign-in keeps your mobile number and, if you enter it, your name. A cold storage sees that name when you ask it for access.";
  const WITHDRAWAL_BULLET =
    'Withdraw consent: Ask the organisation that distributes your copy of the App to switch crash reports off; the App has no switch of its own';

  async function privacyLines(): Promise<string[]> {
    mockServer = null;
    return (await pageText(PAGES[1][1])).split('\n');
  }

  it('says who switches crash reporting on and what a report holds (section 1)', async () => {
    const lines = await privacyLines();
    expect(lines).toContain(SECTION_1_BULLET);
  });

  it('states the same in the service-provider list (section 3) and the third-party list (section 9)', async () => {
    const lines = await privacyLines();
    expect(lines.filter(line => line === PROVIDER_BULLET)).toHaveLength(2);
  });

  it('no longer promises that a report never holds your records', async () => {
    const text = (await privacyLines()).join('\n');
    expect(text).not.toContain('never your records');
    expect(text).not.toContain('If crash reporting is switched on in your copy');
  });

  it('says the Association keeps the mobile number and, if entered, the name, and that a cold storage sees the name', async () => {
    const lines = await privacyLines();
    expect(lines).toContain(ASSOCIATION_SENTENCE);
    expect(lines.join('\n')).not.toContain('keeps only your mobile number');
  });

  it('sends a person who wants crash reports off to the organisation, not to an in-app switch', async () => {
    const lines = await privacyLines();
    expect(lines).toContain(WITHDRAWAL_BULLET);
    expect(lines.join('\n')).not.toContain('Withdraw consent for optional data processing');
  });

  it('keeps no crash-report line ending in a full stop', async () => {
    const lines = await privacyLines();
    const crash = lines.filter(line => line.startsWith('Crash reports'));
    expect(crash).toHaveLength(3);
    for (const line of crash) expect(line.endsWith('.')).toBe(false);
  });
});

describe('M09: docs/TELEMETRY_AND_PRIVACY.md section 1 matches the screen', () => {
  const doc = fs.readFileSync(
    path.join(__dirname, '../../../docs/TELEMETRY_AND_PRIVACY.md'),
    'utf8'
  );

  it('describes operator consent and no longer calls reporting strictly opt-in', () => {
    expect(doc).toContain('## 1. Consent Model: Operator-Controlled Reporting');
    expect(doc).not.toMatch(/strictly opt-in/i);
    expect(doc).not.toContain('## 1. Opt-In Configuration and Activation');
  });

  it('says what leaves the phone and what never does', () => {
    expect(doc).toMatch(/role/);
    expect(doc).toMatch(/never sent/i);
    expect(doc).toContain('request body');
  });
});
