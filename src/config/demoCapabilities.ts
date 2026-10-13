/**
 * What a facility offers beyond the core screens, as its public config names it
 * (`capabilities` in get-public-config; src/config/facilityCapabilities.ts reads it).
 *
 * The type lives here, not in facilityCapabilities.ts, so this file imports nothing.
 */
export interface FacilityCapabilities {
  /** Label printing through the facility's print service. */
  printing: boolean;
  /** Temperature and humidity sensors: the Sensors screens and the Settings row. */
  sensors: boolean;
  /** Live updates of orders and carts. */
  realtime: boolean;
  customerDocuments: boolean;
}

/**
 * The capabilities assumed for a facility whose public config has not been read in this
 * run, and for each key its config leaves out or does not give as true or false. The
 * values are those of the local demo backend (docs/HISTORY.md): printing and sensors off,
 * live order updates on.
 */
export const DEMO_CAPABILITIES: FacilityCapabilities = {
  printing: false,
  sensors: false,
  realtime: true,
  customerDocuments: false,
};
