(function(root){
 'use strict';
 const billing=root.ArBillingCore||(typeof require==='function'?require('../automatic-emails/core.js'):null),weekly=root.ArWeeklyReports||(typeof require==='function'?require('../weekly-reports-core.js'):null);
 const cents=billing.cents,amount=billing.amount,shift=billing.shift,days=billing.days;
 const day=(now=new Date())=>billing.localDay(now,'America/Ciudad_Juarez');
 const business=i=>{const s=String(i?.business_line||'').trim().toLowerCase();return ['carton','cartón','cardboard','corrugated','caja','cajas'].includes(s)?'Cartón':['foam','espuma','foams'].includes(s)?'Foam':'Otro';};
 const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
 function sourceAt(data,onDate=day()){
  if(!validDate(onDate))throw Error('Fecha de corte inválida.');
  const before=(r,key)=>!r[key]||r[key]<=onDate;
  return {...data,invoices:(data.invoices||[]).filter(i=>before(i,'invoice_date')),payments:(data.payments||[]).filter(p=>before(p,'payment_date')),localPayments:(data.localPayments||[]).filter(p=>before(p,'payment_date')),receipts:(data.receipts||[]).filter(p=>before(p,'payment_date')),creditNotes:(data.creditNotes||[]).filter(p=>before(p,'date'))};
 }
 function mergedPayments(data){return [...new Map([...(data.payments||[]),...(data.localPayments||[])].filter(p=>p.id).map(p=>[p.id,p])).values()];}
 function accounts(data,onDate=day()){const s=sourceAt(data,onDate);return billing.buildLedger(s.customers||[],s.invoices||[],s.payments||[],s,onDate);}
 function commitments(data,onDate=day()){return billing.commitmentLedger(sourceAt(data,onDate),onDate);}
 function behavior(data,activities=[],onDate=day()){
  const s=sourceAt(data,onDate),byInvoice=new Map(),result=new Map((s.customers||[]).map(c=>[c.id,{customer_id:c.id,settled:0,totalDays:0,avgDays:null,promisesDue:0,promisesFulfilled:0,promiseRate:null,lastActivity:null}]));
  for(const p of mergedPayments(s)){if(cents(p.amount)>0&&validDate(p.payment_date)){const list=byInvoice.get(p.invoice_id)||[];list.push(p);byInvoice.set(p.invoice_id,list);}}
  for(const i of s.invoices||[]){const b=result.get(i.customer_id);if(!b||i.status==='cancelada'||cents(i.total)<=0||!validDate(i.invoice_date))continue;let paid=0;for(const p of (byInvoice.get(i.id)||[]).filter(p=>!p.currency||p.currency===i.currency).sort((a,b)=>a.payment_date.localeCompare(b.payment_date))){paid+=cents(p.amount);if(paid>=cents(i.total)){if(p.payment_date>=i.invoice_date){b.settled++;b.totalDays+=days(p.payment_date,i.invoice_date);}break;}}}
  for(const o of commitments(s,onDate)){const b=result.get(o.customer_id);if(!b||o.plan.cancelled_at||!validDate(o.scheduled_date)||o.scheduled_date>onDate)continue;b.promisesDue++;if(o.remaining===0)b.promisesFulfilled++;}
  for(const a of activities){const b=result.get(a.customer_id);if(!b||a.followup_status==='cancelled'||a.happened_on>onDate)continue;if(!b.lastActivity||(a.happened_on+' '+a.created_at)>(b.lastActivity.happened_on+' '+b.lastActivity.created_at))b.lastActivity=a;}
  for(const b of result.values()){b.avgDays=b.settled?Math.round(b.totalDays/b.settled):null;b.promiseRate=b.promisesDue?Math.round(100*b.promisesFulfilled/b.promisesDue):null;}
  return result;
 }
 function agenda(data,activities=[],onDate=day(),currency='MXN',performance=null,ledger=null){
  const result=[],perf=performance||behavior(data,activities,onDate),invoices=new Map((data.invoices||[]).map(i=>[i.id,i]));
  for(const a of ledger||accounts(data,onDate)){const open=a.open.filter(i=>i.currency===currency),debt=open.reduce((n,i)=>n+cents(i.balance),0),late=open.filter(i=>i.late>0),promises=a.commitments.filter(p=>p.currency===currency&&p.scheduled_date<=onDate),broken=promises.filter(p=>p.scheduled_date<onDate),todayPromises=promises.filter(p=>p.scheduled_date===onDate),last=perf.get(a.customer.id)?.lastActivity;
   const tasks=activities.filter(t=>t.customer_id===a.customer.id&&t.followup_status==='open'&&t.next_contact_on&&(!t.invoice_id||invoices.get(t.invoice_id)?.currency===currency)),due=tasks.filter(t=>t.next_contact_on<=onDate),unattendedLate=late.filter(i=>!tasks.some(t=>t.next_contact_on>onDate&&(!t.invoice_id||t.invoice_id===i.id))),maxLate=Math.max(0,...late.map(i=>i.late)),reasons=[];
   if(broken.length)reasons.push(broken.length+' promesa(s) vencida(s)');if(todayPromises.length)reasons.push(todayPromises.length+' promesa(s) para hoy');if(due.length)reasons.push(due.length+' seguimiento(s) pendiente(s)');
   if(unattendedLate.length)reasons.push(unattendedLate.length+' factura(s) vencida(s) · hasta '+Math.max(...unattendedLate.map(i=>i.late))+' días');
   if(unattendedLate.length&&(!last||days(onDate,last.happened_on)>=7))reasons.push(last?'Sin gestión en los últimos 7 días':'Sin gestión registrada');
   if(!reasons.length)continue;const priority=broken.length?100:due.length?90:todayPromises.length?80:maxLate>=60?70:50;
   result.push({customer:a.customer,currency,debt:amount(debt),overdue:amount(late.reduce((n,i)=>n+cents(i.balance),0)),reasons,priority,maxLate,lastActivity:last,nextContact:due.map(t=>t.next_contact_on).sort()[0]||null});
  }
  return result.sort((a,b)=>b.priority-a.priority||b.maxLate-a.maxLate||b.overdue-a.overdue||a.customer.legal_name.localeCompare(b.customer.legal_name));
 }
 function forecast(data,onDate=day(),ledger=null){
  const rows=[],unconfirmed=[],outside=[],all=ledger||accounts(data,onDate),end=shift(onDate,30);
  for(const a of all){const open=a.open.map(i=>({...i,left:cents(i.balance)})),byId=new Map(open.map(i=>[i.id,i]));
   const add=(invoice,value,date,category,promiseId=null,general=false)=>{if(value<=0)return;const row={customer_id:a.customer.id,customer_name:a.customer.legal_name,invoice_id:invoice.id,invoice_number:invoice.invoice_number,currency:invoice.currency,business:business(invoice),date,category,amount:amount(value),promise_id:promiseId,general};(date<onDate?unconfirmed:date>end?outside:rows).push(row);};
   for(const p of [...a.commitments].sort((x,y)=>x.scheduled_date.localeCompare(y.scheduled_date))){if(!validDate(p.scheduled_date))continue;let left=cents(p.remaining);const candidates=p.invoice_id?[byId.get(p.invoice_id)].filter(Boolean):open;for(const i of candidates){if(i.currency!==p.currency)continue;const take=Math.min(left,i.left);add(i,take,p.scheduled_date,'Promesa',p.id,!p.invoice_id);i.left-=take;left-=take;if(!left)break;}}
   for(const i of open)if(i.left>0)add(i,i.left,validDate(i.due_date)?i.due_date:shift(onDate,-1),'Estimación');
  }
  const buckets=[7,15,30].map(horizon=>({horizon,...Object.fromEntries(['MXN','USD'].map(currency=>{const selected=rows.filter(r=>r.currency===currency&&days(r.date,onDate)<=horizon);return [currency,{promised:amount(selected.filter(r=>r.category==='Promesa').reduce((n,r)=>n+cents(r.amount),0)),estimated:amount(selected.filter(r=>r.category==='Estimación').reduce((n,r)=>n+cents(r.amount),0))}];}))}));
  return {onDate,end,rows:rows.sort((a,b)=>a.date.localeCompare(b.date)||a.customer_name.localeCompare(b.customer_name)),unconfirmed,outside,buckets};
 }
 function snapshot(data,onDate=day()){
  const s=sourceAt(data,onDate),groups=new Map(),get=(currency,business)=>{const key=currency+'|'+business;if(!groups.has(key))groups.set(key,{currency,business,debt:0,overdue:0,current:0,d1:0,d31:0,d61:0,invoices:0,received_day:0,received_week:0,received_month:0});return groups.get(key);};
  for(const a of accounts(s,onDate))for(const i of a.open){const g=get(i.currency,business(i)),value=cents(i.balance);g.debt+=value;g.invoices++;g[i.late>60?'d61':i.late>30?'d31':i.late>0?'d1':'current']+=value;if(i.late)g.overdue+=value;}
  const monthStart=onDate.slice(0,7)+'-01',weekStart=weekly.week(onDate).start,starts=new Set([weekStart]);for(let d=weekly.week(monthStart).start;d<=onDate;d=shift(d,7))starts.add(d);
  for(const start of starts)for(const m of weekly.weeklyCollections(s,start).movements){const g=get(m.currency,m.business),value=cents(m.amount);if(m.received_date===onDate)g.received_day+=value;if(m.received_date>=weekStart&&m.received_date<=onDate)g.received_week+=value;if(m.received_date>=monthStart&&m.received_date<=onDate)g.received_month+=value;}
  const rows=[...groups.values()].map(g=>Object.fromEntries(Object.entries(g).map(([k,v])=>[k,typeof v==='number'&&k!=='invoices'?amount(v):v])));
  return {schema:1,date:onDate,week_start:weekStart,month_start:monthStart,rows};
 }
 function history(cuts,period='week',currency='MXN',business='all'){
  const grouped=new Map();for(const c of cuts){if(!validDate(c.snapshot_date)||c.summary?.schema!==1)continue;const d=c.snapshot_date,start=period==='month'?d.slice(0,7)+'-01':period==='day'?d:weekly.week(d).start,end=period==='month'?new Date(Date.UTC(+start.slice(0,4),+start.slice(5,7),0,12)).toISOString().slice(0,10):period==='day'?d:shift(start,6),old=grouped.get(start);if(old&&(old.cut.snapshot_date>d||old.cut.snapshot_date===d&&((old.cut.kind===c.kind?old.cut.captured_at>=c.captured_at:old.cut.kind==='daily'))))continue;const rows=c.summary.rows.filter(r=>r.currency===currency&&(business==='all'||r.business===business)),value=key=>amount(rows.reduce((n,r)=>n+cents(r[key]),0));grouped.set(start,{start,end,cut:c,closed:d===end&&c.kind==='daily',debt:value('debt'),overdue:value('overdue'),current:value('current'),received:value(period==='month'?'received_month':period==='day'?'received_day':'received_week')});}
  return [...grouped.values()].sort((a,b)=>a.start.localeCompare(b.start)).map((r,n,all)=>({...r,debtChange:n?amount(cents(r.debt)-cents(all[n-1].debt)):null,overdueChange:n?amount(cents(r.overdue)-cents(all[n-1].overdue)):null}));
 }
 const api={day,validDate,sourceAt,mergedPayments,accounts,commitments,behavior,agenda,forecast,snapshot,history};root.ArCollectionTools=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
