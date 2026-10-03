import unittest
from orders_race_controls import orders_read_settlement
class Settlement(unittest.TestCase):
 def start(self,time):return {'method':'POST','path':'/rest/v1/rpc/get_orders_list','event':'orders-delay-start','status':200,'delayMs':5000,'atUTC':time}
 def end(self,time):return {**self.start(time),'event':'complete'}
 def test_second_startup_read_is_not_settled(self):
  events=[self.start('13:22:10'),self.end('13:22:15'),self.start('13:22:16')];self.assertFalse(orders_read_settlement(events)['settled']);self.assertEqual(orders_read_settlement(events)['pending'],1)
  events.append(self.end('13:22:21'));self.assertTrue(orders_read_settlement(events)['settled'])
 def test_concurrency_and_other_routes(self):
  events=[self.start('1'),self.start('2'),self.end('3')];self.assertEqual(orders_read_settlement(events)['pending'],1)
  events.append({**self.end('4'),'path':'/rest/v1/rpc/save_grn'});self.assertFalse(orders_read_settlement(events)['settled'])
  events.append(self.end('5'));self.assertTrue(orders_read_settlement(events)['settled'])
 def test_no_read_and_bad_delay_refuse(self):
  self.assertFalse(orders_read_settlement([])['settled'])
  with self.assertRaises(AssertionError):orders_read_settlement([{**self.start('1'),'delayMs':10000}])
if __name__=='__main__':unittest.main()
