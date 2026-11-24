const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements=new Map(),events={};const initial={currency:'USD',customerSearch:'',collectionSearch:'',trackingSearch:'',invoiceSearch:'',statementSearch:'',paymentHistorySearch:'',invoiceCustomerFilter:'',invoiceCustomerSearch:'',invoiceFilterDate:'',invoiceFilterAmount:'',opsReportType:'cash',opsReportStart:'2026-10-01',opsReportEnd:'2026-10-31',opsReportCurrency:'all',opsReportBusiness:'all'};
function el(id){if(!elements.has(id))elements.set(id,{id,value:initial[id]??'all',innerHTML:'',textContent:'',dataset:{},attributes:{},events:{},options:[],selectedOptions:[],hidden:false,isConnected:true,classList:{add(){},remove(){},toggle(){}},addEventListener(k,f){(this.events[k]??=[]).push(f)},setAttribute(k,v){this.attributes[k]=v},removeAttribute(k){delete this.attributes[k]},hasAttribute(k){return k in this.attributes},querySelector(){return null},querySelectorAll(){return []},setCustomValidity(){},scrollIntoView(){},focus(){},reset(){}});return elements.get(id);}
const storage=new Map();let enrichCalls=0;class Clock extends Date{constructor(...args){super(...(args.length?args:['2026-10-26T18:00:00Z']));}}
const context={console,Intl,Date:Clock,Math,Number,String,Object,Array,Set,Map,JSON,Promise,RegExp,Error,Blob,URL,Headers,TextEncoder,Uint8Array,crypto:require('node:crypto').webcrypto,setTimeout(){},clearTimeout(){},navigator:{clipboard:{async writeText(){}}},CSS:{escape:s=>s},window:{addEventListener(){},setInterval(){}},document:{getElementById:el,querySelectorAll(){return []},querySelector(){return null},addEventListener(k,f){(events[k]??=[]).push(f)},createElement:tag=>el('new-'+tag)},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},opsProbe(){enrichCalls++;}};vm.createContext(context);
const html=fs.readFileSync('index.html','utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n').replace(/\ninit\(\);/,'').replace('function enriched(){','function enriched(){opsProbe();');vm.runInContext(scripts,context);const run=s=>vm.runInContext(s,context);
const payload={company:{},creditReviews:{},virtuals:[],attachments:[]};let failSave=false,rpcCalls=[];
context.mock={from(name){return {select(){return this},eq(){return this},async single(){return {data:{id:'main',version:1,payload},error:null}}};},async rpc(name,args){rpcCalls.push({name,args});if(failSave)return {error:{message:'Conflicto de versión'}};if(name==='ar_write_operations')return {data:{id:'main',version:2,payload:args.next_payload}};if(name==='ar_apply_customer_credit')return {data:{version:8,invoices:[{id:'A',due_date:'2026-11-15'}],terms:{customer_id:'c',...args.settings}}};if(name==='ar_cancel_invoice')return {data:{version:9,detail:{date:args.cancel_date,reason:args.cancel_reason,replacement_id:args.replacement_invoice}}};throw Error(name);}};
run("sb=mock;activeUserId='admin';dashboardAccess={user:'admin',role:'admin',loading:false,error:''};featuresReady=true;customers=[{id:'c',legal_name:'HFP Houston Foam Plastic',notes:'{}',email:'a@example.com'}];invoices=[{id:'A',customer_id:'c',invoice_number:'INV/2026/A',invoice_date:'2026-10-01',due_date:'2026-10-20',total:100,currency:'USD',business_line:'Foam',status:'abierta'}];payments=[];receipts=[];creditSettings=[{customer_id:'c',credit_days:30,limit_usd:80,limit_mxn:null}];plans=[];promises=[];localPayments=[];creditNotes=[];collectionState={user:'admin',ready:true,role:'admin',activities:[],snapshots:[],error:''};reminderCloud={ready:true,version:7,enabled:false,hour:9,zone:'America/Ciudad_Juarez',synced:true,busy:false,queued:false,error:''};");

const downloads=[],copied=[],canvases=[];
const {createCanvas}=require('../tools/dependency.cjs')('@napi-rs/canvas');
context.document.createElement=tag=>{
 if(tag!=='canvas')return el('created-'+tag);
 const canvas=createCanvas(10,10);canvas.toBlob=callback=>callback(new Blob([canvas.toBuffer('image/png')],{type:'image/png'}));canvases.push(canvas);return canvas;
};
context.captureDownload=(blob,name)=>downloads.push({blob,name});
context.navigator.clipboard={async write(items){copied.push(items)}};
context.ClipboardItem=class {constructor(items){this.items=items;}};
run("downloadBlob=captureDownload");
function changeBusiness(value){
 el('businessDebtFilter').value=value;
 for(const listener of el('businessDebtFilter').events.change||[])listener({target:el('businessDebtFilter')});
}
function comment(customer,business,currency,value){
 const field={value,dataset:{businessDebtCustomer:customer,businessDebtBusiness:business,businessDebtCurrency:currency}};
 for(const listener of el('businessDebtTable').events.input||[])listener({target:field});
}

run("customers=[{id:'c1',legal_name:'Cliente Norte <texto literal> y nombre largo para comprobar que se conserva completo',notes:'{}',active:true},{id:'c2',legal_name:'Cliente Sur',notes:'{}',active:true}];\nconst testInvoice=(id,customer_id,business_line,total,currency,late)=>({id,customer_id,business_line,total,currency,status:'abierta',invoice_number:'INV/TEST/'+id,invoice_date:ArBillingCore.shift(today(),-90),due_date:ArBillingCore.shift(today(),-late)});\ninvoices=[testInvoice('c30','c1','Carton',100.10,'MXN',30),testInvoice('current','c1','Carton',60.20,'MXN',-8),testInvoice('f61','c1','Foam',200.20,'MXN',61),testInvoice('c60','c2','Carton',70.05,'MXN',60),testInvoice('fUSD','c1','Foam',999,'USD',1),testInvoice('settled','c1','Carton',18,'MXN',10),{...testInvoice('cancel','c2','Carton',500,'MXN',5),status:'cancelada'},testInvoice('other','c2','Otro',17.11,'MXN',-5)];\npayments=[{id:'pay1',invoice_id:'c30',amount:20.10,currency:'MXN',payment_date:today()},{id:'pay2',invoice_id:'settled',amount:18,currency:'MXN',payment_date:today()}];\nlocalPayments=[];receipts=[];plans=[];promises=[];creditSettings=[];creditNotes=[{id:'nc',customer_id:'c1',currency:'MXN',allocations:[{invoice_id:'f61',amount:30.20}]}];\n$('currency').value='MXN';$('analysisBusinessFilter').value='all';renderAll();");

const financial=run('JSON.stringify({customers,invoices,payments,receipts,localPayments,creditNotes,creditSettings,plans,promises})');
(async()=>{
 assert.equal(run('window.businessDebtExport.length'),4);
 assert.equal(run('businessDebtShareModel().sourceRows.reduce((n,r)=>n+cents(r[3]),0)'),39736);
 assert(run('window.businessDebtExport.every(r=>r.length===11)'));
 changeBusiness('Cartón');assert.equal(el('analysisBusinessFilter').value,'Cartón');assert.equal(run('window.businessDebtExport.length'),2);
 assert(run('window.businessDebtExport.every(r=>r[1]==="Cartón")'));
 assert.equal(run('businessDebtShareModel().sourceRows.reduce((n,r)=>n+cents(r[3]),0)'),21025);
 assert(!el('downloadBusinessDebtImage').disabled);
 const note='Pago el viernes\n<urgente> & confirmar la fecha';comment('c1','Cartón','MXN',note);
 assert.equal(run('window.businessDebtExport[0][10]'),note);
 run('renderBusinessDebt(selectedAnalysisRows())');
 assert(el('businessDebtTable').innerHTML.includes('&lt;urgente&gt;'),'Comment markup is escaped');
 assert(!el('businessDebtTable').innerHTML.includes('<urgente>'),'Comments cannot become HTML');
 const carton=run('businessDebtShareModel()');
 assert.equal(carton.rows[0].cells[10],note);assert.equal(carton.rows.length,2);assert.equal(carton.footers.length,1);
 assert(carton.footers[0][3].includes('210.25'));assert(carton.footers[0][8].includes('150.05'));assert(carton.footers[0][4].includes('60.20'));
 assert.equal(carton.headers.at(-1),'Comentarios');
 await run('businessDebtImageAction(false)');
 assert.equal(downloads.length,1);assert(downloads[0].name.includes('Carton_MXN'));
 const png=Buffer.from(await downloads[0].blob.arrayBuffer());
 assert.equal(png.readUInt32BE(0),0x89504e47);assert.equal(png.readUInt32BE(16),carton.widths.reduce((n,w)=>n+w,72));assert(png.length>1000);
 fs.mkdirSync('test-output',{recursive:true});fs.writeFileSync('test-output/business-debt-carton.png',png);
 changeBusiness('Foam');assert.equal(run('window.businessDebtExport.length'),1);assert.equal(run('window.businessDebtExport[0][3]'),170);assert.equal(run('window.businessDebtExport[0][10]'),'');
 comment('c1','Foam','MXN','SEGUIMIENTO FOAM');assert.equal(run('businessDebtShareModel().rows[0].cells[10]'),'SEGUIMIENTO FOAM');
 await run('businessDebtImageAction(true)');assert.equal(copied.length,1);assert(el('businessDebtFeedback').textContent.includes('copiada'));
 context.navigator.clipboard.write=async()=>{throw Error('Not allowed')};await run('businessDebtImageAction(true)');assert.equal(downloads.length,2);assert(el('businessDebtFeedback').textContent.includes('se descargó'));
 el('currency').value='USD';run('renderAll()');assert.equal(run('window.businessDebtExport[0][3]'),999);assert.equal(run('window.businessDebtExport[0][10]'),'','Currency comments never leak');
 changeBusiness('Cartón');assert.equal(run('window.businessDebtExport.length'),0);assert(el('downloadBusinessDebtImage').disabled);
 const before=downloads.length;await run('businessDebtImageAction(false)');assert.equal(downloads.length,before);assert(el('businessDebtFeedback').textContent.includes('No hay adeudos'));
 el('currency').value='MXN';run('renderAll()');assert.equal(run('businessDebtShareModel().rows[0].cells[10]'),note,'Returning to the line restores its comment');
 run('businessDebtCommentDrafts.clear();renderBusinessDebt(selectedAnalysisRows())');assert.equal(run('businessDebtShareModel().rows[0].cells[10]'),note,'Saved comment survives in-memory state reset');
 comment('c1','Cartón','MXN','');assert.equal(run('businessDebtShareModel().rows[0].cells[10]'),'','Comments can be cleared');
 run("dashboardAccess.role='solo_consulta';collectionState.role='solo_consulta'");changeBusiness('Foam');assert(!el('downloadBusinessDebtImage').disabled,'Viewer can export this read-only report');
 await run('businessDebtImageAction(false)');assert.equal(downloads.length,before+1);
 assert.equal(run('JSON.stringify({customers,invoices,payments,receipts,localPayments,creditNotes,creditSettings,plans,promises})'),financial,'Report actions never mutate financial data');
 run("activeUserId='another-user';renderBusinessDebt(selectedAnalysisRows())");assert.equal(run('businessDebtShareModel().rows[0].cells[10]'),'','Other users cannot see personal comments');
 run("activeUserId='admin'");
 run("invoices=Array.from({length:30},(_,n)=>({...invoices[0],id:'many-'+n,customer_id:'new-'+n,customer:{legal_name:'CLIENTE '+n},invoice_number:'INV/'+n,total:1.01}));customers=invoices.map(i=>({id:i.customer_id,legal_name:i.customer.legal_name,notes:'{}'}));payments=[];creditNotes=[];$('analysisBusinessFilter').value='Cartón';resetQuickSearchCache();renderBusinessDebt(selectedAnalysisRows());");
 const many=run('businessDebtShareModel()');assert.equal(many.rows.length,30);assert(many.footers[0][3].includes('30.30'));
 const allPng=run('createTrackingCanvas(businessDebtShareModel())').toBuffer('image/png');assert(allPng.length>1000);
 assert.equal(rpcCalls.length,0);
 run('resetCollectionTools()');assert.equal(run('window.businessDebtExport.length'),0);assert.equal(run('window.businessDebtRows.length'),0);assert.equal(el('businessDebtTable').innerHTML,'');assert(el('downloadBusinessDebtImage').disabled);
 console.log('PASS: Cartón/Foam/all filters; same table/CSV/image totals after payments and NC; complete PNG for all clients; per-line escaped comments, persistence and currency/user isolation; copy/fallback, empty selections, viewer access and session cleanup. No network writes.');
})().catch(error=>{console.error(error);process.exitCode=1});
