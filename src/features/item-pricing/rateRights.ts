import { canOpenScreen, isManager } from '@/config/roles';

export interface RateRights {
  canWrite: boolean;
  canCorrect: boolean;
  canStartInPast: boolean;
  canSeeChanges: boolean;
  canSeeOldRates: boolean;
}

/**
 * Who may do what on the item rates (the server enforces the same rules). Item pricing is for
 * administrators and supervisors only (owner, 2026-10-16; the server refuses staff from
 * migration 90), so every flag is true for a manager and false for anyone else. The flags stay
 * separate so a screen reads the right to the action it offers.
 */
export const rateRights = (role: string | null | undefined): RateRights => ({
  canWrite: canOpenScreen(role, 'itemPricingWrite'),
  canCorrect: isManager(role),
  canStartInPast: isManager(role),
  canSeeChanges: canOpenScreen(role, 'itemPriceHistory'),
  canSeeOldRates: canOpenScreen(role, 'itemPricing'),
});
