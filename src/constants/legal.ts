/**
 * Facts shared by the Terms of service and Privacy policy pages.
 *
 * Both pages are English only (Settings says so in Gujarati). They never print a
 * placeholder: the party they speak for is read at render from the cold storage
 * the phone is connected to.
 */
import { getActiveOperatorServer } from '@/config/operatorServer';

/** The date the legal pages were last changed, written 'D Month YYYY'. */
export const LEGAL_UPDATED = '14 October 2026';

export const ASSOCIATION_NAME = 'Gujarat Cold Storage Association';

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
  };
}
