/**
 * Review 2026-10-20, finding 3: the dispatch form lives in one slice, so a form for another dispatch (or a new
 * dispatch) is not opened over one that is open. Unlike the invoice forms, no second form of the same dispatch is
 * opened either.
 */
import { dispatchFormRoute, openDispatchFormBlocking, openDispatchFormCount, registerDispatchForm } from '../openDispatchForms';

const releases: Array<() => void> = [];
const open = (form: Parameters<typeof registerDispatchForm>[0]) => {
  const release = registerDispatchForm(form);
  releases.push(release);
  return release;
};
afterEach(() => {
  releases.splice(0).forEach((release) => release());
});

describe('open dispatch forms', () => {
  it('has nothing in the way when no form is open', () => {
    expect(openDispatchFormBlocking()).toBeNull();
    expect(openDispatchFormCount()).toBe(0);
  });

  it('turns away every other form while an edit is open, also another edit of the same dispatch', () => {
    const edit = { kind: 'edit', id: 'd-1' } as const;
    open(edit);

    expect(openDispatchFormBlocking()).toBe(edit);
  });

  it('turns away every form while a new dispatch is open', () => {
    const create = { kind: 'create' } as const;
    open(create);

    expect(openDispatchFormBlocking()).toBe(create);
  });

  it('opens again once the form has closed, and counts the forms that are open', () => {
    const release = open({ kind: 'edit', id: 'd-1' });
    open({ kind: 'create' });
    expect(openDispatchFormCount()).toBe(2);

    release();

    expect(openDispatchFormCount()).toBe(1);
    expect(openDispatchFormBlocking()).not.toBeNull();
    releases.splice(0).forEach((closeForm) => closeForm());
    expect(openDispatchFormBlocking()).toBeNull();
    expect(openDispatchFormCount()).toBe(0);
  });

  it('says where an open form is: the first step of its own route', () => {
    expect(dispatchFormRoute({ kind: 'edit', id: 'd-1' })).toBe('/dispatch-edit/d-1/step1');
    expect(dispatchFormRoute({ kind: 'create' })).toBe('/dispatch-form/step1');
  });
});
