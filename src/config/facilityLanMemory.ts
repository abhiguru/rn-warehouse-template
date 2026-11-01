/**
 * The warehouse-network address of each facility this phone has used, kept after the facility is left.
 *
 * The selected server's record (operatorServer.ts) holds its LAN address, but leaving a facility removes that record.
 * A sign-in with a code from the facility (src/config/breakGlass.ts) happens when the internet is down, so it needs
 * the address of a facility that is not selected. Nothing secret is stored: the validated address
 * (src/config/lanAddress.ts) and the facility's instance id, which the transport checks before it sends anything
 * there. An address the server withdraws is forgotten here too.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseLanOrigin } from './lanAddress';

const KEY = 'facility_lan_v1';

export type RememberedLan = { lan: string; instanceId: string };

async function readAll(): Promise<Record<string, RememberedLan>> {
  try {
    const parsed: unknown = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const clean: Record<string, RememberedLan> = {};
    for (const [origin, value] of Object.entries(parsed as Record<string, Partial<RememberedLan>>)) {
      const lan = parseLanOrigin(value?.lan);
      if (lan && typeof value?.instanceId === 'string' && value.instanceId) clean[origin] = { lan, instanceId: value.instanceId };
    }
    return clean;
  } catch {
    return {};
  }
}

// One change at a time, so two writes do not overwrite each other.
const queue = { tail: Promise.resolve() as Promise<unknown> };

/** Remember the address of a facility (or, with `lan` null, forget it). Never throws. */
export function rememberFacilityLan(origin: string, instanceId: string, lan: string | null): Promise<void> {
  const run = async () => {
    const all = await readAll();
    const valid = parseLanOrigin(lan);
    if (valid) all[origin] = { lan: valid, instanceId };
    else delete all[origin];
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
  };
  const result = queue.tail.then(run, run).catch(() => {});
  queue.tail = result;
  return result;
}

/** The address remembered for a facility, or null. */
export async function recallFacilityLan(origin: string): Promise<RememberedLan | null> {
  return (await readAll())[origin] ?? null;
}
