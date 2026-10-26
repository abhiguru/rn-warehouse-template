/**
 * The phone's network, as NetInfo reports it to the warehouse network fallback (src/config/lanTransport.ts).
 * The LAN path is used only on Wi-Fi or Ethernet with the LAN address inside the phone's subnet, so a test of
 * the fallback says where the phone is. The tests' LAN address is `http://192.168.1.20:8080`.
 */
import { noteNetworkState, type NetworkSnapshot } from '@/config/lanTransport';

/** The warehouse Wi-Fi: 192.168.1.0/24, the same network as the tests' server address 192.168.1.20. */
export const WAREHOUSE_WIFI: NetworkSnapshot = {
  connected: true,
  type: 'wifi',
  ipAddress: '192.168.1.50',
  subnet: '255.255.255.0',
};
/** Another Wi-Fi that happens to use the same private range, with the phone on a different address. */
export const OTHER_WIFI_SAME_RANGE: NetworkSnapshot = { ...WAREHOUSE_WIFI, ipAddress: '192.168.1.77' };
/** A home Wi-Fi in another private range: the warehouse address is not in its subnet. */
export const HOME_WIFI: NetworkSnapshot = { connected: true, type: 'wifi', ipAddress: '192.168.0.12', subnet: '255.255.255.0' };
export const ETHERNET: NetworkSnapshot = { connected: true, type: 'ethernet', ipAddress: '192.168.1.60', subnet: '255.255.255.0' };
export const MOBILE_DATA: NetworkSnapshot = { connected: true, type: 'cellular', ipAddress: null, subnet: null };
export const NO_NETWORK: NetworkSnapshot = { connected: false, type: 'none', ipAddress: null, subnet: null };
/** Wi-Fi whose address NetInfo could not read. */
export const WIFI_UNKNOWN_SUBNET: NetworkSnapshot = { connected: true, type: 'wifi', ipAddress: null, subnet: null };

export const onWarehouseWifi = (): void => noteNetworkState(WAREHOUSE_WIFI);
