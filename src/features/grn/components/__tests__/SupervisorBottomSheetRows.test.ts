/**
 * The supervisor picker keeps a colleague's id and name. `get_supervisors`
 * answers with the mobile number as well for an administrator or supervisor
 * (backend migration 47; before it, for everyone); it is not needed to pick a
 * name and must not reach the list. Staff get rows without one.
 */
import { toSupervisors } from '../SupervisorBottomSheet';

jest.mock('@/config/supabaseConfig', () => ({ getAuthenticatedClient: jest.fn() }));
jest.mock('@/components/common', () => ({ SearchableBottomSheet: () => null }));
jest.mock('@/components/ui', () => ({ Avatar: () => null }));
jest.mock('@/hooks/useTheme', () => ({ useThemedStyles: jest.fn() }));

const rows = [
  { id: 'user-1', name: 'Fictional Supervisor', phone: '9000000001' },
  { user_id: 'user-2', full_name: 'Fictional Staff', phone_number: '919000000002', mobile: '9000000002' },
];

describe('toSupervisors', () => {
  it.each([
    ['a bare list', rows],
    ['{ data: [...] }', { success: true, data: rows }],
    ['{ supervisors: [...] }', { supervisors: rows }],
  ])('reads %s as id and name only', (_shape, answer) => {
    expect(toSupervisors(answer)).toEqual([
      { id: 'user-1', name: 'Fictional Supervisor' },
      { id: 'user-2', name: 'Fictional Staff' },
    ]);
  });

  // Backend migration 47: `{ id, name, display_name, role }` for staff.
  it('reads rows that carry no mobile number', () => {
    const withoutPhone = [
      { id: 'user-1', name: 'Fictional Supervisor', display_name: 'Supervisor F.', role: 'supervisor' },
      { id: 'user-2', name: '', display_name: 'Fictional Staff', role: 'staff' },
    ];
    const read = toSupervisors({ success: true, data: withoutPhone });
    expect(read).toEqual([
      { id: 'user-1', name: 'Fictional Supervisor' },
      { id: 'user-2', name: 'Fictional Staff' },
    ]);
    expect(JSON.stringify(read)).not.toContain('undefined');
  });

  it('is empty for an answer with no rows', () => {
    expect(toSupervisors(null)).toEqual([]);
    expect(toSupervisors({ success: false, message: 'refused' })).toEqual([]);
  });
});
