const {test}=require('node:test'),assert=require('node:assert/strict'),tracking=require('./tracking-core.js'),weekly=require('../weekly-reports-core.js');
const day='2026-11-26';
function fixture(){
 const invoice=(id,customer_id,business_line,total,currency='MXN',due_date='2026-12-15',status='abierta')=>({id,customer_id,business_line,total,currency,due_date,status,invoice_number:'INV/'+id,invoice_date:'2026-01-01'});
 return {customers:[{id:'mixed',legal_name:'Cliente de Cartón y Foam'},{id:'carton',legal_name:'Solo Cartón'},{id:'foam',legal_name:'Solo Foam'}],invoices:[invoice('c','mixed','Carton',200),invoice('f','mixed','Foam',300,'MXN','2026-10-01'),invoice('c2','carton','Carton',90),invoice('f2','foam','Foam',85),invoice('usd','mixed','Foam',50,'USD'),invoice('cancel','mixed','Carton',999,'MXN','2026-10-01','cancelada'),invoice('future','foam','Foam',9999,'MXN','2026-12-15')].map(i=>i.id==='future'?{...i,invoice_date:'2026-12-01'}:i),payments:[{id:'pc',invoice_id:'c',receipt_id:'split',currency:'MXN',amount:40,payment_date:'2026-10-01'},{id:'pf',invoice_id:'f',receipt_id:'split',currency:'MXN',amount:60,payment_date:'2026-10-01'},{id:'cnew',invoice_id:'c',receipt_id:'recent',currency:'MXN',amount:30,payment_date:'2026-11-20'},{id:'legacy',invoice_id:'f',currency:'MXN',amount:10,payment_date:'2026-09-15'},{id:'pUSD',invoice_id:'usd',currency:'USD',amount:5,payment_date:'2026-11-21'}],localPayments:[{id:'pc',invoice_id:'c',receipt_id:'split',currency:'MXN',amount:40,payment_date:'2026-10-01'}],receipts:[{id:'split',customer_id:'mixed',currency:'MXN',amount:100,payment_date:'2026-10-01'},{id:'recent',customer_id:'mixed',currency:'MXN',amount:30,payment_date:'2026-11-20'},{id:'advance',customer_id:'mixed',currency:'MXN',amount:50,payment_date:'2026-11-25'},{id:'future',customer_id:'mixed',currency:'MXN',amount:999,payment_date:'2026-11-27'}],creditNotes:[{id:'nc',customer_id:'mixed',currency:'MXN',date:'2026-11-25',allocations:[{invoice_id:'f',amount:20}]}],plans:[],promises:[]};
}
const row=(r,id,currency='MXN')=>r.rows.find(r=>r.customer_id===id&&r.currency===currency);
test('Business portfolio includes current debt, splits mixed clients and keeps currencies separate',()=>{
 const d=fixture(),before=JSON.stringify(d),carton=tracking.report(d,[],{day,mode:'portfolio',business:'Cartón'}),foam=tracking.report(d,[],{day,mode:'portfolio',business:'Foam'});
 assert.equal(row(carton,'mixed').debt,130);assert.equal(row(carton,'mixed').overdue,0);assert.equal(row(carton,'carton').debt,90);assert(!row(carton,'foam'));assert.equal(carton.portfolioTotals.MXN.debt,220);
 assert.equal(row(foam,'mixed').debt,210);assert.equal(row(foam,'mixed').overdue,210);assert.equal(row(foam,'mixed','USD').debt,45);assert.equal(row(foam,'foam').debt,85);assert.equal(foam.portfolioTotals.MXN.debt,295);assert.equal(foam.portfolioTotals.USD.debt,45);assert(!row(foam,'carton'));assert.equal(JSON.stringify(d),before);
});
test('Latest payments come from all history, group split receipts once and exclude unassigned advances from a specific business',()=>{
 const d=fixture(),c=row(tracking.report(d,[],{day,mode:'portfolio',business:'Cartón',period:'today'}),'mixed'),f=row(tracking.report(d,[],{day,mode:'portfolio',business:'Foam'}),'mixed'),all=row(tracking.report(d,[],{day,mode:'portfolio'}),'mixed');
 assert.deepEqual(c.recentPayments.map(p=>[p.date,p.amount]),[['2026-11-20',30],['2026-10-01',40]]);assert.equal(c.lastPaymentDate,'2026-11-20');assert.equal(c.lastPaymentAmount,30);
 assert.deepEqual(f.recentPayments.map(p=>[p.date,p.amount]),[['2026-10-01',60],['2026-09-15',10]]);assert.equal(f.lastPaymentAmount,60);
 assert.deepEqual(all.recentPayments.map(p=>p.amount),[50,30,100]);assert.equal(all.recentPayments.filter(p=>p.id==='receipt:split').length,1);assert(!all.recentPayments.some(p=>p.date>day));
});
test('Received-period report filters payments and debts by business using the same original-cash rule',()=>{
 const d=fixture(),c=tracking.report(d,[],{day,mode:'received',business:'Carton',period:'custom',date:'2026-10-01'}),f=tracking.report(d,[],{day,mode:'received',business:'Foam',period:'custom',date:'2026-10-01'});
 assert.equal(row(c,'mixed').payment,40);assert.equal(row(c,'mixed').debt,130);assert.equal(row(f,'mixed').payment,60);assert.equal(row(f,'mixed').debt,210);assert.equal(c.totals.MXN.payment+f.totals.MXN.payment,100);
});
test('General promises are allocated once across businesses, and a mixed-client general manual agreement is not duplicated',()=>{
 const d=fixture();d.plans=[{id:'plan',customer_id:'mixed',currency:'MXN',created_at:'2026-11-26T10:00:00Z',baseline_receipt_ids:d.receipts.map(r=>r.id)}];d.promises=[{id:'promise',plan_id:'plan',customer_id:'mixed',currency:'MXN',invoice_id:null,amount:250,scheduled_date:day}];
 const acts=[{id:'general',customer_id:'mixed',happened_on:day,created_at:day+'T12:00:00Z',followup_status:'done',report_currency:'MXN',report_amount_mode:'manual',report_amount:300,report_payment_on:day,report_comment:'ACUERDO GENERAL'}];
 const c=tracking.report(d,acts,{day,business:'Cartón'}),f=tracking.report(d,acts,{day,business:'Foam'}),all=tracking.report(d,acts,{day});
 assert.equal(row(c,'mixed').payment+row(f,'mixed').payment,250);assert.equal(row(all,'mixed').payment,300);assert.equal(row(f,'mixed').manualAllowed,false);assert.equal(row(f,'mixed').comment,'ACUERDO GENERAL');
});
test('Portfolio image/text preserve the selected business, current totals and actual recent payments',()=>{
 const report=tracking.report(fixture(),[],{day,mode:'portfolio',business:'Foam'}),image=tracking.publication(report),text=tracking.text(report);
 assert.equal(image.headers.length,6);assert(image.subtitle.includes('Foam'));assert(image.rows.some(r=>r.cells[4].includes('01-10-26')));assert(image.footers.some(r=>r[0]==='MXN'&&r[2].includes('295.00')));assert(text.includes('Negocio: Foam'));assert(text.includes('Saldo pendiente'));assert(!text.includes('Solo Cartón'));
});
test('Cash ranges reconcile to weekly totals and transfers of existing credit never become a new receipt',()=>{
 const d=fixture();d.payments.push({id:'reuse',invoice_id:'f',receipt_id:'recent',source_invoice_id:'c',currency:'MXN',amount:10,payment_date:'2026-11-26'});
 const range=weekly.collectionsInRange(d,'2026-11-16','2026-11-22'),week=weekly.weeklyCollections(d,'2026-11-20');assert.deepEqual(range.movements,week.movements);assert.equal(range.totals.MXN,30);assert.throws(()=>weekly.collectionsInRange(d,'2026-02-30',day));
 const all=tracking.report(d,[],{day,mode:'portfolio'});assert.equal(row(all,'mixed').recentPayments.filter(p=>p.date===day).length,0);assert.equal(row(all,'mixed').recentPayments.find(p=>p.id==='receipt:recent').amount,30);
});
