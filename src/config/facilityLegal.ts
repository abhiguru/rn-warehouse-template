/**
 * The facility's legal settings (WH-140): the values the Terms of service and the
 * Privacy policy are filled from. The backend sends them as `legal` in its public
 * configuration (backend migration 167); every value is text, '' when the facility
 * has not given it.
 */
export interface FacilityLegal {
  /** Legal name; the backend falls back to the company name. */
  legalName: string;
  /** City and state of the seat for disputes. */
  city: string;
  state: string;
  /** The grievance officer. */
  grievanceName: string;
  grievanceEmail: string;
  grievancePhone: string;
}

const KEYS: Array<keyof FacilityLegal> = ['legalName', 'city', 'state', 'grievanceName', 'grievanceEmail', 'grievancePhone'];

/** The values of a public configuration's `legal`, or undefined when the server sent none (an older backend). */
export function parseFacilityLegal(value: unknown): FacilityLegal | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const given = value as Record<string, unknown>;
  const out = {} as FacilityLegal;
  for (const key of KEYS) {
    const text = typeof given[key] === 'string' ? (given[key] as string).trim() : '';
    out[key] = text.slice(0, 120);
  }
  return out;
}
