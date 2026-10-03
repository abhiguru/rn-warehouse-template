import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {resolve} from 'node:path';
import {privateJSON} from './fixture-session-guards.mjs';import {navigationConfig,customerOrdersSelectionRaceMode} from './fixture-navigation-guards.mjs';import {ordersSelectionTimeline} from './fixture-orders-race-controls.mjs';
try{
 const c=navigationConfig(privateJSON(process.argv[2]));assert.equal(customerOrdersSelectionRaceMode(c),true);
 const screen=privateJSON(resolve(c.caseDirectory,'race-screen.json'));assert.equal(screen.selectionScreenVisible,true);
 const log=readFileSync(c.helperLog,'utf8');assert.ok(Buffer.byteLength(log)<=1048576);
 const events=log.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
 console.log(JSON.stringify(ordersSelectionTimeline(events,screen.requestSinceUTC,screen.selectionEnteredUTC)));
}catch{console.error('{"status":"FAIL","category":"GENUINE_ORDERS_RACE_NOT_PROVEN"}');process.exitCode=1;}
