import unittest
from dispatch_case_cleanup import cleanup_case


class Cleanup(unittest.TestCase):
    def fixture(self, record='FXF901', state='DROPPED_BEFORE_UPSTREAM', route=18643, fail_save=False, fail_disarm=False, fail_restore=False):
        calls = []; saved = []; current = [route]
        def control(command):
            calls.append(command['action'])
            if command['action'] == 'status':
                return {'state':state, 'record':record, 'phase':'before-upstream', 'path':'/rest/v1/rpc/create_dispatch_with_stock_check'}
            if command['action'] == 'observations': return {'observations':[], 'overflow':False}
            if fail_disarm: raise RuntimeError('No control reply')
            return {'state':'DISARMED'}
        def adb(*args):
            calls.append(args)
            if args == ('reverse','--list'): return 'UsbFfs tcp:443 tcp:'+str(current[0])
            if fail_restore: raise RuntimeError('Reverse change refused')
            current[0] = 18443
        def save(name, data):
            if fail_save: raise RuntimeError('Evidence cannot be preserved')
            saved.append((name,data))
        return control, adb, save, calls, saved

    def run_case(self, f, route_verified=True, touched=True):
        return cleanup_case(route_verified,touched,'FXF901','before-upstream',*f[:3])

    def test_success_preserves_control_before_disarming_and_restores_owned_route(self):
        f=self.fixture(); r=self.run_case(f)
        self.assertEqual(r['status'],'PASS'); self.assertTrue(r['normalRouteRestored']); self.assertTrue(f[4])
        self.assertEqual(f[3][:3],['status','observations','disarm'])

    def test_no_route_change_before_ownership_verified(self):
        f=self.fixture(); r=self.run_case(f,False,False)
        self.assertEqual(f[3],[]); self.assertFalse(r['normalRouteRestored'])

    def test_changed_route_is_not_overwritten(self):
        f=self.fixture(route=18590); r=self.run_case(f)
        self.assertEqual(r['status'],'FAIL'); self.assertNotIn(('reverse','tcp:443','tcp:18443'),f[3])

    def test_another_fault_is_not_disarmed(self):
        f=self.fixture(record='FXF902'); r=self.run_case(f)
        self.assertEqual(r['status'],'FAIL'); self.assertNotIn('disarm',f[3])
        self.assertNotIn(('reverse','tcp:443','tcp:18443'),f[3])

    def test_inflight_fault_keeps_route_and_arm_for_reconciliation(self):
        f=self.fixture(state='MATCHED'); r=self.run_case(f)
        self.assertEqual(r['status'],'FAIL'); self.assertNotIn('disarm',f[3])
        self.assertNotIn(('reverse','tcp:443','tcp:18443'),f[3])
        self.assertNotIn(('reverse','tcp:443','tcp:18443'),f[3])

    def test_failed_evidence_preservation_does_not_erase_fault(self):
        f=self.fixture(fail_save=True); r=self.run_case(f)
        self.assertEqual(r['status'],'FAIL'); self.assertNotIn('disarm',f[3])
        self.assertNotIn(('reverse','tcp:443','tcp:18443'),f[3])

    def test_cleanup_errors_remain_fail(self):
        for kwargs in [{'fail_disarm':True},{'fail_restore':True}]:
            f=self.fixture(**kwargs); self.assertEqual(self.run_case(f)['status'],'FAIL')


if __name__ == '__main__': unittest.main()
