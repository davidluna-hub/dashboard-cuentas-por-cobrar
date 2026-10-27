import './billing-core.js';
import './weekly-core.js';
import './core.js';
const core=(globalThis as any).ArCollectionTools;
const URL=Deno.env.get('SUPABASE_URL')!,KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,ANON=Deno.env.get('SUPABASE_ANON_KEY')!;
const json=(value:unknown,status=200,cors:Record<string,string>={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json',...cors}});
async function rest(path:string,options:RequestInit={}){const response=await fetch(URL+'/rest/v1/'+path,{...options,headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'}});if(!response.ok)throw Error('Database request failed: '+response.status);return response.json();}
const rpc=(name:string,data:unknown={})=>rest('rpc/'+name,{method:'POST',body:JSON.stringify(data)});
async function isAdmin(token:string){if(!token)return false;const response=await fetch(URL+'/auth/v1/user',{headers:{apikey:ANON,Authorization:'Bearer '+token}});if(!response.ok)return false;const user=await response.json(),profiles=await rest('profiles?select=role&id=eq.'+encodeURIComponent(user.id));return profiles[0]?.role==='admin';}
export async function handle(req:Request){
 const origin=req.headers.get('origin')||'',allowed=['https://davidluna-hub.github.io','http://localhost:8000','http://127.0.0.1:8000'],cors:Record<string,string>=allowed.includes(origin)?{'Access-Control-Allow-Origin':origin,Vary:'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'}:{};
 if(req.method==='OPTIONS')return new Response('',{headers:cors});if(req.method!=='POST')return json({error:'POST required'},405,cors);
 try{
  const body=await req.json(),manual=body.action==='manual',baseline=body.action==='baseline';
  if(manual){if(!await isAdmin((req.headers.get('authorization')||'').replace(/^Bearer /i,'')))return json({error:'Solo administración puede guardar un corte manual.'},403,cors);}
  else if(!await rpc('ar_is_job_authorized',{provided_secret:req.headers.get('x-amao-job-secret')||''}))return json({error:'Unauthorized'},401,cors);
  const now=new Date(),zone='America/Ciudad_Juarez',hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:zone,hour:'2-digit',hourCycle:'h23'}).format(now));
  if(!manual&&!baseline&&hour!==23)return json({skipped:'outside_local_close'});
  const source=await rpc('ar_portfolio_source');if(!source.workspace||source.workspace.version<1)return json({error:'Primero sincroniza la cartera.'},409,cors);
  if(manual&&body.expected_version!==source.workspace.version)return json({error:'La cartera cambió. Actualiza y sincroniza antes de guardar el corte.'},409,cors);
  const onDate=core.day(new Date(source.captured_at)),data={...source.workspace.payload,customers:source.customers,invoices:source.invoices,payments:source.payments},summary=core.snapshot(data,onDate);
  const saved=await rpc('ar_store_portfolio_cut',{cut_kind:manual||baseline?'manual':'daily',origin_at:source.captured_at,expected_version:source.workspace.version,cut_summary:summary});
  return json({saved},200,cors);
 }catch{console.error('Portfolio snapshot failed');return json({error:'No se pudo guardar el corte. Actualiza la cartera e intenta de nuevo.'},500,cors);}
}
Deno.serve(handle);
