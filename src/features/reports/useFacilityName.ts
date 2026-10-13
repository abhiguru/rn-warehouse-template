/**
 * The name of the facility whose data the reports show, for the line under a
 * report's title and the Reports tab's (SR-O11): its company name, else its
 * short name, as its discovery document gave them. Empty with no facility
 * chosen, and then no line is drawn.
 *
 * Read from the active server on every draw, as `reportPrefsScope` reads it: a
 * facility switch rebuilds the screens. No store is read here.
 */
import { getActiveOperatorServer } from '@/config/operatorServer';

export function useFacilityName(): string {
  const server = getActiveOperatorServer();
  return server?.companyName?.trim() || server?.displayName?.trim() || '';
}
