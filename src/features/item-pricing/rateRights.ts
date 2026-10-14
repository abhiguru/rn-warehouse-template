import { canOpenScreen, isManager } from '@/config/roles';

export interface RateRights {
  canWrite: boolean;
  canCorrect: boolean;
  canStartInPast: boolean;
  canSeeChanges: boolean;
  canSeeOldRates: boolean;
}

/** Who may do what on the item rates (the server enforces the same rules). */
export const rateRights = (role: string | null | undefined): RateRights => ({
  canWrite: canOpenScreen(role, 'itemPricingWrite'),
  canCorrect: isManager(role),
  canStartInPast: isManager(role),
  canSeeChanges: canOpenScreen(role, 'itemPriceHistory'),
  canSeeOldRates: canOpenScreen(role, 'itemPricing'),
});
