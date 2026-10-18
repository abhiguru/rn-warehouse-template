/**
 * The store of an invoice flow test, held outside the test file so that a `jest.mock` factory can reach it:
 * `jest.mock('@/store/hooks', () => require('@/tests/helpers/invoiceFlowStore').flowStoreHooks())`.
 * No jest globals here.
 */
import { makeInvoiceStore, storeHooks, type InvoiceStore } from '@/tests/helpers/invoiceFixtures';

let current: InvoiceStore = makeInvoiceStore();

/** A fresh store for the next test; returns it. */
export function newFlowStore(role = 'staff'): InvoiceStore {
  current = makeInvoiceStore({ role });
  return current;
}
export const flowStore = (): InvoiceStore => current;

/** The module `@/store/hooks` reading the current flow store. */
export const flowStoreHooks = () => storeHooks(() => current);
