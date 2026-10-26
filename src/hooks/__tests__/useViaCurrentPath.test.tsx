/**
 * A photo already on screen follows the phone onto the warehouse network and back (WS-L review L6): the link is worked
 * out again whenever the path changes, instead of keeping the host it was signed with.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import { useViaCurrentPath } from '@/hooks/useLanStatus';
import { noteNetworkState, resetLanTransport, setLanContext, transportFetch } from '@/config/lanTransport';
import { OTHER_WIFI_SAME_RANGE, onWarehouseWifi } from '@/tests/helpers/lanNetwork';

const PUBLIC = 'https://warehouse.example.test';
const LAN = 'http://192.168.1.20:8080';
const photo = `${PUBLIC}/storage/v1/object/sign/grn-images/a.jpg?token=abc`;
const originalFetch = global.fetch;
let publicUp = true;

const answer = (path: 'lan' | 'public', body: unknown = 'Hello') =>
  ({ ok: true, status: 200, headers: { get: () => path }, json: async () => body, clone: () => answer(path, body), body: null }) as unknown as Response;

beforeEach(() => {
  publicUp = true;
  resetLanTransport();
  setLanContext({ canonical: PUBLIC, lan: LAN, instanceId: 'instance-0001' });
  onWarehouseWifi();
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith(PUBLIC)) {
      if (!publicUp) throw new TypeError('Network request failed');
      return answer('public');
    }
    return answer('lan', url.endsWith('/get-public-config') ? { success: true, data: { instanceId: 'instance-0001' } } : 'Hello');
  }) as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
  resetLanTransport();
});

it('gives the link on the address in use now, and again when the path changes', async () => {
  let shown = '';
  const Photo = ({ url }: { url: string }) => {
    shown = useViaCurrentPath(url);
    return null;
  };
  let tree: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<Photo url={photo} />);
  });
  expect(shown).toBe(photo);
  // The internet goes: the phone moves to the warehouse network and the same photo is fetched from there.
  publicUp = false;
  await act(async () => {
    await transportFetch(`${PUBLIC}/rest/v1/items`, undefined, { read: true });
  });
  expect(shown).toBe(photo.replace(PUBLIC, LAN));
  // A link that was signed on the LAN address is moved back too once the phone returns to the public path.
  await act(async () => {
    noteNetworkState(OTHER_WIFI_SAME_RANGE);
  });
  expect(shown).toBe(photo);
  await act(async () => {
    tree!.update(<Photo url={photo.replace(PUBLIC, LAN)} />);
  });
  expect(shown).toBe(photo);
  await act(async () => {
    tree!.unmount();
  });
});

it('leaves a link of another origin alone', async () => {
  let shown = '';
  const Photo = () => {
    shown = useViaCurrentPath('https://cdn.example.test/a.jpg');
    return null;
  };
  await act(async () => {
    create(<Photo />);
  });
  expect(shown).toBe('https://cdn.example.test/a.jpg');
});
