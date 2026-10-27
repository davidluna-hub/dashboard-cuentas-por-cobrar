(function(root){
 'use strict';
 const cents=v=>Math.round((Number(v)||0)*100),amount=v=>v/100;
 const money=(v,c)=>new Intl.NumberFormat('es-MX',{style:'currency',currency:c,minimumFractionDigits:2}).format(v||0);
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const days=(a,b)=>Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000);
 const shift=(d,n)=>{const t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);};
 function localDay(now=new Date(),zone='America/Ciudad_Juarez'){return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
 function profile(c){try{const p=JSON.parse(c.notes||'{}');return p.amao_customer_profile===1?p:{};}catch{return {};}}
 function recipients(c,settings={}){
  const p=profile(c),values=[...(settings.include_main===false?[]:[c.email]),...(p.contacts||[]).filter(x=>x.receive_reminders!==false).map(x=>x.email)];
  return [...new Set(values.flatMap(x=>String(x||'').split(/[;,\s]+/)).map(x=>x.trim().toLowerCase()).filter(x=>/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(x)))];
 }
 const mailDefaults={sender:'',cc:''};
 function mailRouting(addresses,sender=mailDefaults.sender,copy=mailDefaults.cc){
  const to=[...new Set(addresses.map(a=>String(a||'').trim().toLowerCase()).filter(Boolean))];
  return {from:sender||mailDefaults.sender,to,cc:copy&&!to.includes(copy.toLowerCase())?[copy]:[]};
 }
 function buildLedger(customers,invoices,basePayments,state={},onDate=localDay()){
  const merged=new Map();for(const p of [...basePayments,...(state.localPayments||[])])if(p.id)merged.set(p.id,p);
  const payments=[...merged.values()],paid=new Map(),credited=new Map(),byId=new Map(invoices.map(i=>[i.id,i])),lastPayment=new Map();
  for(const p of payments)paid.set(p.invoice_id,(paid.get(p.invoice_id)||0)+Math.max(0,cents(p.amount)));
  for(const p of payments)if(cents(p.amount)>0&&p.payment_date&&p.payment_date>(lastPayment.get(p.invoice_id)||''))lastPayment.set(p.invoice_id,p.payment_date);
  for(const n of state.creditNotes||[])if(!n.cancelled_at)for(const a of n.allocations||[])credited.set(a.invoice_id,(credited.get(a.invoice_id)||0)+Math.max(0,cents(a.amount)));
  const terms=id=>(state.creditSettings||[]).find(x=>x.customer_id===id)||{credit_days:30,limit_mxn:null,limit_usd:null};
  const rows=invoices.filter(i=>i.status!=='cancelada').map(i=>{
   const due=i.due_date||shift(i.invoice_date,Number(terms(i.customer_id).credit_days)||0),p=paid.get(i.id)||0,n=credited.get(i.id)||0;
   return {...i,due_date:due,paid:amount(p),credited:amount(n),balance:amount(Math.max(0,cents(i.total)-p-n)),late:Math.max(0,days(onDate,due)),last_payment_date:lastPayment.get(i.id)||null};
  });
  return customers.map(customer=>{
   const all=rows.filter(i=>i.customer_id===customer.id),open=all.filter(i=>i.balance>0).sort((a,b)=>String(a.due_date).localeCompare(String(b.due_date))||String(a.invoice_number).localeCompare(String(b.invoice_number))),setting=terms(customer.id);
   const currencies=['MXN','USD'].map(currency=>{
    const r=all.filter(i=>i.currency===currency),cash=(state.receipts||[]).filter(x=>x.customer_id===customer.id&&x.currency===currency),applied=payments.filter(p=>byId.get(p.invoice_id)?.customer_id===customer.id&&(p.currency||byId.get(p.invoice_id)?.currency)===currency),debt=centsSum(r,'balance'),rawLimit=setting[currency==='MXN'?'limit_mxn':'limit_usd'],limit=rawLimit===null||rawLimit===undefined||rawLimit===''?null:Number(rawLimit);
    const legacy=applied.filter(p=>!p.receipt_id),credit=cash.reduce((n,x)=>n+Math.max(0,cents(x.amount)-payments.filter(p=>p.receipt_id===x.id).reduce((v,p)=>v+cents(p.amount),0)),0);
    return {currency,debt:amount(debt),overdue:amount(centsSum(r.filter(i=>i.late>0),'balance')),received:amount(centsSum(cash,'amount')+centsSum(legacy,'amount')),applied:amount(centsSum(applied,'amount')),credit:amount(credit),limit,excess:limit===null?0:amount(Math.max(0,debt-cents(limit))),maxLate:Math.max(0,...r.filter(i=>i.balance>0).map(i=>i.late)),last_received_date:[...cash,...legacy].map(p=>p.payment_date||'').sort().at(-1)||null};
   }).filter(a=>a.debt>0||a.received>0||a.applied>0||a.credit>0);
   return {customer,terms:setting,all,open,currencies,onDate,commitments:statementCommitments(customer.id,open,state,onDate)};
  });
 }
 function centsSum(rows,key){return rows.reduce((n,r)=>n+cents(r[key]),0);}
 function reminders(account,state={},onDate=account.onDate){
  const global=state.reminderSettings||{},s=(state.reminderCustomers||{})[account.customer.id]||{};
  if(account.customer.active===false||s.paused||!account.open.length)return null;
  const dueDays=bounded(global.due_days,7,0,60),holdLead=bounded(global.hold_lead_days,7,0,60),holdDays=bounded(state.holdPreferences?.days,60,1,3650);
  const due=s.due_enabled!==false&&Number(account.terms.credit_days)>0?account.open.filter(i=>days(i.due_date,onDate)<=dueDays):[];
  const hold=s.hold_enabled!==false?account.currencies.filter(a=>a.debt>0&&(a.maxLate>=Math.max(1,holdDays-holdLead)||a.excess>0)):[];
  if(!due.length&&!hold.length)return null;
  return {due,hold,to:recipients(account.customer,s),kind:due.length&&hold.length?'due_and_hold':hold.length?'credit_hold':'due',dueDays,holdDays,holdLead};
 }
 function bounded(v,f,min,max){const n=Number(v);return Number.isInteger(n)&&n>=min&&n<=max?n:f;}
 function paymentFulfillsPromise(r,plan){
  if(!r.ar_recorded_at||!plan.created_at||!r.payment_date||(plan.baseline_receipt_ids||[]).includes(r.id))return false;
  const creationDay=plan.created_at.length===10?plan.created_at:localDay(new Date(plan.created_at));
  return plan.created_at<=r.ar_recorded_at&&r.payment_date>=creationDay&&(!plan.cancelled_at||(r.ar_recorded_at<=plan.cancelled_at&&r.payment_date<=localDay(new Date(plan.cancelled_at))));
 }
 function commitmentLedger(state={},onDate=localDay()){
  const obligations=(state.plans||[]).flatMap(plan=>(state.promises||[]).filter(p=>p.plan_id===plan.id).map(p=>({...p,plan,appliedCents:0,completed_date:null})));
  for(const r of [...(state.receipts||[])].filter(r=>r.payment_date<=onDate&&r.ar_recorded_at).sort((a,b)=>a.payment_date.localeCompare(b.payment_date)||a.ar_recorded_at.localeCompare(b.ar_recorded_at))){
   let left=cents(r.amount);
   const eligible=obligations.filter(o=>o.customer_id===r.customer_id&&o.currency===r.currency&&o.scheduled_date&&paymentFulfillsPromise(r,o.plan)&&o.appliedCents<cents(o.amount)).sort((a,b)=>a.scheduled_date.localeCompare(b.scheduled_date)||a.plan.created_at.localeCompare(b.plan.created_at)||a.installment-b.installment);
   for(const o of eligible){const take=Math.min(Math.max(0,left),cents(o.amount)-o.appliedCents);o.appliedCents+=take;left-=take;if(o.appliedCents===cents(o.amount))o.completed_date=r.payment_date;if(!left)break;}
  }
  return obligations.map(o=>({...o,applied:amount(o.appliedCents),remaining:amount(Math.max(0,cents(o.amount)-o.appliedCents))}));
 }
 function statementCommitments(customerId,open,state,onDate){
  return commitmentLedger(state,onDate).filter(o=>o.customer_id===customerId&&!o.plan.cancelled_at&&o.remaining>0&&(!o.invoice_id||open.some(i=>i.id===o.invoice_id))).map(o=>({...o,invoice:open.find(i=>i.id===o.invoice_id),status:o.scheduled_date<onDate?'Vencida':o.scheduled_date===onDate?'Para hoy':o.applied?'Abono parcial':'Programada'})).sort((a,b)=>a.scheduled_date.localeCompare(b.scheduled_date));
 }
 const statementDate=d=>/^\d{4}-\d{2}-\d{2}/.test(d||'')?d.slice(0,10).split('-').reverse().join('/'):'—';
 const businessLabel=s=>/^cart[oó]n$/i.test(s||'')?'Cartón':s||'Otro';
 function statementCurrencies(a){return a.currencies.length?a.currencies:[{currency:'MXN',debt:0,overdue:0,received:0,applied:0,credit:0,limit:a.terms.limit_mxn??null}];}
 function statementDueInfo(invoice,onDate){
  const remaining=days(invoice.due_date,onDate);
  if(!Number.isFinite(remaining))return {label:'Sin vencimiento',state:'unknown',days:null};
  if(remaining<0){const n=Math.abs(remaining);return {label:n+' '+(n===1?'día vencido':'días vencidos'),state:'overdue',days:remaining};}
  if(remaining===0)return {label:'Vence hoy',state:'today',days:0};
  return {label:(remaining===1?'Falta 1 día':'Faltan '+remaining+' días'),state:'upcoming',days:remaining};
 }
 function statementInvoicePromise(account,invoiceId){
  const next=(account.commitments||[]).filter(o=>o.invoice_id===invoiceId&&!o.plan?.cancelled_at&&cents(o.remaining)>0&&/^\d{4}-\d{2}-\d{2}$/.test(o.scheduled_date||'')).sort((a,b)=>a.scheduled_date.localeCompare(b.scheduled_date))[0];
  return next?'Promesa de pago: '+statementDate(next.scheduled_date):'';
 }
 function statementHTML(a,{companyLogo='',alertText=''}={}){
  const c=a.customer,p=profile(c),currencies=statementCurrencies(a),company=a.company||{},bankHTML=statementBanks(a).map(b=>'<div><b>'+escape(b.currency)+'</b> · Beneficiario: '+escape(b.beneficiary)+' · Banco: '+escape(b.bank)+'<br>Cuenta: '+escape(b.account)+' · CLABE: '+escape(b.clabe)+' · Referencia: '+escape(b.reference)+'</div>').join('');
  const curSummary=currencies.map(x=>`<div class="statement-currency"><b>${x.currency}</b> · Facturas pendientes: <b>${money(x.debt,x.currency)}</b> · Vencido: <b class="statement-danger">${money(x.overdue,x.currency)}</b><br>Saldo a favor disponible: <b class="statement-good">${money(x.credit,x.currency)}</b> · Posición neta: <b>${x.debt-x.credit<0?'a favor del cliente':'por cobrar'} ${money(Math.abs(amount(cents(x.debt)-cents(x.credit))),x.currency)}</b><br><span class="statement-muted">Plazo ${Number(a.terms.credit_days)||0} días · ${x.limit===null?'Límite sin asignar':'Límite '+money(x.limit,x.currency)+' · Crédito disponible '+money(amount(Math.max(0,cents(x.limit)-cents(x.debt))),x.currency)}</span></div>`).join('');
  const rows=a.open.map(i=>{const due=statementDueInfo(i,a.onDate),promise=statementInvoicePromise(a,i.id);return `<tr><td>${statementDate(i.invoice_date)}</td><td><b>${escape(i.invoice_number)}</b><small>${escape(businessLabel(i.business_line))}</small></td><td>${statementDate(i.due_date)}</td><td>${escape(i.currency)}</td><td>${money(i.total,i.currency)}</td><td>${money(i.paid,i.currency)}${i.credited?'<small>NC: '+money(i.credited,i.currency)+'</small>':''}</td><td><b>${money(i.balance,i.currency)}</b></td><td class="statement-due-count ${due.state==='overdue'?'statement-danger':due.state==='upcoming'?'statement-good':''}"><b>${escape(due.label)}</b>${promise?'<small class="statement-invoice-promise">'+escape(promise)+'</small>':''}</td><td>${statementDate(i.last_payment_date)}</td></tr>`;}).join('');
  const payments=currencies.map(x=>`<tr><td><b>${x.currency}</b></td><td>${money(x.received,x.currency)}</td><td>${money(x.applied,x.currency)}</td><td>${money(x.credit,x.currency)}</td><td>${statementDate(x.last_received_date)}</td></tr>`).join('');
  const commitments=(a.commitments||[]).map(o=>`<tr><td>${statementDate(o.scheduled_date)}</td><td>${escape(o.invoice?.invoice_number||'Acuerdo general')}${o.plan.kind==='schedule'?' · cuota '+escape(o.installment):''}</td><td>${money(o.amount,o.currency).replace(/^USD\s*/,'$')} ${escape(o.currency)}</td><td>${money(o.applied,o.currency)}</td><td>${money(o.remaining,o.currency)}</td><td>${escape(o.status)}</td></tr>`).join('');
  return `<div class="statement-banner"><div><h2>${escape(company.legal_name||'AMAO SERVICIO Y COMERCIO S.A. DE C.V.')}</h2><p>RFC: ${escape(company.tax_id||'')} · ESTADO DE CUENTA</p><p>Emitido ${statementDate(a.onDate)} · Importes expresados en la moneda de cada movimiento</p></div>${companyLogo?'<img class="statement-logo" src="'+escape(companyLogo)+'" alt="AMAO">':''}</div>
<div class="statement-info"><div class="statement-box"><div class="statement-label">Cliente</div><h3>${escape(c.legal_name)}</h3><div>RFC: ${escape(c.tax_id||'No registrado')} · Código: ${escape(c.customer_code||'—')}</div><div>Correo: ${escape(c.email||'No registrado')}</div><div>Teléfono: ${escape(c.phone||'No registrado')}</div>${p.address?'<div>Dirección: '+escape(p.address)+'</div>':''}</div><div class="statement-box"><div class="statement-label">Resumen por moneda</div>${curSummary}</div></div>
${alertText?'<div class="statement-legend">'+escape(alertText)+'</div>':''}
<div class="statement-section statement-invoices"><h3>Facturas pendientes · ${a.open.length}</h3><div class="statement-table-wrap"><table><thead><tr><th>Fecha factura</th><th>Factura / negocio</th><th>Vencimiento</th><th>Moneda</th><th>Total</th><th>Abonos / NC</th><th>Pendiente</th><th>Días al vencimiento</th><th>Último abono</th></tr></thead><tbody>${rows||'<tr><td colspan="9">Sin facturas pendientes al corte.</td></tr>'}</tbody></table></div></div>
<div class="statement-section statement-activity-summary"><h3>Resumen de pagos y abonos</h3><div class="statement-table-wrap"><table><thead><tr><th>Moneda</th><th>Pagos recibidos</th><th>Abonos aplicados</th><th>Saldo a favor</th><th>Último pago recibido</th></tr></thead><tbody>${payments}</tbody></table></div><p class="statement-muted">Importes acumulados al corte. Aplicar un saldo a favor no representa un nuevo ingreso de efectivo.</p></div>
<div class="statement-section statement-commitments"><h3>Promesas y programa de pagos</h3>${commitments?'<div class="statement-table-wrap"><table><thead><tr><th>Fecha compromiso</th><th>Factura / acuerdo</th><th>Prometido</th><th>Aplicado</th><th>Por cumplir</th><th>Estado</th></tr></thead><tbody>'+commitments+'</tbody></table></div>':'<p class="statement-muted">Sin compromisos pendientes registrados.</p>'}<p class="statement-muted">Los compromisos se concilian con los pagos registrados; una promesa por sí sola no disminuye el saldo de la factura.</p></div>
<div class="statement-section statement-box statement-bank-section"><div class="statement-label">Información bancaria</div><div class="statement-bank">${bankHTML}</div></div>
<div class="statement-legend"><b>Comprobantes y aclaraciones:</b> ${escape(company.email||'')} · ${escape(company.copy_email||'')} · ${escape(company.phone||'')}.<br>Los días vencidos o por vencer se calculan a la fecha de emisión de este estado de cuenta. Se muestran únicamente facturas con saldo pendiente.</div><div class="statement-review">Le agradeceremos revisar este estado de cuenta y compartirnos cualquier aclaración o comprobante pendiente de conciliación.<br><b>AMAO Servicio y Comercio, S.A. de C.V.</b></div>`;
 }
  function statementBanks(a){
  const defaults={beneficiary:a.company?.legal_name||'Por confirmar',bank:'Por confirmar',account:'Por confirmar',clabe:'Por confirmar',reference:'Número de factura'},configured=a.company?.banks||{};
  const groups=new Map();for(const c of statementCurrencies(a)){const b={...defaults,...Object.fromEntries(Object.entries(configured[c.currency]||{}).filter(([k,v])=>v))},key=JSON.stringify(b);if(groups.has(key))groups.get(key).currency+=' / '+c.currency;else groups.set(key,{currency:c.currency,...b});}return [...groups.values()];
 }
 function statementExecutiveHTML(a,options={}){
  const rows=statementCurrencies(a).map(c=>{const items=a.open.filter(i=>i.currency===c.currency),value=check=>money(amount(items.filter(check).reduce((n,i)=>n+cents(i.balance),0)),c.currency);return '<tr><td>'+escape(c.currency)+'</td><td>'+items.length+'</td><td>'+value(i=>i.late===0)+'</td><td>'+value(i=>i.late>0&&i.late<=30)+'</td><td>'+value(i=>i.late>30&&i.late<=60)+'</td><td>'+value(i=>i.late>60)+'</td><td><b>'+money(c.debt,c.currency)+'</b></td></tr>';}).join('');
  const short={...a,commitments:(a.commitments||[]).slice(0,4)},html=statementHTML(short,options),start=html.indexOf('<div class="statement-section statement-invoices">'),end=html.indexOf('<div class="statement-section statement-activity-summary">',start);
  return html.slice(0,start)+'<div class="statement-section"><h3>Resumen de facturas pendientes · '+a.open.length+'</h3><table><thead><tr><th>Moneda</th><th>Facturas</th><th>Por vencer</th><th>1–30 días</th><th>31–60 días</th><th>Más de 60</th><th>Pendiente</th></tr></thead><tbody>'+rows+'</tbody></table><p class="statement-muted">Resumen ejecutivo. El detalle completo de folios, vencimientos y promesas permanece disponible en el estado de cuenta detallado.</p></div>'+html.slice(end)+(a.commitments?.length>4?'<p class="statement-muted">Se muestran los primeros 4 compromisos. Consulta el detalle para ver todos.</p>':'');
 }

 const api={statementBanks,statementExecutiveHTML,paymentFulfillsPromise,commitmentLedger,cents,amount,money,escape,days,shift,localDay,profile,recipients,mailDefaults,mailRouting,buildLedger,reminders,statementHTML,statementCurrencies,statementDate,statementDueInfo,statementInvoicePromise,businessLabel,bounded};root.ArBillingCore=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
