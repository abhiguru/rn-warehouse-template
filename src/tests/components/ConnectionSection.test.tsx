/**
 * Help, "Connection" (WS-L): the path in use, the warehouse network address and how it is typed and
 * kept, "Check now" in each of its outcomes, and the last check.
 */
import React from 'react';
import { Text, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setLanguage } from '@/i18n';
import { ConnectionSection, LAN_ADDRESS_EXAMPLE, checkResultText } from '@/features/connection/ConnectionSection';
import { clearOperatorServer, getActiveOperatorServer, saveOperatorServer } from '@/config/operatorServer';
import { resetLanTransport, transportFetch } from '@/config/lanTransport';
import { checkLanNow } from '@/config/lanCheck';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));

const PUBLIC = 'https://north-cold.example.test';
const LAN = 'http://192.168.1.20:8080';
const facility = { origin: PUBLIC, instanceId: 'instance-north', displayName: 'North', companyName: 'North Cold Store' };
const originalFetch = global.fetch;

type Net = { public: boolean; lan: 'up' | 'down' | 'refused' | 'other' | 'wrong-instance' | 'hang' };
const net: Net = { public: true, lan: 'up' };
let clock = 0;
const answer = (status: number, path: 'lan' | 'public' | null, body: unknown = 'Hello') =>
  ({
    ok: status < 400,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'x-warehouse-path' ? path : null) },
    json: async () => body,
    clone: () => answer(status, path, body),
    body: null,
  }) as unknown as Response;
const route = async (input: RequestInfo | URL): Promise<Response> => {
  const url = String(input);
  if (url.startsWith(PUBLIC)) {
    if (!net.public) throw new TypeError('Network request failed');
    return answer(200, 'public');
  }
  if (net.lan === 'down') throw new TypeError('Network request failed');
  if (net.lan === 'hang') return new Promise<Response>(() => {});
  if (net.lan === 'refused') return answer(403, 'lan', '<html>');
  if (net.lan === 'other') return answer(200, null);
  if (url.endsWith('/hello')) {
    clock += 12;
    jest.setSystemTime(new Date(Date.UTC(2026, 9, 26, 10, 0, 0) + clock));
    return answer(200, 'lan');
  }
  if (url.endsWith('/get-public-config'))
    return answer(200, 'lan', { success: true, data: { instanceId: net.lan === 'wrong-instance' ? 'instance-other' : 'instance-north' } });
  return answer(200, 'lan', { ok: true });
};

let tree: ReactTestRenderer | undefined;
const texts = () => tree!.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
const shown = (text: string) => texts().includes(text);
const button = (label: string) =>
  tree!.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const press = async (label: string) => {
  await act(async () => { await button(label).props.onPress(); });
};
const typeAddress = async (value: string) => {
  await act(async () => { tree!.root.findByType(TextInput).props.onChangeText(value); });
};
async function mount() {
  await act(async () => { tree = create(<ConnectionSection />); });
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(Date.UTC(2026, 9, 26, 10, 0, 0)));
  clock = 0;
  net.public = true;
  net.lan = 'up';
  setLanguage('en');
  await AsyncStorage.clear();
  resetLanTransport();
  await clearOperatorServer();
  await saveOperatorServer({ ...facility, lan: LAN }, false);
  global.fetch = jest.fn(route) as unknown as typeof fetch;
});
afterEach(async () => {
  if (tree) await act(async () => { tree!.unmount(); });
  tree = undefined;
  jest.useRealTimers();
  global.fetch = originalFetch;
  resetLanTransport();
  setLanguage('en');
});

describe('connected via', () => {
  it('says Internet while the public address is in use, with what the fallback is for', async () => {
    await mount();
    expect(shown('Connected via')).toBe(true);
    expect(shown('Internet')).toBe(true);
    expect(shown('Warehouse network')).toBe(false);
    expect(shown('The phone uses the warehouse network only while the internet is not working, and goes back to the internet when it works again.')).toBe(true);
  });

  it('says Warehouse network once the phone has moved there', async () => {
    await mount();
    net.public = false;
    await act(async () => { await transportFetch(`${PUBLIC}/rest/v1/items`, undefined, { read: true }); });
    expect(shown('Warehouse network')).toBe(true);
    expect(shown('Internet')).toBe(false);
  });

  it('names the old configuration when the warehouse network answered with old keys', async () => {
    await mount();
    expect(texts().some(text => text.includes('old configuration'))).toBe(false);
    net.public = false;
    await act(async () => { await transportFetch(`${PUBLIC}/rest/v1/items`, undefined, { read: true }); });
    global.fetch = jest.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith(LAN) && String(input).includes('/rest/')
        ? answer(401, 'lan', { message: 'Unauthorized' })
        : route(input)
    ) as unknown as typeof fetch;
    await act(async () => { await transportFetch(`${PUBLIC}/rest/v1/items`, undefined, { read: true }).catch(() => undefined); });
    expect(shown('The warehouse network answered with an old configuration. Ask whoever runs your server to restart it.')).toBe(true);
  });
});

describe('the address', () => {
  it("shows the server's address and says where it comes from", async () => {
    await mount();
    expect(shown('Warehouse network address')).toBe(true);
    expect(shown(LAN)).toBe(true);
    expect(shown('From your server')).toBe(true);
  });

  it('says Not set when the server offers none, and the check cannot be asked', async () => {
    await saveOperatorServer({ ...facility }, false);
    await clearOperatorServer();
    await saveOperatorServer(facility, false);
    await mount();
    expect(shown('Not set')).toBe(true);
    expect(button('Check now').props.disabled).toBe(true);
  });

  it('validates a typed address on Save, keeps it, and says it was typed', async () => {
    await mount();
    await press('Change address');
    expect(tree!.root.findByType(TextInput).props.value).toBe(LAN);
    expect(tree!.root.findByType(TextInput).props.placeholder).toBe(LAN_ADDRESS_EXAMPLE);
    await typeAddress('http://8.8.8.8:8080');
    await press('Save address');
    expect(shown('Enter an address like http://192.168.1.20:8080: a private address, with a port number.')).toBe(true);
    expect(getActiveOperatorServer()?.lanTyped).toBeUndefined();
    // Typing again takes the message away.
    await typeAddress('http://192.168.1.99:8080');
    expect(shown('Enter an address like http://192.168.1.20:8080: a private address, with a port number.')).toBe(false);
    await press('Save address');
    expect(getActiveOperatorServer()?.lanTyped?.address).toBe('http://192.168.1.99:8080');
    expect(shown('http://192.168.1.99:8080')).toBe(true);
    expect(shown('Typed by you')).toBe(true);
    expect(tree!.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it("goes back to the server's address with 'Use your server's address'", async () => {
    await mount();
    await press('Change address');
    await typeAddress('http://192.168.1.99:8080');
    await press('Save address');
    expect(shown('Typed by you')).toBe(true);
    await press("Use your server's address");
    expect(shown('From your server')).toBe(true);
    expect(shown(LAN)).toBe(true);
    expect(getActiveOperatorServer()?.lanTyped).toBeUndefined();
  });

  it('Cancel leaves the address as it was', async () => {
    await mount();
    await press('Change address');
    await typeAddress('http://192.168.1.99:8080');
    await press('Cancel');
    expect(shown(LAN)).toBe(true);
    expect(getActiveOperatorServer()?.lanTyped).toBeUndefined();
  });
});

describe('Check now', () => {
  it('shows it is checking while the question is out, and gives up after the probe time', async () => {
    net.lan = 'hang';
    await mount();
    let pending!: Promise<void>;
    await act(async () => { pending = press('Check now'); });
    expect(button('Checking…')?.props.disabled).toBe(true);
    expect(button('Check now')).toBeUndefined();
    await act(async () => { await jest.advanceTimersByTimeAsync(3000); });
    await pending;
    expect(shown('Not reachable')).toBe(true);
    expect(button('Check now')?.props.disabled).toBe(false);
  });

  it('reachable: shows the time hello took', async () => {
    await mount();
    await press('Check now');
    expect(shown('Reachable (answered in 12 ms)')).toBe(true);
  });

  it.each([
    ['down', 'Not reachable'],
    ['refused', "Not reachable: your server does not accept this phone's Wi-Fi address"],
    ['other', 'Not reachable: another device answered at this address'],
    ['wrong-instance', 'Not reachable: another device answered at this address'],
  ] as const)('LAN %s: %s', async (state, expected) => {
    net.lan = state;
    await mount();
    await press('Check now');
    expect(shown(expected)).toBe(true);
    expect(shown('Reachable (answered in 12 ms)')).toBe(false);
  });

  it('keeps the last check and shows it when the section is opened again', async () => {
    await mount();
    expect(shown('Not checked yet')).toBe(true);
    await press('Check now');
    expect(texts().some(text => /^Last checked .+: Reachable \(answered in 12 ms\)$/.test(text))).toBe(true);
    expect(shown('Not checked yet')).toBe(false);
    await act(async () => { tree!.unmount(); });
    await mount();
    expect(texts().some(text => /^Last checked .+: Reachable \(answered in 12 ms\)$/.test(text))).toBe(true);
  });

  it('shows an earlier check by its own sentence: a day-old failure is still a failure', async () => {
    net.lan = 'down';
    await act(async () => { await checkLanNow('daily'); });
    await mount();
    expect(texts().some(text => /^Last checked .+: Not reachable$/.test(text))).toBe(true);
  });

  it('does not show a check of another address', async () => {
    await act(async () => { await checkLanNow('manual'); });
    await saveOperatorServer({ ...facility, lan: 'http://192.168.1.77:8080' }, false);
    await mount();
    expect(shown('Not checked yet')).toBe(true);
  });

  it('says once a day on Wi-Fi', async () => {
    await mount();
    expect(shown('The phone checks this address once a day while it is on Wi-Fi and the internet works.')).toBe(true);
  });
});

describe('in Gujarati', () => {
  it('words the section in Gujarati, with Gujarati digits for the time and the address as typed', async () => {
    setLanguage('gu');
    await mount();
    expect(shown('કનેક્શન'.toUpperCase()) || shown('કનેક્શન')).toBe(true);
    expect(shown(LAN)).toBe(true);
    await press('હમણાં તપાસો');
    expect(shown('પહોંચી શકાય છે (૧૨ મિલિસેકન્ડમાં જવાબ મળ્યો)')).toBe(true);
  });
});

describe('checkResultText', () => {
  it('has a sentence for every outcome', () => {
    expect(checkResultText({ outcome: 'not-set' })).toBe('No address to check');
    expect(checkResultText({ at: 1, address: LAN, outcome: 'reachable', ms: 0, trigger: 'manual' })).toBe('Reachable (answered in 1 ms)');
    expect(checkResultText({ at: 1, address: LAN, outcome: 'unreachable', trigger: 'daily' })).toBe('Not reachable');
  });
});
