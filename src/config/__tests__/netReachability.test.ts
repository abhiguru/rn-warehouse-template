import NetInfo from '@react-native-community/netinfo';
import { getActiveOperatorServer, onOperatorServerChange } from '../operatorServer';
import { noteNetworkState, notePublicUnreachable } from '../lanTransport';
import { getNetInfoGeneration } from '../netInfoGeneration';
import {
  applyNetReachability,
  installNetReachability,
  networkOf,
  reachabilityConfiguration,
  resetNetReachability,
} from '../netReachability';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { configure: jest.fn(), addEventListener: jest.fn(), fetch: jest.fn() },
}));
jest.mock('../operatorServer', () => ({
  getActiveOperatorServer: jest.fn(),
  onOperatorServerChange: jest.fn(),
}));
jest.mock('../lanTransport', () => ({
  ...jest.requireActual('../lanTransport'),
  notePublicUnreachable: jest.fn(),
  noteNetworkState: jest.fn(),
}));

const A = 'https://warehouse-a.example.test';
const B = 'https://warehouse-b.example.test';
let serverListener: () => void;
const stopServer = jest.fn();
const stopNetInfo = jest.fn();
let netInfoListener: (state: unknown) => void;

const select = (origin: string | null) => {
  jest.mocked(getActiveOperatorServer).mockReturnValue(origin ? ({ origin } as never) : null);
};
const configured = () => jest.mocked(NetInfo.configure).mock.calls.map(call => call[0]);

beforeEach(() => {
  resetNetReachability();
  jest.clearAllMocks();
  select(null);
  jest.mocked(onOperatorServerChange).mockImplementation(listener => {
    serverListener = listener;
    return stopServer;
  });
  jest.mocked(NetInfo.addEventListener).mockImplementation(listener => {
    netInfoListener = listener as (state: unknown) => void;
    return stopNetInfo;
  });
});
afterAll(() => resetNetReachability());

describe('the probe NetInfo uses', () => {
  const answer = (status: number, gatewayHeader: 'public' | null) => ({
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'x-warehouse-path' ? gatewayHeader : null) },
  });

  it("is the facility's hello: GET, and the platform's own answer ignored", () => {
    const config = reachabilityConfiguration(A);
    expect(config).toMatchObject({ reachabilityUrl: `${A}/functions/v1/hello`, reachabilityMethod: 'GET', useNativeReachability: false });
  });

  it('counts the facility answering as reachable: a 200, a 429 and any answer that carries the gateway header', async () => {
    const test = reachabilityConfiguration(A).reachabilityTest as (response: unknown) => Promise<boolean>;
    expect(await test(answer(200, null))).toBe(true);
    expect(await test(answer(200, 'public'))).toBe(true);
    // Every phone behind the facility's address shares the functions limit: a busy bucket is not a lost internet.
    expect(await test(answer(429, 'public'))).toBe(true);
    expect(await test(answer(429, null))).toBe(true);
    for (const status of [500, 502, 503, 504]) expect(await test(answer(status, 'public'))).toBe(true);
  });

  it('counts the tunnel or nothing answering as unreachable: a 530, a 5xx without the gateway header, any other answer without it', async () => {
    const test = reachabilityConfiguration(A).reachabilityTest as (response: unknown) => Promise<boolean>;
    for (const status of [502, 503, 520, 530]) expect(await test(answer(status, null))).toBe(false);
    for (const status of [204, 301, 401, 403, 404]) expect(await test(answer(status, null))).toBe(false);
  });
});

describe('installNetReachability (bootstrapApp)', () => {
  it('points NetInfo at the selected facility', () => {
    select(A);
    installNetReachability();
    expect(configured()).toEqual([expect.objectContaining({ reachabilityUrl: `${A}/functions/v1/hello`, useNativeReachability: false })]);
    expect(onOperatorServerChange).toHaveBeenCalledTimes(1);
  });

  it('leaves NetInfo on its defaults while no facility is selected', () => {
    installNetReachability();
    expect(NetInfo.configure).not.toHaveBeenCalled();
    expect(onOperatorServerChange).toHaveBeenCalledTimes(1);
  });

  it('can be called on every bootstrap: one server listener, and NetInfo is configured again only when the URL changes', () => {
    select(A);
    installNetReachability();
    installNetReachability();
    applyNetReachability();
    expect(onOperatorServerChange).toHaveBeenCalledTimes(1);
    expect(NetInfo.configure).toHaveBeenCalledTimes(1);
  });
});

describe('when the selected server changes', () => {
  it('is applied again for the new facility', () => {
    select(A);
    installNetReachability();
    select(B);
    serverListener();
    expect(configured().map(config => config?.reachabilityUrl)).toEqual([`${A}/functions/v1/hello`, `${B}/functions/v1/hello`]);
  });

  it('is reset to the defaults when the server is cleared', () => {
    select(A);
    installNetReachability();
    select(null);
    serverListener();
    expect(configured()[1]).toEqual({});
  });

  it('is not configured again for the same facility (configure stops every listener)', () => {
    select(A);
    installNetReachability();
    serverListener();
    serverListener();
    expect(NetInfo.configure).toHaveBeenCalledTimes(1);
  });

  it('tells the hooks to listen again, once per configuration', () => {
    const before = getNetInfoGeneration();
    select(A);
    installNetReachability();
    expect(getNetInfoGeneration()).toBe(before + 1);
    select(B);
    serverListener();
    expect(getNetInfoGeneration()).toBe(before + 2);
    serverListener();
    expect(getNetInfoGeneration()).toBe(before + 2);
  });

  it('keeps working when NetInfo cannot be configured', () => {
    jest.mocked(NetInfo.configure).mockImplementationOnce(() => {
      throw new Error('no native module');
    });
    select(A);
    expect(() => installNetReachability()).not.toThrow();
  });
});

describe('the transport is told as soon as NetInfo finds the internet unreachable', () => {
  beforeEach(() => {
    select(A);
    installNetReachability();
  });

  it('on a connection whose probe failed', () => {
    netInfoListener({ isConnected: true, isInternetReachable: false });
    expect(notePublicUnreachable).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no connection at all', { isConnected: false, isInternetReachable: false }],
    ['a probe still running', { isConnected: true, isInternetReachable: null }],
    ['a working connection', { isConnected: true, isInternetReachable: true }],
  ])('not on %s', (_name, state) => {
    netInfoListener(state);
    expect(notePublicUnreachable).not.toHaveBeenCalled();
  });

  it('listens again after NetInfo was configured again, and stops the old listener', () => {
    select(B);
    serverListener();
    expect(stopNetInfo).toHaveBeenCalledTimes(1);
    expect(NetInfo.addEventListener).toHaveBeenCalledTimes(2);
  });
});

describe('the transport is told the phone\'s network on every NetInfo event', () => {
  beforeEach(() => {
    select(A);
    installNetReachability();
  });

  it('Wi-Fi: type, address and subnet; before the unreachable check', () => {
    const order: string[] = [];
    jest.mocked(noteNetworkState).mockImplementation(() => void order.push('network'));
    jest.mocked(notePublicUnreachable).mockImplementation(() => void order.push('unreachable'));
    netInfoListener({
      type: 'wifi',
      isConnected: true,
      isInternetReachable: false,
      details: { ipAddress: '192.168.1.50', subnet: '255.255.255.0', ssid: 'warehouse' },
    });
    expect(noteNetworkState).toHaveBeenCalledWith({
      connected: true,
      type: 'wifi',
      ipAddress: '192.168.1.50',
      subnet: '255.255.255.0',
    });
    expect(order).toEqual(['network', 'unreachable']);
  });

  it('every event, whatever the reachability', () => {
    netInfoListener({ type: 'cellular', isConnected: true, isInternetReachable: true, details: { carrier: 'x' } });
    netInfoListener({ type: 'none', isConnected: false, isInternetReachable: false, details: null });
    expect(noteNetworkState).toHaveBeenCalledTimes(2);
  });

  it('networkOf reads no address from a network that has none, and tolerates what NetInfo leaves out', () => {
    expect(networkOf({ type: 'cellular', isConnected: true, isInternetReachable: true, details: { carrier: 'x', cellularGeneration: '4g' } } as never)).toEqual({
      connected: true,
      type: 'cellular',
      ipAddress: null,
      subnet: null,
    });
    expect(networkOf({ type: 'unknown', isConnected: null, isInternetReachable: null, details: null } as never)).toEqual({
      connected: null,
      type: 'unknown',
      ipAddress: null,
      subnet: null,
    });
    expect(networkOf({ type: 'wifi', isConnected: true, isInternetReachable: true, details: { ipAddress: null, subnet: 5 } } as never).ipAddress).toBeNull();
  });
});
