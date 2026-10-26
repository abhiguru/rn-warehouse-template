/**
 * The answers the gateway itself gives to a request whose `apikey` it does not accept.
 *
 * The gateway answers a request whose apikey it does not know with one of these bodies. After
 * rotate-keys.sh every installed app still holds the old key and the server has revoked every session,
 * so no request can succeed until the session ends and the app reloads the public configuration.
 * (Kong 2 used "Invalid authentication credentials"; PostgREST's own 401s, an expired or foreign access
 * token, carry other messages and stay with the refresh path.)
 *
 * Over the public path this answer ends the session (src/config/supabaseConfig.ts). Over the warehouse
 * network it never does: a LAN listener that was not recreated after a key rotation answers with the old
 * keys, and ending the session there would sign out a phone that cannot sign in again during the outage
 * (src/config/lanTransport.ts treats it as a failure of the LAN path instead).
 *
 * No imports, so the transport and the session code can both use it.
 */
export const GATEWAY_KEY_REJECTIONS = new Set([
  'Unauthorized',
  'Invalid authentication credentials',
  'No API key found in request',
]);

export const isGatewayKeyRejection = (body: unknown): boolean =>
  typeof body === 'object' &&
  body !== null &&
  GATEWAY_KEY_REJECTIONS.has(String((body as { message?: unknown }).message));
