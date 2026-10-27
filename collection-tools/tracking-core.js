(function(root){
 'use strict';
 const tools=root.ArCollectionTools||(typeof require==='function'?require('./core.js'):null),weekly=root.ArWeeklyReports||(typeof require==='function'?require('../weekly-reports-core.js'):null),cents=n=>Math.round((Number(n)||0)*100),amount=n=>n/100;
 const key=(id,currency)=>id+'|'+currency;
 const shortDate=d=>tools.validDate(d)?d.slice(8,10)+'-'+d.slice(5,7)+'-'+d.slice(2,4):'';
 const money=n=>n?new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',minimumFractionDigits:2}).format(n):'—';
 function period(day,selection='today',date=null){if(selection==='custom'&&tools.validDate(date))return {start:date,end:date,label:'Fecha específica'};if(selection==='week')return {...weekly.week(day),label:'Esta semana'};return {start:day,end:selection==='next7'?weekly.shift(day,6):day,label:selection==='next7'?'Próximos 7 días':'Hoy'};}
 function report(data,activities=[],options={}){
  const day=options.day||tools.day(),range=period(day,options.period||'today',options.date),mode=options.mode==='received'?'received':'agreed',inside=d=>d&&d>=range.start&&d<=range.end,source=tools.sourceAt(data,day),ledger=options.ledger||tools.accounts(source,day),invoices=new Map((data.invoices||[]).map(i=>[i.id,i])),cash=new Map(),starts=new Set();
  for(let d=weekly.week(range.start).start;d<=range.end;d=weekly.shift(d,7))starts.add(d);
  if(mode==='received')for(const start of starts)for(const m of weekly.weeklyCollections(source,start).movements){if(!inside(m.received_date))continue;const k=key(m.customer_id,m.currency),old=cash.get(k)||{value:0,date:null};old.value+=cents(m.amount);if(!old.date||m.received_date>old.date)old.date=m.received_date;cash.set(k,old);}
  const added=new Set(options.added||[]),excluded=new Set(options.excluded||[]),rows=[];
  for(const a of ledger)for(const currency of ['USD','MXN']){
   if(options.currency&&options.currency!=='all'&&options.currency!==currency)continue;
   const k=key(a.customer.id,currency),open=a.open.filter(i=>i.currency===currency),debt=amount(open.reduce((n,i)=>n+cents(i.balance),0)),overdue=amount(open.filter(i=>i.late>0).reduce((n,i)=>n+cents(i.balance),0));
   const notes=activities.filter(t=>t.customer_id===a.customer.id&&t.followup_status!=='cancelled'&&t.happened_on<=day&&(!t.report_currency||t.report_currency===currency)&&(!t.invoice_id||invoices.get(t.invoice_id)?.currency===currency)).sort((x,y)=>y.happened_on.localeCompare(x.happened_on)||String(y.updated_at||y.created_at).localeCompare(String(x.updated_at||x.created_at))||String(y.id).localeCompare(String(x.id)));
   const latest=notes[0],override=notes.find(n=>n.report_currency===currency&&['auto','manual'].includes(n.report_amount_mode)),promises=a.commitments.filter(p=>p.currency===currency&&inside(p.scheduled_date)).sort((x,y)=>x.scheduled_date.localeCompare(y.scheduled_date));
   // Cap suggested agreements to remaining debt; a report override never changes the financial ledger.
   const promised=Math.min(cents(debt),promises.reduce((n,p)=>n+cents(p.remaining),0));
   let value=amount(promised),paymentDate=promises[0]?.scheduled_date||null,origin='Promesas registradas';
   if(mode==='received'){const paid=cash.get(k);value=amount(paid?.value||0);paymentDate=paid?.date||null;origin='Dinero recibido';}
   else if(override?.report_amount_mode==='manual'&&inside(override.report_payment_on)){value=amount(Math.max(0,cents(override.report_amount)));paymentDate=override.report_payment_on;origin='Acuerdo capturado en seguimiento';}
   if(!value)paymentDate=null;
   const rawComment=latest?(latest.report_comment??latest.notes??''):'',comment=rawComment.length>240?rawComment.slice(0,237)+'…':rawComment;
   if(!overdue&&!value&&!added.has(k))continue;
   rows.push({key:k,customer_id:a.customer.id,name:a.customer.legal_name,currency,debt,overdue,payment:value,paymentDate,comment,fullComment:rawComment,origin,latest,override,selected:!excluded.has(k),manuallyAdded:added.has(k),dateComment:[shortDate(paymentDate),comment].filter(Boolean).join('\n')||'SIN COMENTARIO'});
  }
  rows.sort((a,b)=>(a.currency==='USD'?0:1)-(b.currency==='USD'?0:1)||b.overdue-a.overdue||a.name.localeCompare(b.name));
  return {day,range,mode,rows,totals:totals(rows.filter(r=>r.selected))};
 }
 function totals(rows){return Object.fromEntries(['USD','MXN'].map(currency=>[currency,{payment:amount(rows.filter(r=>r.currency===currency).reduce((n,r)=>n+cents(r.payment),0)),overdue:amount(rows.filter(r=>r.currency===currency).reduce((n,r)=>n+cents(r.overdue),0))}]));}
 function publication(report,page=0){
  const selected=report.rows.filter(r=>r.selected),pages=[];for(let n=0;n<selected.length;n+=20)pages.push(selected.slice(n,n+20));if(!pages.length)pages.push([]);const index=Math.max(0,Math.min(pages.length-1,page)),rows=pages[index],sum=totals(rows);
  return {key:'seguimiento_cobranza',title:'Seguimiento de cobranza',subtitle:(report.mode==='received'?'Pagos recibidos':'Pagos acordados')+' · '+shortDate(report.range.start)+(report.range.end!==report.range.start?' al '+shortDate(report.range.end):'')+' · Corte '+shortDate(report.day)+' · Imagen '+(index+1)+' de '+pages.length,headers:['MONEDA','CLIENTE','ABONO / PAGO','VENCIDO','FECHA / COMENTARIO'],widths:[125,395,220,220,408],aligns:['left','left','right','right','left'],rows:rows.map(r=>({cells:[r.currency,r.name,money(r.payment),money(r.overdue),r.dateComment]})),footers:['USD','MXN'].filter(c=>rows.some(r=>r.currency===c)).map(c=>[c,'Total de esta imagen',money(sum[c].payment),money(sum[c].overdue),'']),empty:'No hay clientes seleccionados.',note:(report.mode==='received'?'Abono/pago: dinero recibido en el periodo, incluidos anticipos.':'Abono/pago: importe acordado por cobrar.')+' Vencido: saldo actual al '+shortDate(report.day)+'. Totales de esta imagen, separados por moneda.',index,pages,period:report.range};
 }
 function text(report){const out=['AMAO | Seguimiento de cobranza',(report.mode==='received'?'Pagos recibidos':'Pagos acordados')+' · '+shortDate(report.range.start)+' al '+shortDate(report.range.end),'Vencido al '+shortDate(report.day),'Moneda | Cliente | Abono/Pago | Vencido | Fecha/Comentario',''];for(const r of report.rows.filter(r=>r.selected))out.push([r.currency,r.name,money(r.payment),money(r.overdue),r.dateComment.replace(/\n/g,' · ')].join(' | '));for(const c of ['USD','MXN'])out.push('TOTAL '+c+' | Abono/Pago '+money(report.totals[c].payment)+' | Vencido '+money(report.totals[c].overdue));return out.join('\n');}
 const api={key,shortDate,money,period,report,totals,publication,text};root.ArCollectionTracking=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
