/**
 * Help, "Connection" (WS-L): the path in use, the warehouse network address and how it is typed and
 * kept, "Check now" in each of its outcomes, and the last check.
 */
import React from 'react';
import { Platform, Text, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setLanguage } from '@/i18n';
import { ConnectionSection, LAN_ADDRESS_EXAMPLE, checkPresentation } from '@/features/connection/ConnectionSection';
import { clearOperatorServer, getActiveOperatorServer, saveOperatorServer } from '@/config/operatorServer';
import { noteNetworkState, resetLanTransport, transportFetch } from '@/config/lanTransport';
import { HOME_WIFI, WIFI_UNKNOWN_SUBNET, onWarehouseWifi } from '@/tests/helpers/lanNetwork';
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
const originalPlatform = Platform.OS;

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
  onWarehouseWifi();
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
  Platform.OS = originalPlatform;
});

describe('connected via', () => {
  it('says Internet while the public address is in use, with what the fallback is for', async () => {
    await mount();
    expect(shown('Connected via')).toBe(true);
    expect(shown('Internet')).toBe(true);
    expect(shown('Warehouse network')).toBe(false);
    expect(shown('The phone uses the warehouse network only while the internet is not working, and goes back to the internet when it works again.')).toBe(true);
  });

  it('draws the path as a status tag (neutral on the internet) and reads the label with its value as one element', async () => {
    await mount();
    const tags = tree!.root.findAll(node => node.props.accessibilityLabel === 'Internet' && node.props.accessible === true);
    expect(tags.length).toBeGreaterThan(0);
    expect(
      tree!.root.findAll(
        node =>
          node.props.accessible === true &&
          node.props.accessibilityLabel ===
            'Connected via, Internet. The phone uses the warehouse network only while the internet is not working, and goes back to the internet when it works again.'
      ).length
    ).toBeGreaterThan(0);
  });

  it('says Warehouse network once the phone has moved there', async () => {
    await mount();
    net.public = false;
    await act(async () => { await transportFetch(`${PUBLIC}/rest/v1/items`, undefined, { read: true }); });
    expect(shown('Warehouse network')).toBe(true);
    expect(shown('Internet')).toBe(false);
    expect(
      tree!.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Connected via, Warehouse network.')).length
    ).toBeGreaterThan(0);
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
    const warning = "The warehouse network answered with an old configuration. Ask whoever runs your server to run the server's start step again.";
    expect(shown(warning)).toBe(true);
    // The problem carries the negative icon next to its words (style guide 3.5), not colour alone.
    const row = tree!.root.findAll(node => node.props.accessibilityLabel === warning && node.props.accessible === true)[0];
    expect(row.findAllByType('Icon' as never).map(icon => icon.props.name)).toEqual(['alert-circle']);
  });
});

describe('the address', () => {
  it("shows the server's address and says where it comes from", async () => {
    await mount();
    expect(shown('Warehouse network address')).toBe(true);
    expect(shown(LAN)).toBe(true);
    expect(shown('From your server')).toBe(true);
    // The label, the value and where it comes from read as one element.
    expect(
      tree!.root.findAll(node => node.props.accessible === true && node.props.accessibilityLabel === `Warehouse network address, ${LAN}. From your server`).length
    ).toBeGreaterThan(0);
  });

  it('says Not set when the server offers none: the check cannot be asked and no address can be typed', async () => {
    await clearOperatorServer();
    await saveOperatorServer(facility, false);
    await mount();
    expect(shown('Not set')).toBe(true);
    expect(shown('Your server does not offer a warehouse network address, so this phone uses only the internet.')).toBe(true);
    expect(button('Check now').props.disabled).toBe(true);
    expect(button('Change address')).toBeUndefined();
  });

  it('offers Change address only while the server offers an address (a typed one is dropped when the server stops)', async () => {
    await mount();
    expect(button('Change address')).toBeDefined();
    await press('Change address');
    await typeAddress('http://192.168.1.99:8080');
    await press('Save address');
    expect(shown('Typed by you')).toBe(true);
    const { recordServerLanAddress } = require('@/config/operatorServer');
    await act(async () => { await recordServerLanAddress(PUBLIC, undefined); });
    await act(async () => { tree!.unmount(); });
    await mount();
    expect(shown('Typed by you')).toBe(false);
    expect(shown('Not set')).toBe(true);
    expect(button('Change address')).toBeUndefined();
    expect(button("Use your server's address")).toBeUndefined();
  });

  it('validates a typed address on Save, keeps it, and says it was typed', async () => {
    await mount();
    await press('Change address');
    expect(tree!.root.findByType(TextInput).props.value).toBe(LAN);
    expect(tree!.root.findByType(TextInput).props.placeholder).toBe(LAN_ADDRESS_EXAMPLE);
    const invalid = "Change only the last number of your server's address, http://192.168.1.20:8080. Example: http://192.168.1.20:8080.";
    await typeAddress('http://8.8.8.8:8080');
    await press('Save address');
    expect(shown(invalid)).toBe(true);
    expect(getActiveOperatorServer()?.lanTyped).toBeUndefined();
    // Another subnet of the same private range is not a change of the host part either.
    await typeAddress('http://192.168.2.99:8080');
    await press('Save address');
    expect(shown(invalid)).toBe(true);
    expect(getActiveOperatorServer()?.lanTyped).toBeUndefined();
    // Typing again takes the message away.
    await typeAddress('http://192.168.1.99:8080');
    expect(shown(invalid)).toBe(false);
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

  const tag = (word: string) =>
    tree!.root.findAll(node => node.props.accessible === true && node.props.accessibilityLabel === word && typeof node.type !== 'string');

  it('reachable: the word Reachable on a positive tag, and no developer text such as milliseconds', async () => {
    await mount();
    await press('Check now');
    expect(shown('Reachable')).toBe(true);
    expect(texts().some(text => /\bms\b|millisecond/i.test(text))).toBe(false);
    expect(tag('Reachable').length).toBeGreaterThan(0);
  });

  it.each([
    ['down', 'Nothing answered at this address. Check the address, and that this phone is on the warehouse Wi-Fi.'],
    ['refused', "Your server does not accept this phone's Wi-Fi address."],
    ['other', 'Another device answered at this address.'],
    ['wrong-instance', 'Another device answered at this address.'],
  ] as const)('LAN %s: Not reachable, and why', async (state, detail) => {
    Platform.OS = 'android';
    net.lan = state;
    await mount();
    await press('Check now');
    expect(shown('Not reachable')).toBe(true);
    expect(shown(detail)).toBe(true);
    expect(shown('Reachable')).toBe(false);
    // The word and its reason are announced together.
    expect(tree!.root.findAll(node => node.props.accessibilityLabel === `Not reachable. ${detail}`).length).toBeGreaterThan(0);
  });

  it('on iPhone an address nobody answers also says where to allow the Local Network', async () => {
    Platform.OS = 'ios';
    net.lan = 'down';
    await mount();
    await press('Check now');
    expect(texts().some(text => text.includes('On iPhone, also open Settings, Privacy & Security, Local Network, and allow this app.'))).toBe(true);
    await act(async () => { tree!.unmount(); });
    Platform.OS = 'android';
    await mount();
    await press('Check now');
    expect(texts().some(text => text.includes('On iPhone'))).toBe(false);
  });

  it('on a network that cannot hold the address it says so, asks nothing and keeps nothing', async () => {
    noteNetworkState(HOME_WIFI);
    await mount();
    await press('Check now');
    expect(shown('Not on the warehouse Wi-Fi')).toBe(true);
    expect(shown('Connect this phone to the warehouse Wi-Fi, then check again.')).toBe(true);
    expect(shown('Not reachable')).toBe(false);
    expect(jest.mocked(global.fetch)).not.toHaveBeenCalled();
    expect(shown('Not checked yet')).toBe(true);
  });

  it('on a Wi-Fi whose address the phone could not read it says so instead of sending the person to another Wi-Fi', async () => {
    noteNetworkState(WIFI_UNKNOWN_SUBNET);
    await mount();
    await press('Check now');
    expect(shown('Wi-Fi address not known')).toBe(true);
    expect(shown('This phone could not read its own Wi-Fi address, so it does not use the warehouse network. Try again in a moment.')).toBe(true);
    expect(shown('Connect this phone to the warehouse Wi-Fi, then check again.')).toBe(false);
    expect(jest.mocked(global.fetch)).not.toHaveBeenCalled();
  });

  it('keeps the last check and shows it when the section is opened again', async () => {
    await mount();
    expect(shown('Not checked yet')).toBe(true);
    await press('Check now');
    expect(texts().some(text => /^Last checked .+: Reachable$/.test(text))).toBe(true);
    expect(shown('Not checked yet')).toBe(false);
    await act(async () => { tree!.unmount(); });
    await mount();
    expect(texts().some(text => /^Last checked .+: Reachable$/.test(text))).toBe(true);
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

  it('says when the phone checks by itself', async () => {
    await mount();
    expect(
      shown('The phone checks this address once a day while it is on the warehouse Wi-Fi and the internet works, and again every hour until it is reachable.')
    ).toBe(true);
  });
});

describe('in Gujarati', () => {
  it('words the section and the check in Gujarati, with the address as typed', async () => {
    setLanguage('gu');
    await mount();
    expect(shown('કનેક્શન'.toUpperCase()) || shown('કનેક્શન')).toBe(true);
    expect(shown(LAN)).toBe(true);
    await press('હમણાં તપાસો');
    expect(shown('પહોંચી શકાય છે')).toBe(true);
  });
});

describe('checkPresentation', () => {
  it('has a status and words for every outcome', () => {
    expect(checkPresentation({ outcome: 'not-set' })).toEqual({ status: null, word: 'No address to check', detail: null });
    expect(checkPresentation({ at: 1, address: LAN, outcome: 'reachable', ms: 0, trigger: 'manual' })).toEqual({
      status: 'positive',
      word: 'Reachable',
      detail: null,
    });
    expect(checkPresentation({ outcome: 'other-network' })).toMatchObject({ status: 'neutral', word: 'Not on the warehouse Wi-Fi' });
    expect(checkPresentation({ outcome: 'network-unknown' })).toMatchObject({ status: 'neutral', word: 'Wi-Fi address not known' });
    for (const outcome of ['unreachable', 'refused', 'wrong-server'] as const)
      expect(checkPresentation({ at: 1, address: LAN, outcome, trigger: 'daily' })).toMatchObject({ status: 'negative', word: 'Not reachable' });
  });
});
