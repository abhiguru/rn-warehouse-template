/**
 * Facts shared by the Terms of service and Privacy policy pages.
 *
 * Both pages are English only (Settings says so in Gujarati). They never print a
 * placeholder: the party they speak for is read at render from the cold storage
 * the phone is connected to (WH-140: its legal name, city and grievance contact
 * come from the facility's settings, src/config/facilityLegal.ts).
 */
import { getActiveOperatorServer } from '@/config/operatorServer';
import type { FacilityLegal } from '@/config/facilityLegal';

/**
 * RELEASE GATE (WH-140). The template legal text (src/legal/templateText.ts) is Product's reading of the
 * Digital Personal Data Protection Act 2023 and has NOT been reviewed by a lawyer. It stays `false` until the
 * owner records the lawyer's review (with its date) in product/specs/legal-pages-template.md and the reviewed
 * text has replaced the template text. `scripts/check-legal-reviewed.mjs` runs inside scripts/check-release.sh and
 * refuses a release tag while this is `false`; docs/RELEASE_CHECKLIST.md lists the same step. Do not set it to
 * `true` to get a build through.
 */
export const LEGAL_TEXT_REVIEWED = false;

export { LEGAL_UPDATED } from '@/config/legalVersion';

export const ASSOCIATION_NAME = 'Gujarat Cold Storage Association';

/**
 * Which text a build shows: the facility template (the default) or the Gujarat Cold Storage Association's own
 * pages, for the association's build (EXPO_PUBLIC_LEGAL_TEXT=association).
 */
export const isAssociationLegalText = (): boolean =>
  process.env.EXPO_PUBLIC_LEGAL_TEXT?.trim().toLowerCase() === 'association';

const UNNAMED_PARTY = 'the cold storage that runs your server';

export interface LegalParty {
  /** The cold storage's name, or null when this build does not know it. */
  name: string | null;
  /** A contact address, or null when this build is not given one. */
  email: string | null;
  /** The name for use inside a sentence ("the cold storage that runs your server" when unknown). */
  inline: string;
  /** The name for the start of a sentence. */
  leading: string;
  /** True when the phone is connected to a server (false on the pages opened from sign-in before one is chosen). */
  connected: boolean;
  /** The facility's legal settings, or null when the server sent none. */
  legal: FacilityLegal | null;
}

export function legalParty(): LegalParty {
  const server = getActiveOperatorServer();
  const name =
    server?.companyName?.trim() ||
    server?.displayName?.trim() ||
    process.env.EXPO_PUBLIC_COMPANY_NAME?.trim() ||
    null;
  const email = process.env.EXPO_PUBLIC_LEGAL_EMAIL?.trim() || null;
  const inline = name ?? UNNAMED_PARTY;
  return {
    name,
    email,
    inline,
    leading: inline.charAt(0).toUpperCase() + inline.slice(1),
    connected: server != null,
    legal: server?.legal ?? null,
  };
}
