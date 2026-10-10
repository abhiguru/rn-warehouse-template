/**
 * The supervisor picker keeps a colleague's id and name. `get_supervisors`
 * also answers with every person's mobile number, which is not needed to pick
 * a name and must not reach the list.
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

  it('is empty for an answer with no rows', () => {
    expect(toSupervisors(null)).toEqual([]);
    expect(toSupervisors({ success: false, message: 'refused' })).toEqual([]);
  });
});
