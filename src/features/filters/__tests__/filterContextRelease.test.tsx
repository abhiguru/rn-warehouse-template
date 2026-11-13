/**
 * WH-143 and WH-138: the filter context reads the facility's setting and the backend's release at EVERY render, not once
 * when it was built. The real hook, config, capability store and release table run; only the signed-in role and the
 * active server are stood in. The setting changing under a mounted list (the Charging screen switches it without a
 * restart) must show on the next render.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { configureStore } from '@reduxjs/toolkit';
import listFilterReducer from '@/store/slices/listFilterSlice';
import { resetFacilityCapabilities, setFacilityCapabilities } from '@/config/facilityCapabilities';
import { resetFacilityRelease, setFacilityRelease } from '@/config/backendFeatures';
import { setLanguage } from '@/i18n';
import { describeValue, visibleFields } from '../filterModel';
import { GRN_FILTERS, INVOICE_FILTERS } from '../configs';
import type { FilterContext } from '../types';
import { useListFilters } from '../useListFilters';

const mockServer = { origin: 'https://one.example.test', instanceId: 'instance-0001' };
jest.mock('@/config/operatorServer', () => ({
  getActiveOperatorServer: () => mockServer,
  onOperatorServerChange: () => () => {},
}));
jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('@/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/store/slices/authSlice', () => ({ forceLogoutOnInvalidToken: jest.fn(), logout: { fulfilled: { type: 'auth/logout/fulfilled' } } }));

let mockStore: ReturnType<typeof makeStore>;
const makeStore = (role: string | null) =>
  configureStore({
    reducer: {
      listFilters: listFilterReducer,
      auth: (state: unknown = { userProfile: role ? { id: 'user-a', role } : null }) => state,
    },
  });
jest.mock('@/store/hooks', () => {
  const { useRef, useSyncExternalStore } = jest.requireActual('react');
  return {
    useAppDispatch: () => mockStore.dispatch,
    useAppSelector: (selector: (state: unknown) => unknown) => {
      const last = useRef(null);
      const read = () => {
        const state = mockStore.getState();
        if (!last.current || last.current.state !== state || last.current.selector !== selector) {
          last.current = { state, selector, value: selector(state) };
        }
        return last.current.value;
      };
      return useSyncExternalStore(mockStore.subscribe, read);
    },
  };
});

const HEAD_172 = '00000000000172_record_payments';
const HEAD_201 = '00000000000201_something';
const HEAD_202 = '00000000000202_grn_items_invoice_filter';

type Invoice = ReturnType<typeof useListFilters<ReturnType<typeof INVOICE_FILTERS.toRequest>>>;
type Grn = ReturnType<typeof useListFilters<ReturnType<typeof GRN_FILTERS.toRequest>>>;

/** Mounts one list on the real hook; `render()` draws it again, as any state change in the screen does. */
function mount<T>(config: unknown, role: string | null, initial?: { key: string; values: Record<string, unknown> }) {
  mockStore = makeStore(role);
  const shown: { current: T | null } = { current: null };
  const Probe = ({ tick }: { tick: number }) => {
    void tick;
    shown.current = useListFilters(config as never) as unknown as T;
    return null;
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  let tick = 0;
  act(() => {
    renderer = TestRenderer.create(<Probe tick={tick} />);
  });
  if (initial) {
    act(() => {
      (shown.current as unknown as Invoice).apply(initial.values as never);
    });
  }
  mounted.push(renderer);
  return {
    get now() { return shown.current as T; },
    render: () => act(() => renderer.update(<Probe tick={++tick} />)),
  };
}

const keysOf = (list: { fields: { key: string }[] }) => list.fields.map(field => field.key);
const optionValues = (list: { fields: Array<{ key: string; options?: Array<{ value: string }> }> }, key: string) =>
  list.fields.find(field => field.key === key)?.options?.map(option => option.value);

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach(renderer => renderer.unmount()));
});
beforeEach(() => {
  resetFacilityCapabilities();
  resetFacilityRelease();
  setLanguage('en');
});

describe('WH-143: the Invoices Payment filter follows the setting and the release at every render', () => {
  it.each([['admin'], ['supervisor']])('a %s sees it on the next render after the setting turns on, with Due, Part paid and Paid', role => {
    setFacilityRelease(mockServer, { schemaHead: HEAD_172 });
    setFacilityCapabilities(mockServer, { payments: false });
    const list = mount<Invoice>(INVOICE_FILTERS, role);
    expect(keysOf(list.now)).not.toContain('payment');

    // The Charging screen switches the setting; no restart, no new mount.
    act(() => setFacilityCapabilities(mockServer, { payments: true }));
    list.render();
    expect(keysOf(list.now)).toContain('payment');
    expect(optionValues(list.now as never, 'payment')).toEqual(['all', 'due', 'part_paid', 'paid']);
    expect(describeValue(INVOICE_FILTERS.fields.find(field => field.key === 'payment')!, 'part_paid')).toBe('Part paid');
  });

  it('shows it when the release is recorded after the setting (the phone finding: setting on first, release second)', () => {
    setFacilityCapabilities(mockServer, { payments: true });
    const list = mount<Invoice>(INVOICE_FILTERS, 'admin');
    expect(keysOf(list.now)).not.toContain('payment');
    setFacilityRelease(mockServer, { schemaHead: HEAD_172 });
    list.render();
    expect(keysOf(list.now)).toContain('payment');
  });

  it.each([['staff'], ['customer']])('never offers it to %s, even with the setting on and the release current', role => {
    setFacilityRelease(mockServer, { schemaHead: HEAD_172 });
    setFacilityCapabilities(mockServer, { payments: true });
    const list = mount<Invoice>(INVOICE_FILTERS, role);
    list.render();
    expect(keysOf(list.now)).not.toContain('payment');
  });

  it('does not offer it on a backend below migration 172, or one that does not say', () => {
    setFacilityCapabilities(mockServer, { payments: true });
    setFacilityRelease(mockServer, { schemaHead: '00000000000171_before_payments' });
    const list = mount<Invoice>(INVOICE_FILTERS, 'admin');
    expect(keysOf(list.now)).not.toContain('payment');
    resetFacilityRelease();
    list.render();
    expect(keysOf(list.now)).not.toContain('payment');
  });

  it('turning the setting off removes it and the stored choice is not sent', () => {
    setFacilityRelease(mockServer, { schemaHead: HEAD_172 });
    setFacilityCapabilities(mockServer, { payments: true });
    const list = mount<Invoice>(INVOICE_FILTERS, 'admin', { key: 'payment', values: { payment: 'due' } });
    expect(list.now.request.p_payment_status).toBe('due');

    act(() => setFacilityCapabilities(mockServer, { payments: false }));
    list.render();
    expect(keysOf(list.now)).not.toContain('payment');
    expect(list.now.values.payment).toBeUndefined();
    expect(list.now.request).not.toHaveProperty('p_payment_status');

    // Switched on again: the stored choice was kept in the store only as far as the field is visible.
    act(() => setFacilityCapabilities(mockServer, { payments: true }));
    list.render();
    expect(keysOf(list.now)).toContain('payment');
  });

  it('a stored choice is not sent to a staff account', () => {
    setFacilityRelease(mockServer, { schemaHead: HEAD_172 });
    setFacilityCapabilities(mockServer, { payments: true });
    const list = mount<Invoice>(INVOICE_FILTERS, 'staff');
    act(() => list.now.apply({ payment: 'paid' }));
    expect(list.now.request).not.toHaveProperty('p_payment_status');
  });
});

describe('WH-138: the GRN Invoicing filter follows the backend release at every render', () => {
  it('is hidden below migration 202, appears on the next render when the release rises to 202', () => {
    setFacilityRelease(mockServer, { schemaHead: HEAD_201 });
    const list = mount<Grn>(GRN_FILTERS, 'admin');
    expect(keysOf(list.now)).not.toContain('invoicing');
    expect(list.now.ctx.grnInvoiceFilter).toBe(false);

    setFacilityRelease(mockServer, { schemaHead: HEAD_202 });
    list.render();
    expect(keysOf(list.now)).toContain('invoicing');
    expect(list.now.ctx.grnInvoiceFilter).toBe(true);
  });

  it('is hidden when the backend does not say its release', () => {
    const list = mount<Grn>(GRN_FILTERS, 'admin');
    expect(keysOf(list.now)).not.toContain('invoicing');
  });

  it.each([['admin'], ['supervisor'], ['staff']])('is offered to %s on a current backend, with a fast chip', role => {
    setFacilityRelease(mockServer, { schemaHead: HEAD_202 });
    const list = mount<Grn>(GRN_FILTERS, role);
    expect(keysOf(list.now)).toContain('invoicing');
    expect(GRN_FILTERS.fastFilters).toContain('invoicing');
    expect(optionValues(list.now as never, 'invoicing')).toEqual(['all', 'invoiced', 'not_invoiced', 'partly_invoiced']);
  });

  it('is hidden for a customer even on a current backend, and a stored choice sends nothing', () => {
    setFacilityRelease(mockServer, { schemaHead: HEAD_202 });
    const list = mount<Grn>(GRN_FILTERS, 'customer');
    expect(keysOf(list.now)).not.toContain('invoicing');
    act(() => list.now.apply({ invoicing: 'invoiced' }));
    expect(list.now.request.p_filters?.invoiced).toBeUndefined();
  });

  it('a stored choice is not sent once the release drops below 202 (an older backend would ignore it and show every GRN)', () => {
    setFacilityRelease(mockServer, { schemaHead: HEAD_202 });
    const list = mount<Grn>(GRN_FILTERS, 'admin');
    act(() => list.now.apply({ invoicing: 'invoiced' }));
    expect(list.now.request.p_filters?.invoiced).toBe(true);
    setFacilityRelease(mockServer, { schemaHead: HEAD_201 });
    list.render();
    expect(list.now.request.p_filters?.invoiced).toBeUndefined();
  });

  it('clearing the choice sends nothing and takes the chip off', () => {
    setFacilityRelease(mockServer, { schemaHead: HEAD_202 });
    const list = mount<Grn>(GRN_FILTERS, 'admin');
    act(() => list.now.setField('invoicing', 'partly_invoiced'));
    expect(list.now.request.p_filters?.invoiced).toBe('partly_invoiced');
    expect(list.now.activeCount).toBe(1);
    act(() => list.now.setField('invoicing', 'all'));
    expect(list.now.request.p_filters?.invoiced).toBeUndefined();
    expect(list.now.activeCount).toBe(0);
    expect(list.now.values.invoicing).toBeUndefined();
  });
});

describe('WH-138: values the server takes (migration 202: true, false or the word partly_invoiced)', () => {
  const adminCtx: FilterContext = { role: 'admin', isWarehouseRole: true, assignedCustomers: [], grnInvoiceFilter: true };
  const send = (invoicing: string) => GRN_FILTERS.toRequest({ invoicing }, undefined, adminCtx).p_filters?.invoiced;

  it('sends true, false and partly_invoiced, and nothing for All', () => {
    expect(send('invoiced')).toBe(true);
    expect(send('not_invoiced')).toBe(false);
    expect(send('partly_invoiced')).toBe('partly_invoiced');
    expect(send('all')).toBeUndefined();
    expect(GRN_FILTERS.toRequest({}, undefined, adminCtx).p_filters).toBeUndefined();
  });

  it('has English and Gujarati labels for the field, the options and the chip', () => {
    const invoicing = GRN_FILTERS.fields.find(field => field.key === 'invoicing')!;
    if (invoicing.kind !== 'choice') throw new Error('invoicing must be a choice');
    const labels = () => ({ field: invoicing.label, options: invoicing.options.map(option => option.label), chip: describeValue(invoicing, 'partly_invoiced') });
    expect(labels()).toEqual({ field: 'Invoicing', options: ['All', 'Invoiced', 'Not invoiced', 'Partly invoiced'], chip: 'Partly invoiced' });
    setLanguage('gu');
    expect(labels()).toEqual({
      field: 'ઇન્વૉઇસ',
      options: ['બધા', 'ઇન્વૉઇસ બન્યું', 'ઇન્વૉઇસ બાકી', 'અંશતઃ ઇન્વૉઇસ થયેલ'],
      chip: 'અંશતઃ ઇન્વૉઇસ થયેલ',
    });
    // The default choice shows the field's name, not a chip value.
    expect(describeValue(invoicing, 'all')).toBe('ઇન્વૉઇસ');
  });

  it('the visible field list of a customer has no Invoicing even with the flag set', () => {
    const customerCtx: FilterContext = { ...adminCtx, role: 'customer', isWarehouseRole: false };
    expect(visibleFields(GRN_FILTERS, customerCtx).map(field => field.key)).not.toContain('invoicing');
  });
});
