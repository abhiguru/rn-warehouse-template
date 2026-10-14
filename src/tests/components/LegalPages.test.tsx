/**
 * G-01, G-12: the Terms of service and Privacy policy pages never print a template
 * placeholder, never promise features the app does not have (booking system,
 * fingerprint login) and say that each cold storage keeps its records on its own
 * server.
 */
import React from 'react';
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
