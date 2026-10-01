"""Best-effort cleanup with explicit ownership; never retry a business operation."""
from dispatch_case_controls import owned_reverse_route


def cleanup_case(route_verified, touched_control, record, phase, control, adb, save):
    result = {'status': 'PASS'}
    in_flight = False
    control_settled = not touched_control
    if touched_control:
        try:
            status = control({'action': 'status'})
            in_flight = status.get('state') == 'MATCHED'
            observations = control({'action': 'observations'})
            save('control-before-cleanup', {'status': status, 'observations': observations})
            if status.get('state') == 'DISARMED':
                result['faultDisarmed'] = True
                control_settled = True
            else:
                assert status.get('record') == record and status.get('phase') == phase
                assert status.get('path') == '/rest/v1/rpc/create_dispatch_with_stock_check'
                assert not in_flight, 'Do not disturb an in-flight operation'
                assert control({'action': 'disarm'})['state'] == 'DISARMED'
                result['faultDisarmed'] = True
                control_settled = True
        except Exception:
            result.update(status='FAIL', faultDisarmed=False)
    if route_verified and control_settled and not in_flight:
        try:
            owned_reverse_route(adb('reverse', '--list'), 18643)
            adb('reverse', 'tcp:443', 'tcp:18443')
            owned_reverse_route(adb('reverse', '--list'), 18443)
            result['normalRouteRestored'] = True
        except Exception:
            result.update(status='FAIL', normalRouteRestored=False)
    else:
        result.update(normalRouteRestored=False,
                      routeCleanup=('NOT_ATTEMPTED_IN_FLIGHT' if in_flight else
                                    'NOT_ATTEMPTED_UNSETTLED_CONTROL' if not control_settled else
                                    'NOT_ATTEMPTED_UNVERIFIED_OWNERSHIP'))
    return result
