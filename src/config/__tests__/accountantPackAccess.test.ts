/**
 * WH-158 (contract section 7): who is offered the accountant pack and the Accountant export screen, the routes that guard them, the
 * backend gate (migration 201, the one that adds get_accountant_pack), and Settings > Warehouse tools. Written BEFORE the build:
 * fails today because none of it exists.
 */
import { backendHasFeature, resetFacilityRelease, setFacilityRelease } from '../backendFeatures';
import { canOpenScreen, settingsFeatureRows } from '../roles';
import { decideRoute } from '@/navigation/routeAccess';

let mockActive: { origin: string; instanceId: string } | null = null;
jest.mock('../operatorServer', () => ({ getActiveOperatorServer: () => mockActive }));
const one = { origin: 'https://one.example.test', instanceId: 'instance-0001' };

const ROLES = ['admin', 'supervisor', 'staff', 'customer'];
const as = (role: string) => ({ isSignedIn: true, role });

beforeEach(() => { resetFacilityRelease(); mockActive = one; });

it('[crit 9] the accountant pack screen is for administrators and supervisors; Accountant export for administrators only', () => {
  expect(ROLES.map(role => canOpenScreen(role, 'accountantPack' as never))).toEqual([true, true, false, false]);
  expect(ROLES.map(role => canOpenScreen(role, 'accountantExport' as never))).toEqual([true, false, false, false]);
  expect(canOpenScreen(null, 'accountantPack' as never)).toBe(false);
  expect(canOpenScreen(undefined, 'accountantExport' as never)).toBe(false);
});

it('[crit 9] the routes are guarded by the same gates: staff and customers are sent home', () => {
  expect(ROLES.map(role => decideRoute('reports/accountant-pack', as(role)))).toEqual(['allow', 'allow', 'home', 'home']);
  expect(ROLES.map(role => decideRoute('accountant-export', as(role)))).toEqual(['allow', 'home', 'home', 'home']);
  expect(decideRoute(['reports', 'accountant-pack'], { isSignedIn: false })).toBe('login');
  expect(decideRoute('accountant-export', { isSignedIn: false })).toBe('login');
});

it('Settings > Warehouse tools lists accountantExport for administrators only, right after gstDetails', () => {
  const rows = settingsFeatureRows('admin') as string[];
  expect(rows.indexOf('accountantExport')).toBe(rows.indexOf('gstDetails') + 1);
  for (const role of ['supervisor', 'staff', 'customer']) expect(settingsFeatureRows(role) as string[]).not.toContain('accountantExport');
});

it('the gate accountantPack starts at migration 201 (get_accountant_pack), not 200', () => {
  setFacilityRelease(one, { schemaHead: '00000000000200_accountant_export_settings' });
  expect(backendHasFeature('accountantPack' as never)).toBe(false);
  setFacilityRelease(one, { schemaHead: '00000000000201_accountant_pack_read' });
  expect(backendHasFeature('accountantPack' as never)).toBe(true);
  setFacilityRelease(one, { schemaHead: '00000000000199_facility_details' });
  expect(backendHasFeature('accountantPack' as never)).toBe(false);
});
