import assert from 'node:assert/strict';
export function confirmedOrdersSwitchTimeline(c,native,events){
 assert.equal(c.confirmedOrdersResponseSwitch,true);assert.match(c.confirmedReadAttemptId,/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);assert.equal(native.confirmedReadAttemptId,c.confirmedReadAttemptId);assert.equal(c.confirmedDraftSwitchBack===true,false);
 const since=Date.parse(native.readRequestedUTC),confirmation=Date.parse(native.confirmationAttemptUTC);assert.ok(Number.isFinite(since)&&Number.isFinite(confirmation)&&since<confirmation);
 const rows=events.filter(e=>e.confirmedReadAttemptId===c.confirmedReadAttemptId&&e.path==='/rest/v1/rpc/get_orders_list'&&e.method==='POST'&&Date.parse(e.atUTC)>=since);
 const starts=rows.filter(e=>e.event==='confirmed-orders-delay-start');assert.equal(starts.length,1);const start=starts[0];assert.equal(start.status,200);assert.equal(start.delayMs,30000);assert.equal(start.authorizationPresent,true);assert.equal(start.credentialQueryPresent,false);assert.ok(Date.parse(start.atUTC)<confirmation);
 const ends=rows.filter(e=>['complete','client-response-closed','client-request-aborted','upstream-timeout','upstream-unavailable','upstream-response-aborted','upstream-response-error'].includes(e.event));assert.equal(ends.length,1);const end=ends[0];assert.ok(Date.parse(end.atUTC)>confirmation,'CONFIRMATION_MUST_PRECEDE_SETTLEMENT');
 const delivered=end.event==='complete'&&end.status===200,cancelled=['client-response-closed','client-request-aborted'].includes(end.event)&&end.status===499;assert.ok(delivered||cancelled,'AMBIGUOUS_READ_SETTLEMENT');
 if(delivered)assert.ok(Date.parse(end.atUTC)-Date.parse(start.atUTC)>=29900&&Date.parse(end.atUTC)-Date.parse(start.atUTC)<45000);
 return {status:'PASS',scope:'confirmed-switch-during-authenticated-orders-read',requestStartedUTC:start.atUTC,confirmationAttemptUTC:native.confirmationAttemptUTC,settledUTC:end.atUTC,settlement:delivered?'delivered-after-confirmation':'cancelled-during-switch',lateDelivery:delivered};
}
