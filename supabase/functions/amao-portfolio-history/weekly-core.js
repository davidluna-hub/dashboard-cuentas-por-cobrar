(function(root){
 'use strict';
 const cents=n=>Math.round((Number(n)||0)*100),amount=n=>n/100;
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Ciudad_Juarez',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const shift=(d,n)=>{const t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);};
 function week(anchor=today()){
  const d=new Date(anchor+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(anchor)||Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==anchor)throw Error('Selecciona una fecha válida.');
  const start=shift(anchor,-((d.getUTCDay()+6)%7)),end=shift(start,6),year=new Date(shift(start,3)+'T12:00:00Z').getUTCFullYear(),jan4=year+'-01-04',firstMonday=shift(jan4,-((new Date(jan4+'T12:00:00Z').getUTCDay()+6)%7));
  return {start,end,number:1+Math.round((Date.parse(start+'T12:00:00Z')-Date.parse(firstMonday+'T12:00:00Z'))/604800000),year};
 }
 function business(invoice){const s=String(invoice?.business_line||'').trim().toLowerCase();return ['carton','cartón','cardboard','corrugated','caja','cajas'].includes(s)?'Cartón':['foam','espuma','foams'].includes(s)?'Foam':'Otro';}
 function weeklyCollections({invoices=[],payments=[],localPayments=[],receipts=[]}={},anchor=today()){
  const period=week(anchor),inside=d=>d&&d>=period.start&&d<=period.end,byInvoice=new Map(invoices.map(i=>[i.id,i])),merged=new Map();
  [...payments,...localPayments].forEach((p,n)=>merged.set(p.id||'row-'+n,p));
  const applications=[...merged.values()],cashMap=new Map(receipts.map((r,n)=>[r.id||'receipt-'+n,r])),movements=[],warnings=[],cashIds=new Set();
  const add=(record,invoice,value,category,source,cashId)=>{if(value<=0)return;movements.push({id:cashId,received_date:record.payment_date,customer_id:record.customer_id||invoice?.customer_id||'',invoice_number:invoice?.invoice_number||'',business:category,currency:record.currency,amount:amount(value),source});cashIds.add(cashId);};
  for(const [id,r]of cashMap){
   if(!inside(r.payment_date))continue;
   if(!['MXN','USD'].includes(r.currency)){warnings.push('Ingreso sin moneda válida: '+id);continue;}
   let left=Math.max(0,cents(r.amount));
   const assigned=applications.filter(p=>p.receipt_id===id||!p.receipt_id&&p.credit_batch_id===id).sort((a,b)=>String(a.payment_date||'').localeCompare(String(b.payment_date||''))||String(a.id||'').localeCompare(String(b.id||'')));
   for(const p of assigned){const invoice=byInvoice.get(p.invoice_id),currency=p.currency||invoice?.currency;if(currency&&currency!==r.currency){warnings.push('Aplicación con moneda distinta al ingreso: '+(p.id||id));continue;}const n=Math.max(0,cents(p.amount)),take=Math.min(left,n);add(r,invoice,take,invoice?business(invoice):'Sin clasificar','Ingreso aplicado','receipt:'+id);left-=take;if(n>take)warnings.push('Las aplicaciones superan el ingreso: '+id);}
   add(r,null,left,'Anticipos sin aplicar','Saldo recibido sin aplicar','receipt:'+id);
  }
  for(const p of applications){
   if(p.receipt_id||p.credit_batch_id){const id=p.receipt_id||p.credit_batch_id;if(!cashMap.has(id)&&inside(p.payment_date))warnings.push('Aplicación sin ingreso original disponible: '+(p.id||id));continue;}
   if(!inside(p.payment_date))continue;
   const invoice=byInvoice.get(p.invoice_id),currency=p.currency||invoice?.currency;
   if(!['MXN','USD'].includes(currency)){warnings.push('Pago histórico sin moneda válida: '+(p.id||''));continue;}
   add({...p,currency},invoice,Math.max(0,cents(p.amount)),invoice?business(invoice):'Sin clasificar','Pago histórico','payment:'+(p.id||applications.indexOf(p)));
  }
  const categories=['Cartón','Foam','Otro','Anticipos sin aplicar','Sin clasificar'],rows=categories.map(name=>({business:name,mxn:amount(movements.filter(m=>m.business===name&&m.currency==='MXN').reduce((n,m)=>n+cents(m.amount),0)),usd:amount(movements.filter(m=>m.business===name&&m.currency==='USD').reduce((n,m)=>n+cents(m.amount),0))})).filter(r=>['Cartón','Foam'].includes(r.business)||r.mxn||r.usd);
  return {period,rows,movements,totals:{MXN:amount(rows.reduce((n,r)=>n+cents(r.mxn),0)),USD:amount(rows.reduce((n,r)=>n+cents(r.usd),0))},receiptCount:cashIds.size,warnings:[...new Set(warnings)]};
 }
 function promisePublication(details,customers,anchor=today(),status='pending'){
  const period=week(anchor),names=new Map(customers.map(c=>[c.id,c.legal_name]));
  const rows=details.filter(p=>!p.plan?.cancelled_at&&p.state!=='cancelled'&&p.scheduled_date>=period.start&&p.scheduled_date<=period.end&&(status==='all'||status==='fulfilled'&&p.state==='fulfilled'||status==='overdue'&&p.state==='overdue'||status==='pending'&&p.state!=='fulfilled')).map(p=>({...p,name:names.get(p.customer_id)||'Cliente sin identificar'})).sort((a,b)=>a.scheduled_date.localeCompare(b.scheduled_date)||a.name.localeCompare(b.name)||String(a.id).localeCompare(String(b.id)));
  return {period,rows,totals:promiseTotals(rows)};
 }
 function promiseTotals(rows){return Object.fromEntries(['MXN','USD'].map(currency=>[currency,Object.fromEntries(['amount','applied','remaining'].map(key=>[key,amount(rows.filter(r=>r.currency===currency).reduce((n,r)=>n+cents(r[key]),0))]))]));}
 const api={today,shift,week,weeklyCollections,promisePublication,promiseTotals};root.ArWeeklyReports=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
