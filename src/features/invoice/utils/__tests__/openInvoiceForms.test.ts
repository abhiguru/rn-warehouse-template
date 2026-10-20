/**
 * J1 (review 2026-10-20): the invoice form lives in one slice, so a form for another invoice (or a new invoice) is
 * not opened over one that is open. An edit of the same invoice shares the open form.
 */
import { openFormBlocking, openInvoiceFormCount, registerInvoiceForm } from '../openInvoiceForms';

const releases: Array<() => void> = [];
const open = (form: Parameters<typeof registerInvoiceForm>[0]) => {
  const release = registerInvoiceForm(form);
  releases.push(release);
  return release;
};
afterEach(() => {
  releases.splice(0).forEach((release) => release());
});

describe('open invoice forms', () => {
  it('has nothing in the way when no form is open', () => {
    expect(openFormBlocking({ kind: 'edit', id: 'inv-1' })).toBeNull();
    expect(openFormBlocking({ kind: 'create' })).toBeNull();
    expect(openInvoiceFormCount()).toBe(0);
  });

  it('lets an edit of the same invoice share the open form', () => {
    open({ kind: 'edit', id: 'inv-1' });

    expect(openFormBlocking({ kind: 'edit', id: 'inv-1' })).toBeNull();
  });

  it('turns away an edit of another invoice and a new invoice while an edit is open', () => {
    const first = { kind: 'edit', id: 'inv-1' } as const;
    open(first);

    expect(openFormBlocking({ kind: 'edit', id: 'inv-2' })).toBe(first);
    expect(openFormBlocking({ kind: 'create' })).toBe(first);
  });

  it('turns away an edit while a new invoice is open', () => {
    const create = { kind: 'create' } as const;
    open(create);

    expect(openFormBlocking({ kind: 'edit', id: 'inv-1' })).toBe(create);
  });

  it('opens again once the form has closed, and counts the forms that are open', () => {
    const release = open({ kind: 'edit', id: 'inv-1' });
    open({ kind: 'edit', id: 'inv-1' });
    expect(openInvoiceFormCount()).toBe(2);

    release();

    expect(openInvoiceFormCount()).toBe(1);
    expect(openFormBlocking({ kind: 'edit', id: 'inv-2' })).not.toBeNull();
    releases.splice(0).forEach((closeForm) => closeForm());
    expect(openFormBlocking({ kind: 'edit', id: 'inv-2' })).toBeNull();
  });
});
