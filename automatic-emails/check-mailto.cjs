const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const core=require('./core.js');
const elements=new Map(),drafts=[],messages=[],busy=[];
function el(id){if(!elements.has(id))elements.set(id,{dataset:{customerId:'c1'},events:{},addEventListener(type,handler){this.events[type]=handler}});return elements.get(id)}
let downloads=0,failDownload=false;
const addresses=['compras@example.com','servicio@example.com','pagos@example.net','j.escobedo@example.com'];
const customer={id:'c1',legal_name:'Cliente & prueba + Norte',email:addresses.join(','),notes:JSON.stringify({amao_customer_profile:1,contacts:[{email:'compras@example.com; contacto@example.org'},{email:'excluded@example.com',receive_reminders:false}]})};
const company={email:'cobranza@example.com',copy_email:'responsable@example.com'};
const context={console,Promise,Error,Number,String,Object,Map,Set,Array,JSON,Date,encodeURIComponent,setTimeout(){},$:el,
 document:{addEventListener(){}},window:{location:{set href(uri){drafts.push(uri)}}},
 localStorage:{getItem(){return null},setItem(){},removeItem(){}},activeUserId:'admin',featuresReady:true,renderAll(){},go(){},saveLocalFeatureData(){},
 operationsState:{ready:true},opsCompany:()=>company,customers:[customer],reminderCustomers:{},clientStatementAccount:()=>({}),
 ArBillingCore:{...core,statementBanks:()=>[]},
 setBusy(button,state){busy.push(state)},showMsg(message){messages.push(message)},alert(message){messages.push(message)},
 async buildStatementFiles(){if(failDownload)throw Error('PDF unavailable');downloads++;return 1}
};
vm.createContext(context);
const buildFiles=context.buildStatementFiles,statementAccount=context.clientStatementAccount;
vm.runInContext(fs.readFileSync('automatic-emails/frontend.js','utf8'),context);
context.buildStatementFiles=buildFiles;context.clientStatementAccount=statementAccount;
const run=code=>vm.runInContext(code,context);
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf("$('emailClientStatement').addEventListener");
const end=html.indexOf("$('exportInvoices').addEventListener",start);
assert(start>=0&&end>start,'Statement button handler exists in the built dashboard');
vm.runInContext(html.slice(start,end),context);
function parsed(uri){const split=uri.indexOf('?');return {to:decodeURIComponent(uri.slice(7,split)),query:new URLSearchParams(uri.slice(split+1))}}
(async()=>{
 const uri=run('holdNoticeMailto(["first@example.com","second@example.com"],["copy@example.com"],"A subject","Body")');
 assert.equal(uri,'mailto:first%40example.com%3Bsecond%40example.com?cc=copy%40example.com&subject=A%20subject&body=Body','Outlook must receive semicolons, including when comma-separated recipients are disabled');
 const special='AVISO: Crédito · Cliente & Norte + #1? 100%';
 const body='Primera línea\r\nSegunda: ¿cuándo? & + % #';
 context.special=special;context.body=body;
 const mixed=parsed(run('holdNoticeMailto(["FIRST@example.com,second@example.com;third@example.net\\nfourth@example.org","first@example.com"],["SECOND@example.com;copy@example.com, COPY@example.com\\nextra@example.org"],special,body)'));
 assert.equal(mixed.to,'first@example.com;second@example.com;third@example.net;fourth@example.org');
 assert.equal(mixed.query.get('cc'),'copy@example.com;extra@example.org','Copies are split and deduplicated against To and CC');
 assert.equal(mixed.query.get('subject'),special,'Accents and URI delimiters are encoded once');
 assert.equal(mixed.query.get('body'),body,'Line breaks and special characters survive');
 assert.throws(()=>run('holdNoticeMailto(["not-an-email"],[],"Subject","Body")'),/correo válido/);
 assert.equal(parsed(run('holdNoticeMailto(["one@example.com"],[],"Subject","Body")')).query.has('cc'),false);
 context.holdNoticeFacts=()=>({to:core.recipients(customer),cc:company.copy_email,subject:special,body});
 await run('prepareHoldNoticeEmail("c1",$("emailCreditHoldNotice"))');
 assert.equal(downloads,1);assert.equal(drafts.length,1);
 const expected=[...addresses,'contacto@example.org'].join(';');
 assert.equal(parsed(drafts[0]).to,expected,'Credit Hold opens all selected contacts independently');
 assert.equal(parsed(drafts[0]).query.get('cc'),company.copy_email);
 assert.equal(parsed(drafts[0]).query.get('body'),body);
 Object.assign(core.mailDefaults,{sender:company.email,cc:company.copy_email});
 await el('emailClientStatement').events.click({currentTarget:el('emailClientStatement')});
 assert.equal(downloads,2);assert.equal(drafts.length,2);
 assert.equal(parsed(drafts[1]).to,expected,'Statement uses the same recipient formatting');
 assert.equal(parsed(drafts[1]).query.get('cc'),company.copy_email);
 assert.match(parsed(drafts[1]).query.get('subject'),/Estado de cuenta AMAO · Cliente & prueba \+ Norte/);
 assert.match(parsed(drafts[1]).query.get('body'),/fecha de promesa de pago/);
 customer.email='invalid';customer.notes='{}';
 await el('emailClientStatement').events.click({currentTarget:el('emailClientStatement')});
 await run('prepareHoldNoticeEmail("c1",$("emailCreditHoldNotice"))');
 assert.equal(drafts.length,2,'Missing addresses must never open an empty draft');
 assert.equal(downloads,2,'Validate recipients before generating attachments');
 customer.email=addresses.join(',');failDownload=true;
 await el('emailClientStatement').events.click({currentTarget:el('emailClientStatement')});
 await run('prepareHoldNoticeEmail("c1",$("emailCreditHoldNotice"))');
 assert.equal(drafts.length,2,'Failed attachment generation does not open a draft');
 assert.equal(busy.at(-1),false,'Buttons recover after errors');
 assert.match(messages.join('\n'),/correo válido/);
 console.log('PASS: Outlook recipient separators; mixed lists; duplicate To/CC; encoding; both real email handlers; invalid addresses; attachment failures. No email sent.');
})().catch(error=>{console.error(error);process.exitCode=1});
