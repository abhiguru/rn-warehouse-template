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
import { activeBrandPack } from '@/theme/brandPack';

/**
 * RELEASE GATE (WH-140). The template legal text (src/legal/templateText.ts) is Product's reading of the
 * Digital Personal Data Protection Act 2023 and has NOT been reviewed by a lawyer. It stays `false` until the
 * owner records the lawyer's review (with its date) in product/specs/legal-pages-template.md and the reviewed
 * text has replaced the template text. `npm run check:legal` fails while this is `false`; the release workflow attaches
 * the APK only when it is `true`, and docs/RELEASE_CHECKLIST.md lists the same step. Release tags are not gated. Do not set it to
 * `true` to get a build through.
 */
export const LEGAL_TEXT_REVIEWED = false;

export { LEGAL_UPDATED, legalUpdatedLabel } from '@/config/legalVersion';

export interface LegalProvider {
  /** The defined term the pages use after the first mention: "Association" (a build with a brand pack that names one) or "Publisher". */
  term: string;
  /** The first mention, with its defined term: 'The <name> (the "Association")'. */
  definition: string;
}

/**
 * Who provides the App. A build whose brand pack names an association (brand-packs/README.md) says so;
 * any other build speaks of "the organisation that distributes your copy of the App".
 */
export function legalProvider(): LegalProvider {
  const name = activeBrandPack()?.association?.name.trim();
  return name
    ? { term: 'Association', definition: `The ${name} (the "Association")` }
    : { term: 'Publisher', definition: 'The organisation that distributes your copy of the App (the "Publisher")' };
}

/**
 * Which text a build shows: the facility template (the default) or an association's own pages, for a build
 * whose brand pack names the association (EXPO_PUBLIC_LEGAL_TEXT=association).
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
