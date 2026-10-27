const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom'),{createCanvas}=require('./../tools/dependency.cjs')('@napi-rs/canvas');
const errors=[],downloads=[],copies=[],queries=[],writes=[],uploads=[],chartUpdates=[];
let failAudit=false,failCopy=false,failSave=false,reducedMotion=false,auditGate=null,reloadRelease=null,writeGate=null;
const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>errors.push(e.message));
const html=fs.readFileSync('index.html','utf8');
const dom=new JSDOM(html,{url:'https://dashboard.example.com',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
const w=dom.window,document=w.document;
Object.assign(w,{TextEncoder,TextDecoder,Headers,Blob,CSS:{escape:value=>value},matchMedia:()=>({matches:reducedMotion})});
w.HTMLElement.prototype.scrollIntoView=function(){};
Object.defineProperty(w.navigator,'clipboard',{value:{async writeText(text){if(failCopy)throw Error('Clipboard denied');copies.push(text)}}});
const createElement=document.createElement.bind(document);document.createElement=function(tag,...args){if(tag!=='canvas')return createElement(tag,...args);const canvas=createCanvas(1440,600);canvas.toBlob=cb=>cb(new Blob([canvas.toBuffer('image/png')],{type:'image/png'}));return canvas;};
w.Chart=class {constructor(el,config){this.config=config;this.data=config.data;this.options=config.options;chartUpdates.push({kind:'create',id:el.id,animation:this.options.animation});}stop(){}resize(){}reset(){chartUpdates.push({kind:'reset'});}update(mode){chartUpdates.push({kind:'update',mode,animation:this.options.animation});}destroy(){}};
process.on('unhandledRejection',e=>errors.push(e.message||String(e)));
const script=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n').replace(/\ninit\(\);/,'');
const run=s=>vm.runInContext(s,dom.getInternalVMContext());run(script);
w.captureDownload=(blob,name)=>downloads.push({blob,name});
const auditRows=Array.from({length:26},(_,n)=>({id:n+1,happened_at:'2026-10-27T12:00:00Z',actor_id:'test-admin',actor_role:'admin',entity:'invoices',record_id:'i1',action:'UPDATE'}));
w.mock={
 from(table){const q={table,columns:'*',filter:null,start:0,end:24,one:false};return {
 select(columns){q.columns=columns;return this;},order(){return this;},range(start,end){q.start=start;q.end=end;return this;},eq(key,value){q.filter={key,value};return this;},single(){q.one=true;return this;},update(value){q.update=value;return this;},
 async then(resolve,reject){try{queries.push({...q});if(table==='ar_audit_log'){
  const gate=auditGate;if(gate){auditGate=null;await gate;}
  if(failAudit)return resolve({data:null,error:{message:'No se pudo consultar el historial de prueba'}});
  if(q.one)return resolve({data:{id:q.filter.value,before_data:{total:99},after_data:{total:100}},error:null});
  return resolve({data:auditRows.slice(q.start,q.end+1),error:null});
 }
 if(table==='profiles'){if(q.update){writes.push({...q});return resolve({data:{id:q.filter.value,...q.update},error:null});}return resolve({data:[{id:'test-admin',full_name:'Administración de prueba',email:'admin@example.com',role:'admin'},{id:'other-user',full_name:'Consulta de prueba',email:'viewer@example.com',role:'solo_consulta'}],error:null});}
 throw Error('Unexpected table '+table);
 }catch(error){reject(error);}}
 };},
 async rpc(name,args){writes.push({name,args});if(writeGate){const gate=writeGate;writeGate=null;await gate;}if(failSave)return {error:{message:'Conflicto de versión de prueba'}};assert.equal(name,'ar_write_operations');return {data:{id:'main',version:args.expected_version+1,payload:JSON.parse(JSON.stringify(args.next_payload))},error:null};},
 storage:{from(bucket){assert.equal(bucket,'amao-documents');return {async createSignedUrl(path){return {data:{signedUrl:'https://files.example.com/private/'+encodeURIComponent(path)+'?token=synthetic'},error:null};},async upload(path,file){uploads.push({path,size:file.size});return {error:null};},async remove(){return {error:null}}};}},
 auth:{async updateUser(value){writes.push({name:'password',value});return {error:null};}}
};
run(`activeUserId='test-admin';dashboardAccess={user:activeUserId,role:'admin',loading:false,error:''};featuresReady=true;
customers=[{id:'c1',legal_name:'HFP Houston Foam Plastic',email:'cliente@example.com',notes:'{}',active:true},{id:'c2',legal_name:'Sin contacto',notes:'{}',active:true}];
invoices=[{id:'i0',customer_id:'c1',invoice_number:'INV/2026/CANCELADA',invoice_date:'2026-05-15',due_date:'2026-04-30',total:123,currency:'USD',business_line:'Foam',status:'cancelada'},{id:'i1',customer_id:'c1',invoice_number:'INV/2026/1',invoice_date:'2026-10-01',due_date:'2026-10-20',total:100,currency:'USD',business_line:'Foam',status:'abierta'},{id:'i2',customer_id:'c2',invoice_number:'INV/2026/2',invoice_date:'2026-10-01',due_date:'2026-09-20',total:100,currency:'USD',business_line:'Carton',status:'abierta'}];payments=[];receipts=[];localPayments=[];plans=[];promises=[];creditNotes=[];
invoiceCancellations={i0:{date:'2026-05-16',reason:'Captura <incorrecta>',replacement_id:'i1'}};
creditSettings=[{customer_id:'c1',credit_days:30,limit_usd:80,limit_mxn:null}];
collectionState={user:activeUserId,ready:true,role:'admin',activities:[],snapshots:[],error:''};
reminderCloud={ready:true,version:7,enabled:false,synced:true,busy:false,queued:false,error:''};
operationsState={user:activeUserId,ready:true,version:1,payload:{company:{},creditReviews:{},virtuals:[],attachments:[]},error:''};
sb=mock;downloadBlob=captureDownload;renderAll();`);
const pause=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(){await pause();await pause();assert.equal(errors.length,0,errors.join('\n'));}
function get(selector){const el=document.querySelector(selector);assert(el,'Missing control: '+selector);return el;}
async function click(selector){const el=get(selector);assert(!el.disabled,'Disabled control: '+selector);el.click();await settle();return el;}
async function change(id,value){const el=document.getElementById(id);assert(el,'Missing field: '+id);el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));await settle();}
async function tab(name){await click('[data-ops-tab="'+name+'"]');assert.equal(run('operationsTab'),name);assert(get('[data-ops-tab="'+name+'"]').getAttribute('aria-selected')==='true');}
function closeModals(){for(const el of document.querySelectorAll('.open'))el.classList.remove('open');}
function input(form,name,value){form.elements.namedItem(name).value=value;}
async function submit(form){assert(form.checkValidity(),'Form '+form.id+' must pass native validation: '+[...form.elements].filter(e=>e.validity&&!e.validity.valid).map(e=>e.name+': '+e.validationMessage).join('; '));form.requestSubmit(form.querySelector('button[type="submit"]'));await settle();}
const financial=run('JSON.stringify({customers,invoices,payments,receipts,localPayments,plans,promises,creditNotes,creditSettings,invoiceCancellations})');
(async()=>{try{
 // Real DOM bubbling, hidden sections, selected tabs and keyboard navigation.
 for(const name of ['operations','invoices','payments','customers','promises','statements','collections','analysis','overview']){await click('[data-tab="'+name+'"]');assert(!document.getElementById('view-'+name).classList.contains('hidden'),name+' visible');assert.equal(document.querySelectorAll('.view:not(.hidden)').length,1);}
 assert(chartUpdates.some(x=>x.kind==='reset'),'Entering chart views restarts a short animation');
 const resets=chartUpdates.filter(x=>x.kind==='reset').length;run('renderAll()');assert.equal(chartUpdates.filter(x=>x.kind==='reset').length,resets,'Data refresh does not restart navigation animation');
 reducedMotion=true;await click('[data-tab="analysis"]');assert.equal(chartUpdates.filter(x=>x.kind==='reset').length,resets,'Reduced motion does not animate charts');reducedMotion=false;
 await click('[data-tab="operations"]');for(const name of ['day','reports','quality','audit','documents','virtuals','settings']){await tab(name);assert(get('#opsPanel h2').textContent.length>5);}
 await tab('day');get('[data-ops-tab="day"]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await settle();assert.equal(run('operationsTab'),'reports');
 // Buttons must open the correct visible record, not merely execute a handler.
 for(const [tool,action,modal] of [['day','client','detailModal'],['day','activity','detailModal'],['day','statement','clientStatementModal'],['quality','invoice','invoiceEditModal'],['quality','customer','customerEditModal'],['virtuals','virtual-edit','detailModal']]){await tab(tool);await click('#opsPanel [data-ops-action="'+action+'"]'+(tool==='quality'&&action==='invoice'?'[data-value="i2"]':''));assert(document.getElementById(modal).classList.contains('open'),action+' opens editor');closeModals();}
 // The first real quality row can be a cancelled invoice; reviewing it must open details.
 await tab('quality');const firstReview=get('#opsPanel .ops-table [data-ops-action="invoice"]');assert.equal(firstReview.dataset.value,'i0');
 const beforeReview=run('JSON.stringify({invoices,payments,receipts,invoiceCancellations})'),beforeWrites=writes.length;
 await click('#opsPanel .ops-table [data-ops-action="invoice"]');assert(get('#detailModal').classList.contains('open'),'First-row review opens cancelled invoice details');assert(get('#detailTitle').textContent.includes('INV/2026/CANCELADA'));assert(get('#detailContent').textContent.includes('Captura <incorrecta>'));assert(get('#detailContent').textContent.includes('INV/2026/1'));assert(!get('#detailContent').innerHTML.includes('<incorrecta>'),'Cancellation notes are escaped');assert(!get('#invoiceEditModal').classList.contains('open'),'Cancelled invoice is never edited');await click('#closeDetail');assert(!get('#detailModal').classList.contains('open'));
 await click('#opsPanel [data-ops-action="invoice"][data-value="i2"]');assert(get('#invoiceEditModal').classList.contains('open'),'Open invoices still use the editor');assert.equal(get('#editInvoiceNumber').value,'INV/2026/2');closeModals();assert.equal(run('JSON.stringify({invoices,payments,receipts,invoiceCancellations})'),beforeReview);assert.equal(writes.length,beforeWrites,'Reviewing either status never writes financial data');
 // Report controls actually change output, filter availability and downloads.
 await tab('reports');await change('opsReportStart','2026-10-01');await change('opsReportEnd','2026-10-31');
 for(const type of ['cash','hold','promises','tracking','executive']){await change('opsReportType',type);assert(run('opsReportModel'));assert.equal(get('#opsReportBusiness').disabled,!['cash','executive'].includes(type));await click('[data-ops-action="report-build"]');}
 await change('opsReportType','hold');await tab('day');await tab('reports');await change('opsReportType','cash');assert(!get('#opsReportBusiness').disabled,'Changing back to cash re-enables the selector');
 await change('opsReportBusiness','Foam');assert(run('opsReportModel.rows.every(r=>["Foam","TOTAL"].includes(r[1]))'));
 for(const action of ['report-excel','report-copy','report-image','report-week','report-month'])await click('[data-ops-action="'+action+'"]');
 assert(downloads.some(x=>x.name.endsWith('.xlsx')&&x.blob.size>1000));assert(downloads.some(x=>x.name.endsWith('.png')&&x.blob.size>1000));assert(copies.some(text=>text.includes('AMAO |')));
 failCopy=true;await click('[data-ops-action="report-copy"]');assert(get('#opsFeedback').textContent.includes('Ctrl + C'));assert.equal(get('#opsReportText').selectionStart,0);failCopy=false;
 await change('opsReportStart','2027-12-31');assert.equal(run('opsReportModel'),null);assert.equal(get('#opsReportText').value,'');const count=downloads.length;await click('[data-ops-action="report-excel"]');assert.equal(downloads.length,count);assert(get('#opsFeedback').textContent.includes('periodo'));await change('opsReportStart','2026-10-01');
 await tab('quality');await click('[data-ops-action="quality-export"]');assert(downloads.some(x=>x.name.startsWith('Calidad_datos')));
 // Audit uses light list reads, requests one detail, and recovers from failures.
 await tab('audit');assert.equal(queries.filter(x=>x.table==='ar_audit_log'&&!x.one).at(-1).columns.includes('before_data'),false);
 await click('[data-ops-action="audit-detail"]');assert(get('#detailModal').classList.contains('open'));assert(get('#detailContent').textContent.includes('99'));closeModals();
 await click('[data-ops-action="audit-next"]');assert(get('#opsPanel').textContent.includes('Página 2'));await click('[data-ops-action="audit-prev"]');assert(get('#opsPanel').textContent.includes('Página 1'));
 failAudit=true;await click('[data-ops-action="audit-load"]');assert(get('#opsPanel [role="alert"]').textContent.includes('prueba'));failAudit=false;await click('[data-ops-action="audit-load"]');assert(get('#opsPanel').textContent.includes('Ver cambios'));
 let releaseAudit;auditGate=new Promise(resolve=>releaseAudit=resolve);get('[data-ops-action="audit-load"]').click();await settle();assert(get('#opsPanel').textContent.includes('Consultando'));await tab('settings');releaseAudit();await settle();assert(get('#opsPanel h2').textContent.includes('Empresa'),'Late response cannot replace another tool');
 // Company, user permissions, password and credit review forms use real named fields.
 await click('[data-ops-action="users-load"]');const own=get('[data-ops-role="test-admin"]');assert(own.disabled);get('[data-ops-role="other-user"]').value='cobranza';await click('[data-ops-action="user-role"][data-value="other-user"]');assert(writes.some(x=>x.table==='profiles'&&x.update.role==='cobranza'));
 let form=get('#opsCompanyForm');input(form,'legal_name','Empresa de prueba');input(form,'email','cobranza@example.com');input(form,'copy_email','copia@example.com');await submit(form);assert.equal(run('operationsState.payload.company.legal_name'),'Empresa de prueba');
 let releaseSave;writeGate=new Promise(resolve=>releaseSave=resolve);form=get('#opsCompanyForm');input(form,'legal_name','Empresa guardada en segundo plano');form.requestSubmit(form.querySelector('button[type="submit"]'));await settle();await tab('day');releaseSave();await settle();assert(get('#opsPanel h2').textContent.includes('Mi día'),'A completed save cannot replace the selected tool');await tab('settings');
 form=get('#opsPasswordForm');input(form,'password','synthetic-password-123');input(form,'confirm','synthetic-other-123');await submit(form);assert(get('#opsPasswordFeedback').textContent.includes('coinciden'));input(form,'confirm','synthetic-password-123');await submit(form);assert(writes.some(x=>x.name==='password'));assert.equal(form.elements.password.value,'');
 run('openOpsCreditReview("c1")');form=get('#opsCreditReviewForm');input(form,'date','2026-11-01');input(form,'notes','Revisión de prueba');await submit(form);assert.equal(run('operationsState.payload.creditReviews.c1.date'),'2026-11-01');closeModals();
 // Virtual records can be edited, validated, exported and removed.
 await tab('virtuals');await change('opsVirtualMonth','2026-10');await click('[data-ops-action="virtual-edit"]');form=get('#opsVirtualForm');input(form,'status','Cerrada');await submit(form);assert(get('#opsModalFeedback').textContent.includes('apertura'));input(form,'status','Abierta');input(form,'opened_on','2026-10-20');input(form,'folio','V-PRUEBA');await submit(form);assert.equal(run('operationsState.payload.virtuals[0].folio'),'V-PRUEBA');
 await click('[data-ops-action="virtual-export"]');assert(downloads.some(x=>x.name.startsWith('Virtuales_HFP_')));await click('[data-ops-action="virtual-edit"]');form=get('#opsVirtualForm');input(form,'folio','V-PRUEBA-EDITADA');await submit(form);assert.equal(run('operationsState.payload.virtuals[0].folio'),'V-PRUEBA-EDITADA');await click('[data-ops-action="virtual-remove"]');assert(run('Boolean(operationsState.payload.virtuals[0].removed_at)'));
 // Customer/record selectors and private attachment opening work through DOM controls.
 await tab('documents');await change('opsDocumentCustomer','c1');await change('opsDocumentEntity','invoice');await change('opsDocumentRecord','i1');form=get('#opsDocumentForm');form.elements.document.required=false;/* jsdom has no native file picker; inject a synthetic FileList below. */Object.defineProperty(form.elements.document,'files',{configurable:true,value:[new w.File(['documento de prueba'],'comprobante.txt',{type:'text/plain'})]});await submit(form);assert.equal(uploads.length,1);assert.equal(run('operationsState.payload.attachments.length'),1);
 await click('[data-ops-action="document-open"]');assert(get('#detailModal').classList.contains('open'));assert(get('#detailContent a').href.includes('files.example.com'));assert(get('#detailContent iframe'));closeModals();
 failSave=true;await click('[data-ops-action="document-remove"]');assert(get('#opsFeedback').textContent.includes('Conflicto'));assert(!run('operationsState.payload.attachments[0].removed_at'));failSave=false;await click('[data-ops-action="document-remove"]');assert(run('Boolean(operationsState.payload.attachments[0].removed_at)'));
 // Reload uses the full data path, deduplicates pending clicks and re-enables controls.
 w.reloadProbe=async()=>{await new Promise(resolve=>reloadRelease=resolve);};run('loadData=async function(){await reloadProbe();refreshCollectionModels();renderAll();};');const reload=get('#opsReload');reload.click();await settle();assert(reload.disabled);reload.click();await settle();reloadRelease();await settle();assert(!reload.disabled);assert(get('#opsFeedback').textContent.includes('actualizadas'));
 await assert.rejects(run('opsRead(new Promise(()=>{}),5)'),e=>e.message.includes('tardando'));
 assert.equal(run('JSON.stringify({customers,invoices,payments,receipts,localPayments,plans,promises,creditNotes,creditSettings,invoiceCancellations})'),financial,'Tool navigation and test operations preserve the financial ledger');assert.equal(run('reminderCloud.enabled'),false);
 run('dashboardAccess.role="solo_consulta";collectionState.role="solo_consulta";applyDashboardAccess();');await tab('settings');assert(!document.getElementById('opsCompanyForm'));assert(!document.querySelector('[data-ops-action="users-load"]'));await tab('documents');assert(!document.getElementById('opsDocumentForm'));await tab('audit');assert(get('#opsPanel').textContent.includes('permiso'));
 console.log('PASS: full HTML DOM: nine sections, seven tools, keyboard/animations, report filters and real XLSX/PNG/copy, audit paging/detail/retry/races, customer/invoice editors, company/users/password/credit forms, virtual create/edit/remove/export, private document upload/open/remove, reload deduplication and viewer permissions. All network and account writes are mocked.');
 }finally{dom.window.close();}
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1});
