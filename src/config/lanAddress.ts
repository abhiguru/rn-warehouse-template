/**
 * The warehouse network (LAN) address of a facility's server (WS-L, owner decision 2026-10-26).
 *
 * The server tells the app its address on the warehouse network as `urls.lan` in the authenticated
 * `get-config` answer: `http://<private IPv4>:<port>`, plain http, present only while the operator has
 * the fallback on (backend `lan.sh on`). The phone uses it only after the public address has failed
 * (src/config/lanTransport.ts) and goes back to the public address when it works again.
 *
 * This is the ONE place a cleartext URL is accepted in the app. Android cannot restrict cleartext to an
 * address range in its network-security config (it names hosts, not ranges), so the platform allows
 * cleartext and this validation is what keeps it to private addresses. Everything else the app accepts as
 * a server address is https (`parseOperatorOrigin`, `parseCentralOrigin`).
 *
 * No imports: the module is used by the config layer, the transport and the Settings screen alike.
 */

/** A sample of the form the address takes, for a field's placeholder and the message about a wrong address. */
export const LAN_ADDRESS_EXAMPLE = 'http://192.168.1.20:8080';

/** The lowest port the server offers and the app accepts (a privileged port is never the fallback listener). */
export const LAN_MIN_PORT = 1024;

/** `http://a.b.c.d:port` and nothing else: no user info, path, query, fragment or host name. */
const LAN_ORIGIN = /^http:\/\/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})\/?$/i;

/** RFC 1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16. Not loopback, link-local or the shared (CGNAT) range. */
export function isPrivateIPv4(octets: readonly number[]): boolean {
  const [first, second] = octets;
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

/**
 * The address in its one form (`http://192.168.1.20:8080`), or null when `value` is not one: the scheme must
 * be http, the host a private IPv4 literal (four numbers 0 to 255 without leading zeros, which some resolvers
 * read as octal), the port written out and 1024 to 65535 (the range the server's own check allows, backend
 * `functions/_shared/lan-url.ts`). A single trailing slash and surrounding white space are accepted and
 * removed. Anything else, including a host name or a public address, is null.
 */
export function parseLanOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = LAN_ORIGIN.exec(value.trim());
  if (!match) return null;
  const parts = match.slice(1);
  if (parts.some(part => part.length > 1 && part.startsWith('0'))) return null;
  const [first, second, third, fourth, port] = parts.map(Number);
  if ([first, second, third, fourth].some(octet => octet > 255)) return null;
  if (!isPrivateIPv4([first, second, third, fourth])) return null;
  if (port < LAN_MIN_PORT || port > 65535) return null;
  return `http://${first}.${second}.${third}.${fourth}:${port}`;
}

const DOTTED_IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** The four numbers of a dotted IPv4 address written the usual way (0 to 255, no leading zeros), or null. */
export function parseIPv4(value: unknown): number[] | null {
  if (typeof value !== 'string') return null;
  const match = DOTTED_IPV4.exec(value);
  if (!match) return null;
  const parts = match.slice(1);
  if (parts.some(part => part.length > 1 && part.startsWith('0'))) return null;
  const octets = parts.map(Number);
  return octets.every(octet => octet <= 255) ? octets : null;
}

const toNumber = (octets: readonly number[]): number =>
  (((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0);

/** The host (four numbers) of an address `parseLanOrigin` accepts, or null. */
export function lanHostOctets(origin: unknown): number[] | null {
  const parsed = parseLanOrigin(origin);
  const match = parsed ? LAN_ORIGIN.exec(parsed) : null;
  return match ? match.slice(1, 5).map(Number) : null;
}

/**
 * The length of the network part of a subnet mask such as `255.255.255.0` (24), or null when the mask is not
 * usable: not four numbers, not a run of ones followed by zeros, or shorter than 8 or longer than 30 bits. A
 * phone that reports `255.255.255.255` (Android does when it cannot read the prefix) or `0.0.0.0` (iOS does)
 * has no known subnet.
 */
export function subnetPrefixLength(mask: unknown): number | null {
  const octets = parseIPv4(mask);
  if (!octets) return null;
  const bits = toNumber(octets);
  let prefix = 0;
  while (prefix < 32 && ((bits >>> (31 - prefix)) & 1) === 1) prefix += 1;
  // Everything after the ones must be zeros.
  if (prefix < 32 && (bits & (0xffffffff >>> prefix)) !== 0) return null;
  return prefix >= 8 && prefix <= 30 ? prefix : null;
}

/**
 * True when the host of `lanOrigin` lies in the same subnet as the phone's own address (`phoneAddress` with
 * `subnetMask`, as NetInfo reports them for Wi-Fi and Ethernet). False for anything unknown: the fallback is
 * used only when the phone is on a network that can hold the server's address.
 */
export function lanAddressInSubnet(lanOrigin: unknown, phoneAddress: unknown, subnetMask: unknown): boolean {
  const lanHost = lanHostOctets(lanOrigin);
  const phone = parseIPv4(phoneAddress);
  const prefix = subnetPrefixLength(subnetMask);
  if (!lanHost || !phone || prefix === null) return false;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return ((toNumber(lanHost) & mask) >>> 0) === ((toNumber(phone) & mask) >>> 0);
}

/**
 * True when `typed` names a host in the same /24 as `offered` (the address the server sends): the person
 * may correct the host part of a live fallback address (a DHCP change), not point the phone somewhere else.
 * A network or broadcast address (`.0`, `.255`) is not a host.
 */
export function isHostPartChange(offered: unknown, typed: unknown): boolean {
  const from = lanHostOctets(offered);
  const to = lanHostOctets(typed);
  if (!from || !to) return false;
  if (to[3] === 0 || to[3] === 255) return false;
  return from[0] === to[0] && from[1] === to[1] && from[2] === to[2];
}
