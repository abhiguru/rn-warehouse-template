import AsyncStorage from '@react-native-async-storage/async-storage';
import { recallFacilityLan, rememberFacilityLan } from '../facilityLanMemory';
import { clearOperatorServer, loadOperatorServer, recordServerLanAddress, saveOperatorServer } from '../operatorServer';

const ORIGIN = 'https://north-cold.example.test';
const SERVER = { origin: ORIGIN, instanceId: 'inst-1', displayName: 'North Cold', companyName: 'North Cold Storage' };

beforeEach(async () => {
  await AsyncStorage.clear();
  await clearOperatorServer();
});

describe('facility LAN memory', () => {
  it('keeps a valid address and forgets it when none is given', async () => {
    await rememberFacilityLan(ORIGIN, 'inst-1', 'http://192.168.1.20:8080');
    expect(await recallFacilityLan(ORIGIN)).toEqual({ lan: 'http://192.168.1.20:8080', instanceId: 'inst-1' });
    await rememberFacilityLan(ORIGIN, 'inst-1', null);
    expect(await recallFacilityLan(ORIGIN)).toBeNull();
  });

  it('refuses an address outside the private ranges', async () => {
    await rememberFacilityLan(ORIGIN, 'inst-1', 'http://8.8.8.8:8080');
    expect(await recallFacilityLan(ORIGIN)).toBeNull();
  });

  it('survives leaving the facility, which removes the selected server', async () => {
    await saveOperatorServer(SERVER);
    await recordServerLanAddress(ORIGIN, 'http://192.168.1.20:8080');
    await rememberFacilityLan(ORIGIN, 'inst-1', 'http://192.168.1.20:8080'); // settles the queue
    await clearOperatorServer();
    expect(await loadOperatorServer()).toBeNull();
    expect(await recallFacilityLan(ORIGIN)).toEqual({ lan: 'http://192.168.1.20:8080', instanceId: 'inst-1' });
  });

  it('forgets an address the server withdraws', async () => {
    await saveOperatorServer(SERVER);
    await recordServerLanAddress(ORIGIN, 'http://192.168.1.20:8080');
    await recordServerLanAddress(ORIGIN, undefined);
    await rememberFacilityLan('https://other.example.test', 'x', null); // settles the queue
    expect(await recallFacilityLan(ORIGIN)).toBeNull();
  });
});
