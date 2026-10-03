import json
import unittest
from fixture_observation import decode_observation


class ObservationTests(unittest.TestCase):
    def test_missing_request_is_wait_but_failed_observer_is_fatal(self):
        wait = {'status': 'WAIT', 'category': 'NO_ORDERS_REQUEST', 'successfulOrdersRequests': 0}
        self.assertEqual(decode_observation(3, json.dumps(wait)), wait)
        failure = {'status': 'FAIL', 'category': 'OBSERVATION_UNAVAILABLE'}
        self.assertEqual(decode_observation(2, json.dumps(failure)), failure)

    def test_malformed_or_mismatched_results_never_become_pass(self):
        for status, output in [(0, 'private-token'), (0, '{"status":"PASS"}'),
                               (0, '{"status":"WAIT"}'), (2, '{"status":"PASS","successfulOrdersRequests":1}')]:
            self.assertEqual(decode_observation(status, output), {'status': 'FAIL', 'category': 'INVALID_OBSERVER_RESULT'})

    def test_arbitrary_child_fields_and_query_tokens_are_never_retained(self):
        d = {'status': 'PASS', 'successfulOrdersRequests': 1, 'raw': 'private-token'}
        self.assertEqual(decode_observation(0, json.dumps(d)), {'status': 'PASS', 'successfulOrdersRequests': 1})
        d['failedObservedRequests'] = [{'path': '/rest/v1/rpc/get_orders_list?apikey=private-token', 'status': 401}]
        self.assertEqual(decode_observation(0, json.dumps(d))['category'], 'INVALID_OBSERVER_RESULT')


if __name__ == '__main__':
    unittest.main()
