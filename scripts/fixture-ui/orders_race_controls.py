"""Redacted response-event accounting for a settled startup read baseline."""
def orders_read_settlement(events):
 pending=0;last_start=None;last_complete=None
 for x in events:
  if x.get('method')!='POST' or x.get('path')!='/rest/v1/rpc/get_orders_list':continue
  if x.get('event')=='orders-delay-start':
   assert x.get('status')==200 and x.get('delayMs')==5000;pending+=1;last_start=x['atUTC']
  elif x.get('event') in ['complete','client-response-closed','upstream-timeout','upstream-response-error','upstream-response-aborted']:
   if pending:pending-=1
   if x.get('event')=='complete' and x.get('status')==200:last_complete=x['atUTC']
 return {'settled':pending==0 and last_start is not None and last_complete is not None and last_complete>=last_start,'pending':pending,'lastStartUTC':last_start,'lastCompleteUTC':last_complete}
