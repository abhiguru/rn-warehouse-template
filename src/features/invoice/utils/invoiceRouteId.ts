import { createContext } from 'react';

/**
 * The invoice an edit's route is for (`/invoice-edit/<id>/...`), given by the edit layout to its steps.
 * The form slice holds whichever invoice was loaded last; a step saves and navigates by this id, and
 * refuses when the slice holds another invoice (J1, review 2026-10-20). Null outside an edit layout:
 * a new invoice has no id, and a step rendered alone falls back to the slice's.
 */
export const InvoiceRouteIdContext = createContext<string | null>(null);
