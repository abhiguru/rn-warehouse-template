import {spawnSync} from 'node:child_process';
import test from 'node:test';import assert from 'node:assert/strict';
import {ordersSelectionTimeline} from './fixture-orders-race-controls.mjs';
import {customerOrdersSelectionRaceMode} from './fixture-navigation-guards.mjs';
const events=[{method:'POST',path:'/rest/v1/rpc/get_orders_list',event:'orders-delay-start',atUTC:'2026-10-02T13:00:01Z',status:200,delayMs:5000},{method:'POST',path:'/rest/v1/rpc/get_orders_list',event:'complete',atUTC:'2026-10-02T13:00:06Z',status:200}];
test('Orders race requires genuine start before selection and completion afterward',()=>{
 assert.equal(ordersSelectionTimeline(events,'2026-10-02T13:00:00Z','2026-10-02T13:00:03Z').status,'PASS');
 for(const entered of ['2026-10-02T13:00:01Z','2026-10-02T13:00:06Z','invalid'])assert.throws(()=>ordersSelectionTimeline(events,'2026-10-02T13:00:00Z',entered));
 for(const altered of [[events[0]], [...events,events[0]], [events[0],{...events[1],status:499}], [{...events[0],delayMs:3000},events[1]], [{...events[0],path:'/rest/v1/rpc/save_grn'},events[1]]])assert.throws(()=>ordersSelectionTimeline(altered,'2026-10-02T13:00:00Z','2026-10-02T13:00:03Z'));
});
test('Orders race mode binds exact customer, delay and APK',()=>{
 const c={reservedCustomerOrdersSelectionRace:true,case:'orders-selection-response-race',kind:'native-orders-selection-response-race',profileId:'947136fa-997b-4a83-819d-1b8bd3ecba68',profileName:'New customer',origin:'https://backend-core.example.test',instanceId:'b0ec3933-5258-4bd5-87f4-d57b13a78971',ordersReadDelayMs:5000,artifactSHA256:'08271dada3bf90ed6912db71c0e08f95487a906d12a765bcaa706338bdf12fb7'};assert.equal(customerOrdersSelectionRaceMode(c),true);
 for(const patch of [{case:'cancel-switch'},{ordersReadDelayMs:10000},{profileName:'Customer B'},{artifactSHA256:'a'.repeat(64)},{reservedCustomerOrdersSelectionRace:'true'}])assert.throws(()=>customerOrdersSelectionRaceMode({...c,...patch}));
});

test('startup settlement refuses a second pending read before explicit refresh',()=>{const q=spawnSync('/usr/bin/python3',['-B','-m','unittest','test_orders_race_controls.py'],{cwd:new URL('./fixture-ui/',import.meta.url),encoding:'utf8',timeout:5000});assert.equal(q.status,0,q.stderr);});
