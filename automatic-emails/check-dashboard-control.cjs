const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{textContent:'',className:'',value:'',disabled:false,attributes:{},events:{},setAttribute(k,v){this.attributes[k]=v},addEventListener(k,f){this.events[k]=f},scrollIntoView(){this.scrolled=true}});return elements.get(id)}
const context={console,Promise,Error,Number,String,Object,Map,Set,Array,JSON,Date,setTimeout(){},$:el,activeUserId:'admin',featuresReady:true,renderAll(){},document:{addEventListener(){}},window:{},localStorage:{getItem(){return null},setItem(){},removeItem(){}},go(tab){context.lastTab=tab},saveLocalFeatureData(){},showMsg(){}};
vm.createContext(context);vm.runInContext(fs.readFileSync('automatic-emails/frontend.js','utf8'),context);
vm.runInContext('renderReminderControls=renderDashboardReminderControl;',context);
const run=s=>vm.runInContext(s,context);
let calls=[],remote,providerReady=true,rejectWrite=false,holdRead=null;
context.sb={async rpc(name,args){calls.push({name,args});if(name==='ar_read_reminder_workspace'){if(holdRead)await holdRead;return {data:{...remote}}}if(name==='ar_provider_status')return {data:{ready:providerReady,message:'Falta verificar el remitente.'}};if(name==='ar_configure_reminders'){if(rejectWrite)return {error:{message:'No se pudo guardar.'}};remote.enabled=args.next_enabled;remote.send_hour=args.next_hour;return {data:{enabled:args.next_enabled,hour:args.next_hour}}}throw Error(name)}};
function reset({enabled=false,synced=true,version=4}={}){calls=[];remote={enabled,version,send_hour:13,timezone:'America/Ciudad_Juarez'};providerReady=true;rejectWrite=false;holdRead=null;run(`reminderCloud={ready:true,version:4,enabled:${enabled},hour:9,zone:'America/Ciudad_Juarez',synced:${synced},busy:false,queued:false,error:'',providerReady:false};reminderServiceFeedback='';reminderServiceSaving=false;`)}
const writes=()=>calls.filter(x=>x.name==='ar_configure_reminders');
(async()=>{
 run('renderDashboardReminderControl()');assert.equal(el('dashboardReminderToggle').disabled,true);assert.equal(el('dashboardReminderStatus').textContent,'Sin conexión');
 reset();await el('dashboardReminderToggle').events.click();assert.equal(remote.enabled,true);assert.equal(writes()[0].args.next_hour,13);assert.equal(el('dashboardReminderStatus').textContent,'Activos');assert.equal(el('dashboardReminderToggle').attributes['aria-checked'],'true');assert.equal(el('dashboardReminderToggle').textContent,'Pausar correos');
 reset({enabled:true,synced:false});providerReady=false;await el('pauseReminderService').events.click();assert.equal(remote.enabled,false);assert.equal(calls.some(x=>x.name==='ar_provider_status'),false);assert.equal(el('dashboardReminderStatus').textContent,'Pausados');
 reset();providerReady=false;await run('setReminderServiceEnabled(true)');assert.equal(writes().length,0);assert.equal(run('reminderCloud.enabled'),false);assert.match(el('dashboardReminderFeedback').textContent,/verificar/);
 reset({synced:false});await run('setReminderServiceEnabled(true)');assert.equal(writes().length,0);
 reset({version:5});await run('setReminderServiceEnabled(true)');assert.equal(writes().length,0);assert.equal(run('reminderCloud.version'),4,'Do not adopt a remote financial revision without loading its data');
 reset({enabled:true});rejectWrite=true;await run('setReminderServiceEnabled(false)');assert.equal(el('dashboardReminderStatus').textContent,'Activos');assert.match(el('dashboardReminderFeedback').textContent,/No se pudo guardar/);
 reset();let release;holdRead=new Promise(resolve=>release=resolve);const first=run('setReminderServiceEnabled(true)');assert.equal(el('dashboardReminderToggle').disabled,true);await run('setReminderServiceEnabled(true)');release();await first;assert.equal(writes().length,1,'Double click writes once');
 reset({enabled:false});run('reminderCloud.enabled=true');await run('setReminderServiceEnabled(false)');assert.equal(writes()[0].args.next_enabled,false,'A stale pause action must never activate emails');
 reset();run('reminderCloud.enabled=true');el('reminderDueDays').value='7';el('reminderHoldLead').value='7';el('reminderSendHour').value='11';await el('reminderSettingsForm').events.submit({preventDefault(){}});assert.equal(writes()[0].args.next_enabled,false,'Editing schedule preserves the actual paused state');assert.equal(remote.send_hour,11);
 el('dashboardReminderConfigure').events.click();assert.equal(context.lastTab,'customers');assert.equal(el('reminderSettingsPanel').open,true);assert.equal(el('reminderSettingsPanel').scrolled,true);
 const html=fs.readFileSync('index.html','utf8');assert.equal((html.match(/id="dashboardReminderToggle"/g)||[]).length,1);assert.ok(html.indexOf('id="dashboardReminderToggle"')<html.indexOf('id="overviewMetrics"'));
 console.log('PASS: dashboard toggle, confirmed persistence, pause without provider, activation prerequisites, failed saves, duplicate clicks, stale states, schedule and configuration navigation (mocked RPC only).');
})().catch(e=>{console.error(e);process.exitCode=1});
