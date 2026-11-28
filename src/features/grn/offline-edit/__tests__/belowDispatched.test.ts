/**
 * WH-303 (Design 6.x DQ7): the phone's own check of a quantity typed in an Edit GRN. Real: the check, the translations
 * and the number formatting. The only stand-in is the unsent overlay's figure for dispatches this phone has not sent.
 */
import { setLanguage } from '@/i18n';
import { belowDispatchedMessage, dispatchedFromLot } from '../belowDispatched';
import type { GRNLineLocks } from '@/store/slices/grnFormSlice';

let mockUnsent = new Map<string, number>();
jest.mock('@/features/phone-copy/unsentOverlay', () => ({
  getUnsentOverlay: () => ({ deductions: () => mockUnsent }),
}));

const locks = (dispatchedQty?: number): GRNLineLocks => ({ dispatched: true, dispatchedQty, hasHistory: true, invoiced: false, onOrder: false } as GRNLineLocks);

beforeEach(() => {
  mockUnsent = new Map();
});
afterEach(() => setLanguage('en'));

describe('belowDispatchedMessage', () => {
  it('refuses a quantity below what has left the lot, naming both figures', () => {
    expect(belowDispatchedMessage('l1', 6, 'Bag', locks(8))).toBe('6 Bag is less than the 8 Bag already dispatched from this lot.');
  });

  it('accepts the quantity that equals what has left, and any above it', () => {
    expect(belowDispatchedMessage('l1', 8, 'Bag', locks(8))).toBeNull();
    expect(belowDispatchedMessage('l1', 20, 'Bag', locks(8))).toBeNull();
  });

  // WH-381 (owner, 2026-11-27): a dispatch is recorded only with the server, so nothing unsent on this phone adds to what has left a lot.
  it('counts only the dispatches the server knows, whatever an overlay would deduct', () => {
    mockUnsent = new Map([['l1', 3]]);
    expect(dispatchedFromLot('l1', locks(8))).toBe(8);
    expect(belowDispatchedMessage('l1', 7, 'Bag', locks(8))).toBe('7 Bag is less than the 8 Bag already dispatched from this lot.');
    expect(belowDispatchedMessage('l1', 8, 'Bag', locks(8))).toBeNull();
    expect(belowDispatchedMessage('l1', 10, 'Bag', locks(8))).toBeNull();
  });

  it('counts only the unsent dispatches of this lot', () => {
    mockUnsent = new Map([['other', 50]]);
    expect(belowDispatchedMessage('l1', 1, 'Bag', locks(8))).toBe('1 Bag is less than the 8 Bag already dispatched from this lot.');
    expect(dispatchedFromLot('l1', undefined)).toBe(0);
  });

  it('never fires with nothing dispatched, or an older server that sends no figure', () => {
    expect(belowDispatchedMessage('l1', 0, 'Bag', locks(0))).toBeNull();
    expect(belowDispatchedMessage('l1', 0, 'Bag', locks(undefined))).toBeNull();
    expect(belowDispatchedMessage('l1', 0, 'Bag', undefined)).toBeNull();
  });

  it('is written in Gujarati, with Gujarati digits for the quantities', () => {
    setLanguage('gu');
    const message = belowDispatchedMessage('l1', 6, 'Bag', locks(8)) as string;
    expect(message).toMatch(/[઀-૿]/);
    expect(message).toContain('૬');
    expect(message).toContain('૮');
    expect(message).not.toMatch(/[0-9]/);
  });
});
