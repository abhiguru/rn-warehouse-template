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
 * read as octal), the port written out and 1 to 65535. A single trailing slash and surrounding white space are
 * accepted and removed. Anything else, including a host name or a public address, is null.
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
  if (port < 1 || port > 65535) return null;
  return `http://${first}.${second}.${third}.${fourth}:${port}`;
}
