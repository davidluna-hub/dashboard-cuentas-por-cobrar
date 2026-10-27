import './core.js';
import {statementPDF} from './pdf.js';
import {companyLogo} from './logo.js';
const core=(globalThis as any).ArBillingCore;
const URL=Deno.env.get('SUPABASE_URL')!,KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,ANON=Deno.env.get('SUPABASE_ANON_KEY')!;
const json=(value:unknown,status=200,cors:Record<string,string>={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json',...cors}});
async function rest(path:string,options:RequestInit={},bearer=KEY){
 const response=await fetch(URL+'/rest/v1/'+path,{...options,headers:{'apikey':KEY,'Authorization':'Bearer '+bearer,'Content-Type':'application/json',...(options.headers||{})}}),text=await response.text();
 if(!response.ok)throw Error('Database request failed: '+response.status);return text?JSON.parse(text):null;
}
const rpc=(name:string,data:unknown={},bearer=KEY)=>rest('rpc/'+name,{method:'POST',body:JSON.stringify(data)},bearer);
async function all(table:string,select:string){const rows:any[]=[];for(let offset=0;;offset+=1000){const chunk=await rest(table+'?select='+select+'&order=id&limit=1000&offset='+offset);rows.push(...chunk);if(chunk.length<1000)return rows;}}
async function isAdmin(token:string){
 if(!token)return false;const response=await fetch(URL+'/auth/v1/user',{headers:{'apikey':ANON,'Authorization':'Bearer '+token}});if(!response.ok)return false;const user=await response.json();const rows=await rest('profiles?select=role&id=eq.'+encodeURIComponent(user.id));return rows[0]?.role==='admin';
}
const base64=(bytes:Uint8Array)=>{let value='';for(let n=0;n<bytes.length;n+=0x4000)value+=String.fromCharCode(...bytes.subarray(n,n+0x4000));return btoa(value);};
export async function handle(req:Request){
 const origin=req.headers.get('origin')||'',allowed=['https://davidluna-hub.github.io','http://localhost:8000','http://127.0.0.1:8000'],cors=allowed.includes(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'}:{};
 if(req.method==='OPTIONS')return new Response('',{headers:cors});if(req.method!=='POST')return json({error:'POST required'},405,cors);
 try{
  const body=await req.json();if(body.action==='status'){
   const token=(req.headers.get('authorization')||'').replace(/^Bearer /i,'');if(!await isAdmin(token))return json({error:'Unauthorized'},401,cors);
   return json(await rpc('ar_provider_status',{},token),200,cors);
  }
  const authorized=await rpc('ar_is_job_authorized',{provided_secret:req.headers.get('x-amao-job-secret')||''});if(!authorized)return json({error:'Unauthorized'},401,cors);
  const [workspace]=await rest('ar_reminder_workspace?id=eq.main&select=*');if(!workspace?.enabled)return json({skipped:'disabled'});
  const now=new Date(),hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:workspace.timezone,hour:'2-digit',hourCycle:'h23'}).format(now));if(hour!==workspace.send_hour)return json({skipped:'outside_local_hour'});
  const credentials=await rpc('ar_get_provider_credentials');if(!credentials?.key||!credentials.verified||!credentials.sender)return json({error:'Email provider is not configured'},503);
  const onDate=core.localDay(now,workspace.timezone),[customers,invoices,payments]=await Promise.all([all('customers','id,legal_name,customer_code,tax_id,email,phone,active,notes'),all('invoices','id,customer_id,invoice_number,invoice_date,due_date,currency,total,status,business_line'),all('payments','id,invoice_id,amount,currency,payment_date')]),accounts=core.buildLedger(customers,invoices,payments,workspace.payload,onDate);
  const [operations]=await rest('ar_operations?id=eq.main&select=payload');if(!operations?.payload?.company?.copy_email)return json({error:'Falta configurar la copia obligatoria de los correos'},503,cors);for(const account of accounts)account.company=operations?.payload?.company||{};
  let accepted=0,failed=0,skipped=0;
  for(const account of accounts){
   const notification=core.reminders(account,workspace.payload,onDate);if(!notification?.to.length){skipped++;continue;}
   const overdue=notification.due.some((i:any)=>i.late>0),notice=notification.hold.length?'Su cuenta presenta condiciones de Credit Hold. Requerimos una fecha de promesa de pago o la fecha en que estarían liquidando el saldo vencido.':overdue?'Tiene facturas vencidas. Requerimos una fecha de promesa de pago o, en su caso, la fecha en que estarían liquidando el saldo vencido.':'Le recordamos las próximas fechas de vencimiento de sus facturas.';
   const dueDetail=notification.due.length?'<h3>Facturas próximas a vencer o vencidas</h3><ul>'+notification.due.map((i:any)=>'<li>'+core.escape(i.invoice_number)+' · '+core.escape(i.due_date)+' · '+core.money(i.balance,i.currency)+' '+i.currency+'</li>').join('')+'</ul>':'';
   const holdDetail=notification.hold.length?'<p>Motivo de Credit Hold: '+notification.hold.map((a:any)=>core.escape(a.currency)+(a.excess>0?' · límite excedido en '+core.money(a.excess,a.currency):' · '+a.maxLate+' días vencidos')).join('; ')+'.</p>':'';
   const routing=core.mailRouting(notification.to,credentials.sender,operations?.payload?.company?.copy_email||''),pdf=await statementPDF(account,core,companyLogo),prepared:any={from:routing.from,to:routing.to,subject:'AMAO | '+(notification.hold.length?'Credit Hold y estado de cuenta':overdue?'Recordatorio de pago':'Próximo vencimiento')+' | '+account.customer.legal_name+' | '+core.statementDate(onDate),
    html:'<!doctype html><html><head><meta charset="utf-8"><style>body{font:13px Arial;color:#243b30}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:7px;border:1px solid #ddd;text-align:left}th{background:#e9f4ef}small,span{display:block}.statement-banner{padding:12px;background:#eef3f0;border-bottom:3px solid #07864f}.statement-banner h2{font-size:16px;margin:0}.statement-banner p{font-size:11px}.statement-logo{width:100px;height:auto}.statement-info{display:table;width:100%;margin:12px 0}.statement-box{display:table-cell;width:50%;vertical-align:top;padding:10px;border:1px solid #e3e9e5}.statement-label{font-size:10px;color:#64736b}.statement-currency{margin-bottom:8px}.statement-section{margin-top:12px}.statement-section h3{font-size:13px}.statement-activity-summary th,.statement-activity-summary td{font-size:10px;padding:4px}.statement-muted{font-size:10px;color:#64736b}.statement-legend,.statement-review{font-size:10px;margin-top:10px;padding:9px;background:#f4f8f5}.statement-bank{font-size:11px}.statement-danger{color:#ad3838}.statement-invoice-promise{display:block;font-size:9px;line-height:1.2;color:#53665e;margin-top:3px}</style></head><body><p>Estimado cliente '+core.escape(account.customer.legal_name)+':</p><p>'+notice+'</p>'+dueDetail+holdDetail+core.statementHTML(account,{companyLogo})+'<p>Si su pago ya fue realizado, comparta el comprobante para conciliarlo. Este aviso se actualiza con el saldo registrado.</p></body></html>',
    attachments:[{filename:'Estado_de_cuenta_AMAO_'+onDate+'.pdf',content:base64(pdf)}]};
   if(routing.cc.length)prepared.cc=routing.cc;
   if(credentials.reply_to)prepared.reply_to=credentials.reply_to;
   const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({account,to:prepared.to,cc:prepared.cc||[],sender:prepared.from,kind:notification.kind}))))).map(b=>b.toString(16).padStart(2,'0')).join('');
   const payload=await rpc('ar_claim_reminder',{target_customer:account.customer.id,target_date:onDate,expected_version:workspace.version,prepared_payload:{state_version:workspace.version,data_fingerprint:fingerprint,message:prepared}});if(!payload){skipped++;continue;}
   const finish=(status:string,id:string|null=null,error:string|null=null)=>rpc('ar_finish_reminder',{target_customer:account.customer.id,target_date:onDate,next_status:status,next_provider_id:id,next_error:error});
   try{
    const latest=(await rest('ar_reminder_workspace?id=eq.main&select=version,enabled'))[0];if(!latest.enabled||latest.version!==workspace.version){await finish('cancelled',null,'Cartera actualizada antes del envío');skipped++;continue;}
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':'Bearer '+credentials.key,'Content-Type':'application/json','Idempotency-Key':'amao/'+account.customer.id+'/'+onDate},body:JSON.stringify(payload.message),signal:AbortSignal.timeout(20000)}),result=await response.json();
    await new Promise(resolve=>setTimeout(resolve,600));
    if(response.ok&&result.id){await finish('accepted',result.id);accepted++;}else{await finish('failed',null,'Resend '+response.status+': '+String(result.name||result.message||'Error').slice(0,160));failed++;}
   }catch{await finish('unknown',null,'Respuesta de proveedor no confirmada; reintento conserva la misma clave y contenido.');failed++;}
  }
  return json({date:onDate,accepted,failed,skipped});
 }catch{console.error('AMao reminder job failed');return json({error:'No se completó el proceso de avisos. Revisa los registros.'},500,cors);}
}
Deno.serve(handle);
