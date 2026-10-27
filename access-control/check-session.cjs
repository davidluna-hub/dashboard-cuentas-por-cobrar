const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('access-control/ui.js','utf8').split('let dashboardAccess=')[0],html=fs.readFileSync('index.html','utf8');
const url=html.match(/const SUPABASE_URL='([^']+)'/)[1],key=html.match(/const SUPABASE_ANON_KEY='([^']+)'/)[1];
function setup(window){const context={console,URL,Headers,Error,SUPABASE_URL:url,SUPABASE_ANON_KEY:key,window};vm.createContext(context);vm.runInContext(source,context);return context;}
(async()=>{
 const calls=[];let custom;
 const context=setup({fetch:async(input,options)=>{calls.push({input,options});return {ok:true};},supabase:{createClient(_url,_key,options){custom=options.global.fetch;return {};}}});
 vm.runInContext('createDashboardClient()',context);
 await assert.rejects(custom(url+'/rest/v1/profiles',{headers:{Authorization:'Bearer anon-key'}}),/sesión/);assert.equal(calls.length,0);
 vm.runInContext('dashboardSessionToken="fresh-session"',context);
 await custom(url+'/rest/v1/profiles',{headers:{Authorization:'Bearer anon-key',apikey:key}});assert.equal(calls[0].options.headers.get('Authorization'),'Bearer fresh-session');assert.equal(calls[0].options.headers.get('apikey'),key);
 await custom(url+'/auth/v1/token',{headers:{Authorization:'Bearer anon-key'}});assert.equal(calls[1].options.headers.Authorization,'Bearer anon-key','Auth endpoint retains its own headers');
 await custom('https://example.com/test',{headers:{test:'unchanged'}});assert.equal(calls[2].options.headers.Authorization,undefined,'No session token goes to another host');
 vm.runInContext('dashboardSessionToken="refreshed-session"',context);await custom(url+'/functions/v1/amao-portfolio-history',{headers:new Headers({apikey:key})});assert.equal(calls[3].options.headers.get('Authorization'),'Bearer refreshed-session');
 vm.runInContext('dashboardSessionToken=null',context);await assert.rejects(custom(url+'/rest/v1/invoices',{headers:{apikey:key}}),/sesión/);
 assert(html.includes('applySession=session=>{dashboardSessionToken=session?.access_token||null;'));assert(html.includes('sb=createDashboardClient();'));
 console.log('PASS: first-session headers override anon fallback, refresh updates JWT, logout blocks data, auth and external requests stay unchanged.');
 if(process.env.AMAO_VIEWER_TEST_PASSWORD){
  const sdk=vm.runInThisContext(fs.readFileSync('work/supabase-sdk-2.118.0.cjs','utf8')+'\nsupabase;'),wireRoles=[];
  const live=setup({supabase:sdk,fetch:async(input,options)=>{if(String(input).includes('/rest/v1/')){const token=new Headers(options.headers).get('Authorization')?.split(' ')[1];wireRoles.push(JSON.parse(Buffer.from(token.split('.')[1],'base64url')).role);}return fetch(input,options);}});
  const client=vm.runInContext('createDashboardClient()',live);let resolveFirst,rejectFirst;const first=new Promise((resolve,reject)=>{resolveFirst=resolve;rejectFirst=reject;});
  client.auth.onAuthStateChange((event,session)=>{live.sessionToken=session?.access_token||null;vm.runInContext('dashboardSessionToken=sessionToken',live);if(event==='SIGNED_IN')setTimeout(async()=>{try{
   const profile=await client.from('profiles').select('role').eq('id',session.user.id).maybeSingle();if(profile.error)throw profile.error;assert.equal(profile.data?.role,'solo_consulta');
   const shared=await client.rpc('ar_read_dashboard_workspace');if(shared.error)throw shared.error;assert(shared.data.payload.receipts.length>0);
   const invoices=await client.from('invoices').select('id').limit(1);if(invoices.error)throw invoices.error;assert.equal(invoices.data.length,1);
   const blocked=await client.rpc('ar_configure_reminders',{next_enabled:false,next_hour:9,next_timezone:'America/Ciudad_Juarez'});assert.equal(blocked.error?.code,'42501');
   resolveFirst({role:profile.data.role,workspaceVersion:shared.data.version,receipts:shared.data.payload.receipts.length,profileRequestsAuthenticated:wireRoles.every(role=>role==='authenticated')});
  }catch(error){rejectFirst(error);}},0);});
  try{const auth=await client.auth.signInWithPassword({email:'alejandro.ortiz@amaoenterprises.com',password:process.env.AMAO_VIEWER_TEST_PASSWORD});if(auth.error)throw auth.error;const result=await first;assert(result.profileRequestsAuthenticated);console.log('PASS: SDK 2.118.0 fresh sign-in immediately reads the real viewer profile and shared data; writes remain denied. '+JSON.stringify(result));}
  finally{await client.auth.signOut({scope:'local'});await client.auth.stopAutoRefresh();}
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});

