/**
 * Help, "Connection" (WS-L): the path in use, the warehouse network address and how it is typed and
 * kept, "Check now" in each of its outcomes, and the last check.
 */
import React from 'react';
import { Platform } from 'react-native';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setLanguage } from '@/i18n';
import { ConnectionSection, LAN_ADDRESS_EXAMPLE, checkPresentation } from '@/features/connection/ConnectionSection';
import { clearOperatorServer, getActiveOperatorServer, saveOperatorServer } from '@/config/operatorServer';
import { noteNetworkState, resetLanTransport, transportFetch } from '@/config/lanTransport';
import { HOME_WIFI, WIFI_UNKNOWN_SUBNET, onWarehouseWifi } from '@/tests/helpers/lanNetwork';
import { checkLanNow } from '@/config/lanCheck';
import { installLanKey, removeLanKey, signingLan } from '@/tests/helpers/lanSigning';

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
const route = async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
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

type Node = NonNullable<typeof screen.root>;
const user = () => userEvent.setup({ delay: 0, advanceTimers: jest.advanceTimersByTime });
/** A text is on the screen (once or more). */
const expectShown = (text: string | RegExp) => {
  expect(screen.getAllByText(text)[0]).toBeOnTheScreen();
};
const expectNotShown = (text: string | RegExp) => {
  expect(screen.queryAllByText(text)).toHaveLength(0);
};
/** The element that carries the whole label and is one element for the screen reader. */
const readAs = (label: string | RegExp) => screen.queryAllByLabelText(label).filter(node => node.props.accessible === true);
const button = (label: string) => screen.getByRole('button', { name: label });
const noButton = (label: string) => expect(screen.queryByRole('button', { name: label })).not.toBeOnTheScreen();
const press = async (label: string) => {
  await user().press(button(label));
};
const addressField = () => screen.getByPlaceholderText(LAN_ADDRESS_EXAMPLE);
const typeAddress = async (value: string) => {
  const u = user();
  await u.clear(addressField());
  await u.paste(addressField(), value);
};
// The warning's negative icon is a bare mocked host element with no role or text, so it is found by walking the row.
function iconNames(from: Node): unknown[] {
  const names: unknown[] = [];
  const walk = (node: Node) => {
    if (node.type === ('Icon' as unknown)) names.push(node.props.name);
    for (const child of node.children) if (typeof child !== 'string') walk(child as Node);
  };
  walk(from);
  return names;
}
async function mount() {
  await render(<ConnectionSection />);
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
  // The listener signs its answers and the session holds the warehouse network key (WH-133).
  global.fetch = jest.fn(signingLan(route, LAN)) as unknown as typeof fetch;
  await installLanKey(PUBLIC, 'instance-north');
});
afterEach(() => {
  removeLanKey();
  jest.useRealTimers();
  global.fetch = originalFetch;
  resetLanTransport();
  setLanguage('en');
  Platform.OS = originalPlatform;
});

describe('connected via', () => {
  it('says Internet while the public address is in use, with what the fallback is for', async () => {
    await mount();
    expectShown('Connected via');
    expectShown('Internet');
    expectNotShown('Warehouse network');
    expectShown('The phone uses the warehouse network only while the internet is not working, and goes back to the internet when it works again.');
  });

  it('draws the path as a status tag (neutral on the internet) and reads the label with its value as one element', async () => {
    await mount();
    expect(readAs('Internet').length).toBeGreaterThan(0);
    expect(
      readAs('Connected via, Internet. The phone uses the warehouse network only while the internet is not working, and goes back to the internet when it works again.').length
    ).toBeGreaterThan(0);
  });

  it('says Warehouse network once the phone has moved there', async () => {
    await mount();
    net.public = false;
    await act(async () => { await transportFetch(`${PUBLIC}/rest/v1/items`, undefined, { read: true }); });
    expectShown('Warehouse network');
    expectNotShown('Internet');
    expect(screen.queryAllByLabelText(/^Connected via, Warehouse network\./).length).toBeGreaterThan(0);
  });

  it('names the old configuration when the warehouse network answered with old keys', async () => {
    await mount();
    expectNotShown(/old configuration/);
    net.public = false;
    await act(async () => { await transportFetch(`${PUBLIC}/rest/v1/items`, undefined, { read: true }); });
    global.fetch = jest.fn(
      signingLan(
        async (input: RequestInfo | URL) =>
          String(input).startsWith(LAN) && String(input).includes('/rest/')
            ? answer(401, 'lan', { message: 'Unauthorized' })
            : route(input),
        LAN
      )
    ) as unknown as typeof fetch;
    await act(async () => { await transportFetch(`${PUBLIC}/rest/v1/items`, undefined, { read: true }).catch(() => undefined); });
    const warning = "The warehouse network answered with an old configuration. Ask whoever runs your server to run the server's start step again.";
    expectShown(warning);
    // The problem carries the negative icon next to its words (style guide 3.5), not colour alone.
    const row = readAs(warning)[0];
    expect(iconNames(row)).toEqual(['alert-circle']);
  });
});

describe('the address', () => {
  it("shows the server's address and says where it comes from", async () => {
    await mount();
    expectShown('Warehouse network address');
    expectShown(LAN);
    expectShown('From your server');
    // The label, the value and where it comes from read as one element.
    expect(readAs(`Warehouse network address, ${LAN}. From your server`).length).toBeGreaterThan(0);
  });

  it('says Not set when the server offers none: the check cannot be asked and no address can be typed', async () => {
    await clearOperatorServer();
    await saveOperatorServer(facility, false);
    await mount();
    expectShown('Not set');
    expectShown('Your server does not offer a warehouse network address, so this phone uses only the internet.');
    expect(button('Check now')).toBeDisabled();
    noButton('Change address');
  });

  it('offers Change address only while the server offers an address (a typed one is dropped when the server stops)', async () => {
    await mount();
    expect(button('Change address')).toBeOnTheScreen();
    await press('Change address');
    await typeAddress('http://192.168.1.99:8080');
    await press('Save address');
    expectShown('Typed by you');
    const { recordServerLanAddress } = require('@/config/operatorServer');
    await act(async () => { await recordServerLanAddress(PUBLIC, undefined); });
    await screen.unmount();
    await mount();
    expectNotShown('Typed by you');
    expectShown('Not set');
    noButton('Change address');
    noButton("Use your server's address");
  });

  it('validates a typed address on Save, keeps it, and says it was typed', async () => {
    await mount();
    await press('Change address');
    expect(addressField()).toHaveDisplayValue(LAN);
    expect(addressField()).toHaveProp('placeholder', LAN_ADDRESS_EXAMPLE);
    const invalid = "Change only the last number of your server's address, http://192.168.1.20:8080. Example: http://192.168.1.20:8080.";
    await typeAddress('http://8.8.8.8:8080');
    await press('Save address');
    expectShown(invalid);
    expect(getActiveOperatorServer()?.lanTyped).toBeUndefined();
    // Another subnet of the same private range is not a change of the host part either.
    await typeAddress('http://192.168.2.99:8080');
    await press('Save address');
    expectShown(invalid);
    expect(getActiveOperatorServer()?.lanTyped).toBeUndefined();
    // Typing again takes the message away.
    await typeAddress('http://192.168.1.99:8080');
    expectNotShown(invalid);
    await press('Save address');
    expect(getActiveOperatorServer()?.lanTyped?.address).toBe('http://192.168.1.99:8080');
    expectShown('http://192.168.1.99:8080');
    expectShown('Typed by you');
    expect(screen.queryByPlaceholderText(LAN_ADDRESS_EXAMPLE)).not.toBeOnTheScreen();
  });

  it("goes back to the server's address with 'Use your server's address'", async () => {
    await mount();
    await press('Change address');
    await typeAddress('http://192.168.1.99:8080');
    await press('Save address');
    expectShown('Typed by you');
    await press("Use your server's address");
    expectShown('From your server');
    expectShown(LAN);
    expect(getActiveOperatorServer()?.lanTyped).toBeUndefined();
  });

  it('Cancel leaves the address as it was', async () => {
    await mount();
    await press('Change address');
    await typeAddress('http://192.168.1.99:8080');
    await press('Cancel');
    expectShown(LAN);
    expect(getActiveOperatorServer()?.lanTyped).toBeUndefined();
  });
});

describe('Check now', () => {
  it('shows it is checking while the question is out, and gives up after the probe time', async () => {
    net.lan = 'hang';
    await mount();
    await press('Check now');
    expect(button('Checking…')).toBeDisabled();
    noButton('Check now');
    await act(async () => { await jest.advanceTimersByTimeAsync(3000); });
    expectShown('Not reachable');
    expect(button('Check now')).toBeEnabled();
    expect(button('Check now').props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('reachable: the word Reachable on a positive tag, and no developer text such as milliseconds', async () => {
    await mount();
    await press('Check now');
    expectShown('Reachable');
    expectNotShown(/\bms\b|millisecond/i);
    expect(readAs('Reachable').length).toBeGreaterThan(0);
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
    expectShown('Not reachable');
    expectShown(detail);
    expectNotShown('Reachable');
    // The word and its reason are announced together.
    expect(screen.queryAllByLabelText(`Not reachable. ${detail}`).length).toBeGreaterThan(0);
  });

  it('on iPhone an address nobody answers also says where to allow the Local Network', async () => {
    Platform.OS = 'ios';
    net.lan = 'down';
    await mount();
    await press('Check now');
    expectShown(/On iPhone, also open Settings, Privacy & Security, Local Network, and allow this app\./);
    await screen.unmount();
    Platform.OS = 'android';
    await mount();
    await press('Check now');
    expectNotShown(/On iPhone/);
  });

  it('on a network that cannot hold the address it says so, asks nothing and keeps nothing', async () => {
    noteNetworkState(HOME_WIFI);
    await mount();
    await press('Check now');
    expectShown('Not on the warehouse Wi-Fi');
    expectShown('Connect this phone to the warehouse Wi-Fi, then check again.');
    expectNotShown('Not reachable');
    expect(jest.mocked(global.fetch)).not.toHaveBeenCalled();
    expectShown('Not checked yet');
  });

  it('on a Wi-Fi whose address the phone could not read it says so instead of sending the person to another Wi-Fi', async () => {
    noteNetworkState(WIFI_UNKNOWN_SUBNET);
    await mount();
    await press('Check now');
    expectShown('Wi-Fi address not known');
    expectShown('This phone could not read its own Wi-Fi address, so it does not use the warehouse network. Try again in a moment.');
    expectNotShown('Connect this phone to the warehouse Wi-Fi, then check again.');
    expect(jest.mocked(global.fetch)).not.toHaveBeenCalled();
  });

  it('keeps the last check and shows it when the section is opened again', async () => {
    await mount();
    expectShown('Not checked yet');
    await press('Check now');
    expectShown(/^Last checked .+: Reachable$/);
    expectNotShown('Not checked yet');
    await screen.unmount();
    await mount();
    expectShown(/^Last checked .+: Reachable$/);
  });

  it('shows an earlier check by its own sentence: a day-old failure is still a failure', async () => {
    net.lan = 'down';
    await act(async () => { await checkLanNow('daily'); });
    await mount();
    expectShown(/^Last checked .+: Not reachable$/);
  });

  it('does not show a check of another address', async () => {
    await act(async () => { await checkLanNow('manual'); });
    await saveOperatorServer({ ...facility, lan: 'http://192.168.1.77:8080' }, false);
    await mount();
    expectShown('Not checked yet');
  });

  it('says when the phone checks by itself', async () => {
    await mount();
    expectShown('The phone checks this address once a day while it is on the warehouse Wi-Fi and the internet works, and again every hour until it is reachable.');
  });
});

describe('in Gujarati', () => {
  it('words the section and the check in Gujarati, with the address as typed', async () => {
    setLanguage('gu');
    await mount();
    expect(screen.queryAllByText('કનેક્શન'.toUpperCase()).length + screen.queryAllByText('કનેક્શન').length).toBeGreaterThan(0);
    expectShown(LAN);
    await press('હમણાં તપાસો');
    expectShown('પહોંચી શકાય છે');
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
