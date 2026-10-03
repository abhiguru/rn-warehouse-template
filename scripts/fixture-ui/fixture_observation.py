"""Decode only nonsecret, bounded observer results; never retain child output."""
import json


def decode_observation(returncode, output):
    try:
        result = json.loads(output)
        assert isinstance(result, dict)
        status = result['status']
        assert status in ['PASS', 'WAIT', 'FAIL']
        assert returncode == {'PASS': 0, 'WAIT': 3, 'FAIL': 2}[status]
        categories = ['NO_ORDERS_REQUEST', 'RPC_SERVER_ERROR', 'RPC_AUTH_ERROR',
                      'OBSERVATION_UNAVAILABLE', 'GUARD_OR_WINDOW_REFUSED']
        safe = {'status': status}
        if status != 'PASS':
            assert result['category'] in categories
            safe['category'] = result['category']
        for key in ['successfulOrdersRequests', 'refreshRPCs']:
            if key in result:
                assert type(result[key]) is int and 0 <= result[key] <= 100000
                safe[key] = result[key]
        if 'failedObservedRequests' in result:
            records = result['failedObservedRequests']
            assert isinstance(records, list) and len(records) <= 100000
            safe['failedObservedRequests'] = []
            for record in records:
                assert record['path'] in ['/rest/v1/rpc/get_orders_list', '/rest/v1/rpc/refresh_jwt_token']
                assert type(record['status']) is int and 400 <= record['status'] <= 599
                safe['failedObservedRequests'].append({'path': record['path'], 'status': record['status']})
        if status == 'PASS':
            assert safe.get('successfulOrdersRequests', 0) > 0
        if status == 'WAIT':
            assert safe['category'] == 'NO_ORDERS_REQUEST' and safe.get('successfulOrdersRequests') == 0
        return safe
    except (ValueError, TypeError, KeyError, AssertionError):
        return {'status': 'FAIL', 'category': 'INVALID_OBSERVER_RESULT'}
