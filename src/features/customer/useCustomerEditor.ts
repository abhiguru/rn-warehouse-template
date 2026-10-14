/**
 * The values of the customer form (G-02, G-14).
 *
 * They live in this hook's own state and are loaded by the customer's id, never
 * kept in Redux: opening customer B after leaving customer A always starts
 * empty and fills from B's own answer. An answer for any other id than the
 * current one is ignored. The form is drawn only when `status` is 'ready'.
 *
 * Without an id (Add customer) the form is ready at once with empty fields.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { customerService } from '@/services/customer-service';
import type { Customer } from '@/types/customer.types';
import { nationalMobileDigits } from '@/utils/formatters';
import type { CustomerFormFields } from '@/features/customer/schemas/customerValidation';

export type CustomerEditorStatus = 'loading' | 'ready' | 'error';

export const EMPTY_CUSTOMER_FIELDS: CustomerFormFields = {
  name: '',
  mobile: '',
  email: '',
  city: '',
  state: '',
  pincode: '',
  address: '',
  gst: '',
  pan: '',
  contact_name: '',
  contact_mobile: '',
  contact_email: '',
};

const FIELD_NAMES = Object.keys(EMPTY_CUSTOMER_FIELDS) as (keyof CustomerFormFields)[];

interface EditorState {
  /** The id these values belong to (undefined: a new customer). */
  forId: string | undefined;
  status: CustomerEditorStatus;
  fields: CustomerFormFields;
  /** What was loaded, to compare with and to take the saved documents from. */
  base: CustomerFormFields;
  customer: Customer | null;
  /** The message of a failed load. */
  message: string | null;
}

const empty = (forId: string | undefined, status: CustomerEditorStatus): EditorState => ({
  forId,
  status,
  fields: EMPTY_CUSTOMER_FIELDS,
  base: EMPTY_CUSTOMER_FIELDS,
  customer: null,
  message: null,
});

function fieldsOf(customer: Customer): CustomerFormFields {
  return {
    name: customer.name || '',
    mobile: nationalMobileDigits(customer.mobile || ''),
    email: customer.email || '',
    city: customer.city || '',
    state: customer.state || '',
    pincode: customer.pincode || '',
    address: customer.address || '',
    gst: customer.gst || '',
    pan: customer.pan || '',
    contact_name: customer.contact_name || '',
    contact_mobile: nationalMobileDigits(customer.contact_mobile || ''),
    contact_email: customer.contact_email || '',
  };
}

export function useCustomerEditor(id?: string) {
  const [state, setState] = useState<EditorState>(() => empty(id, id ? 'loading' : 'ready'));
  const [attempt, setAttempt] = useState(0);
  const currentId = useRef(id);
  currentId.current = id;

  useEffect(() => {
    if (!id) {
      setState(previous => (previous.forId === undefined ? previous : empty(undefined, 'ready')));
      return;
    }
    setState(empty(id, 'loading'));
    let ignore = false;
    void (async () => {
      let result;
      try {
        result = await customerService.getCustomerById(id);
      } catch {
        result = { success: false, message: '' } as const;
      }
      // An answer for a customer that is no longer the one on the screen is dropped.
      if (ignore || currentId.current !== id) return;
      if (result.success && result.data && result.data.id === id) {
        const loaded = fieldsOf(result.data);
        setState({ forId: id, status: 'ready', fields: loaded, base: loaded, customer: result.data, message: null });
      } else {
        setState({ ...empty(id, 'error'), message: result.message || null });
      }
    })();
    return () => {
      ignore = true;
    };
  }, [id, attempt]);

  // A render for a new id is still holding the old customer's state: show nothing of it.
  const current = state.forId === id ? state : empty(id, id ? 'loading' : 'ready');

  const setField = useCallback((field: keyof CustomerFormFields, value: string) => {
    setState(previous => (previous.forId === currentId.current ? { ...previous, fields: { ...previous.fields, [field]: value } } : previous));
  }, []);

  const retry = useCallback(() => setAttempt(count => count + 1), []);

  const hasChanges = current.status === 'ready' && FIELD_NAMES.some(name => current.fields[name].trim() !== current.base[name].trim());

  return {
    status: current.status,
    fields: current.fields,
    customer: current.customer,
    message: current.message,
    isCreate: !id,
    hasChanges,
    setField,
    retry,
  };
}
