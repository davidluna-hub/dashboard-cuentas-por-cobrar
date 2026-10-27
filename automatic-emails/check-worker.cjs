const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),{stripTypeScriptTypes}=require('node:module'),core=require('./core.js');
let source=fs.readFileSync(__dirname+'/index.ts','utf8').replace(/^import[^\n]+\n/gm,'').replace(/export async function handle/,'async function handle').replace('Deno.serve(handle);','');source=stripTypeScriptTypes(source,{mode:'transform'});
const baseDate=new Date('2026-10-22T15:00:00Z');class TestDate extends Date{constructor(...args){super(...(args.length?args:[baseDate]))}}
let enabled=false,claimed=false,emailCalls=0,finishes=[],requests=[];
const customer={id:'c1',legal_name:'Cliente de prueba',email:'test@example.com',active:true},invoice={id:'i1',customer_id:'c1',invoice_number:'INV/2026/1',invoice_date:'2026-10-01',due_date:'2026-10-26',currency:'MXN',total:100,status:'abierta'};
const state={creditSettings:[{customer_id:'c1',credit_days:30,limit_mxn:50}],localPayments:[],holdPreferences:{days:60}};
const context={console,Intl,Date:TestDate,Request,Response,TextEncoder,Uint8Array,Array,JSON,Error,AbortSignal,crypto:require('crypto').webcrypto,setTimeout(fn){fn()},btoa:s=>Buffer.from(s,'binary').toString('base64'),Deno:{env:{get:k=>({SUPABASE_URL:'https://supabase.test',SUPABASE_SERVICE_ROLE_KEY:'server',SUPABASE_ANON_KEY:'public'})[k]}},ArBillingCore:core,companyLogo:'data:image/png;base64,MOCK',statementPDF:async()=>new Uint8Array([80,68,70]),fetch:async(url,options={})=>{
 requests.push(url);const data=options.body?JSON.parse(options.body):{};let result;
 if(url.includes('rpc/ar_is_job_authorized'))result=data.provided_secret==='job-secret';
 else if(url.includes('ar_reminder_workspace'))result=[{enabled,send_hour:9,timezone:'America/Ciudad_Juarez',version:1,payload:state}];
 else if(url.includes('rpc/ar_get_provider_credentials'))result={key:'TEST-KEY',sender:'sender@example.com',verified:true};
 else if(url.includes('/ar_operations?'))result=[{payload:{company:{email:'sender@example.com',copy_email:'copy@example.com'}}}];else if(url.includes('/customers?'))result=[customer];else if(url.includes('/invoices?'))result=[invoice];else if(url.includes('/payments?'))result=[];
 else if(url.includes('rpc/ar_claim_reminder')){result=claimed?null:data.prepared_payload;claimed=true;}
 else if(url.includes('rpc/ar_finish_reminder')){finishes.push(data);result=null;}
 else if(url==='https://api.resend.com/emails'){emailCalls++;assert.equal(options.headers['Idempotency-Key'],'amao/c1/2026-10-22');assert.equal(data.from,'sender@example.com');assert.deepEqual(data.cc,['copy@example.com']);assert.equal(data.to.length,1);assert.equal(data.attachments.length,1);assert.match(data.html,/INV\/2026\/1/);assert.match(data.subject,/Credit Hold/);assert.match(data.subject,/22\/10\/2026/);assert(!data.data_fingerprint);result={id:'accepted-id'};}
 else throw Error('Unexpected fetch '+url);
 return Response.json(result);
}};vm.createContext(context);vm.runInContext(source,context);
async function run(secret){return vm.runInContext(`handle(new Request('https://worker.test',{method:'POST',headers:{'Content-Type':'application/json','x-amao-job-secret':${JSON.stringify(secret)}},body:'{"action":"run"}'}))`,context)}
(async()=>{let r=await run('wrong');assert.equal(r.status,401);assert.equal(emailCalls,0);r=await run('job-secret');assert.equal((await r.json()).skipped,'disabled');assert.equal(emailCalls,0);
enabled=true;r=await run('job-secret');assert.equal((await r.json()).accepted,1);assert.equal(emailCalls,1);assert.equal(finishes[0].next_status,'accepted');r=await run('job-secret');assert.equal((await r.json()).accepted,0);assert.equal(emailCalls,1,'Same client/day must not be sent twice');
console.log('PASS: worker rejects unauthorized callers, disabled service never sends, due+hold combine into one PDF email, same-day duplicate is skipped. All network calls were mocked.');
})().catch(e=>{console.error(e);process.exit(1)});
