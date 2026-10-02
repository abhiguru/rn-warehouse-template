import assert from 'node:assert/strict';
export function ordersSelectionTimeline(events,since,entered){
 const from=Date.parse(since),selection=Date.parse(entered);assert.ok(Number.isFinite(from)&&Number.isFinite(selection)&&selection>=from);
 const matching=events.filter(x=>x.method==='POST'&&x.path==='/rest/v1/rpc/get_orders_list'&&Date.parse(x.atUTC)>=from);
 const starts=matching.filter(x=>x.event==='orders-delay-start');assert.equal(starts.length,1,'One actual delayed Orders read required');const start=starts[0];assert.equal(start.status,200);assert.equal(start.delayMs,5000);
 const finishes=matching.filter(x=>x.event==='complete'&&Date.parse(x.atUTC)>=Date.parse(start.atUTC));assert.equal(finishes.length,1);const finish=finishes[0];assert.equal(finish.status,200);
 assert.ok(Date.parse(start.atUTC)<selection&&selection<Date.parse(finish.atUTC),'Native selection screen must precede genuine Orders completion');assert.ok(Date.parse(finish.atUTC)-Date.parse(start.atUTC)>=4900&&Date.parse(finish.atUTC)-Date.parse(start.atUTC)<10000);
 return {status:'PASS',requestStartedUTC:start.atUTC,selectionEnteredUTC:entered,responseCompletedUTC:finish.atUTC,delayMs:5000,path:start.path};
}
