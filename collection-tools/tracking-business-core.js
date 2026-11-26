(function(root){
 'use strict';
 const weekly=root.ArWeeklyReports||(typeof require==='function'?require('../weekly-reports-core.js'):null),cents=n=>Math.round((Number(n)||0)*100),amount=n=>n/100;
 const business=value=>value==='all'||!value?'all':weekly.business({business_line:value});
 const matches=(invoice,selected)=>selected==='all'||weekly.business(invoice)===selected;
 function cashHistory(source,day,selected='all',cachedCollections=null){
  const report=cachedCollections||weekly.collectionsInRange(source,'0001-01-01',day),records=new Map(),byCustomer=new Map();
  for(const r of source.receipts||[])if(r.id)records.set('receipt:'+r.id,r);
  for(const r of [...(source.payments||[]),...(source.localPayments||[])])if(r.id)records.set('payment:'+r.id,r);
  for(const movement of report.movements){
   if(selected!=='all'&&movement.business!==selected)continue;
   const key=movement.customer_id+'|'+movement.currency,list=byCustomer.get(key)||new Map(),old=list.get(movement.id);
   if(old)old.cents+=cents(movement.amount);
   else{const record=records.get(movement.id)||{};list.set(movement.id,{id:movement.id,date:movement.received_date,cents:cents(movement.amount),recorded_at:record.ar_recorded_at||record.created_at||'',source:movement.source});}
   byCustomer.set(key,list);
  }
  return new Map([...byCustomer].map(([key,list])=>[key,[...list.values()].sort((a,b)=>b.date.localeCompare(a.date)||String(b.recorded_at).localeCompare(String(a.recorded_at))||b.id.localeCompare(a.id)).map(r=>({id:r.id,date:r.date,amount:amount(r.cents),source:r.source}))]));
 }
 const api={business,matches,cashHistory};root.ArTrackingBusiness=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
