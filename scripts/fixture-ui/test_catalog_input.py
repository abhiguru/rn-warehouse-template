import unittest
from catalog_input import enter_catalog_record

class CatalogInputTest(unittest.TestCase):
    def test_waits_for_controlled_updates_without_resending(self):
        sent=[];visible=[''];pending=[];ticks=[0]
        def current():
            if pending:
                ticks[0]+=1
                if ticks[0]%3==0: visible[0]+=pending.pop(0)
            return visible[0]
        def send(char):sent.append(char);pending.append(char)
        now=[0]
        enter_catalog_record('FXC702',current,send,lambda:now[0],lambda duration:now.__setitem__(0,now[0]+duration))
        self.assertEqual(''.join(sent),'FXC702');self.assertEqual(visible[0],'FXC702')
    def test_lost_character_stops_without_replay(self):
        sent=[];now=[0]
        with self.assertRaisesRegex(AssertionError,'no text replay'):
            enter_catalog_record('FXC701',lambda:'',sent.append,lambda:now[0],lambda duration:now.__setitem__(0,now[0]+duration))
        self.assertEqual(sent,['F'])
    def test_wrong_record_refused_before_input(self):
        sent=[]
        with self.assertRaises(AssertionError):enter_catalog_record('production',lambda:'',sent.append)
        self.assertEqual(sent,[])
    def test_uncleared_field_refused_before_input(self):
        sent=[];now=[0]
        with self.assertRaises(AssertionError):enter_catalog_record('FXC701',lambda:'FXC702',sent.append,lambda:now[0],lambda duration:now.__setitem__(0,now[0]+duration))
        self.assertEqual(sent,[])

if __name__=='__main__':unittest.main()
