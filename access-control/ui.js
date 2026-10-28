// AMAO_DASHBOARD_ACCESS_START
let dashboardSessionToken=null;
function createDashboardClient(){
 const origin=new URL(SUPABASE_URL).origin,nativeFetch=window.fetch.bind(window);
 return window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{global:{fetch:async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url||String(input),SUPABASE_URL);
  if(url.origin===origin&&(url.pathname.startsWith('/rest/v1/')||url.pathname.startsWith('/functions/v1/')||url.pathname.startsWith('/storage/v1/'))){
   if(!dashboardSessionToken)throw Error('Tu sesión no está disponible. Vuelve a iniciar sesión.');
   const headers=new Headers(options.headers||input.headers);headers.set('Authorization','Bearer '+dashboardSessionToken);
   return nativeFetch(input,{...options,headers});
  }
  return nativeFetch(input,options);
 }}});
}
let dashboardAccess={user:null,role:null,loading:false,error:''};
const dashboardWriteIds=['quickNewInvoice','quickNewPayment','quickNewPromise','toggleInvoiceForm','toggleNewCustomer','newPromiseBtn','newCreditNote','pendingApplyCredit','pendingUseCustomer','pendingFromPayment','saveCollectionSnapshot','newCollectionActivity','importLegacyCredit','saveCustomerCredit','openMovementTrash','dashboardReminderToggle','dashboardReminderConfigure','emailClientStatement','emailCreditHoldNotice'];
const dashboardWriteAttributes=['edit-invoice','new-promise','cancel-invoice','archive-kind','edit-plan','pay-promise','reprogram-plan','credit-customer','use-credit','edit-customer','inline-credit','customer-reminders','edit-historical','edit-receipt','cancel-plan','pending-add','restore-movement','toggle-credit-note','hold-edit','hold-notice','hold-exclude','hold-auto','collection-edit','collection-done','collection-cancel','collection-new','tracking-update','tracking-payment','tracking-promises'];
const dashboardWriteSelector=dashboardWriteIds.map(id=>'#'+id).concat(dashboardWriteAttributes.map(key=>'[data-'+key+']')).join(',');
function dashboardWriteBlocked(){return dashboardAccess.loading||!!dashboardAccess.error||!['admin','facturacion','cobranza'].includes(dashboardAccess.role);}
function dashboardDenyWrite(){showMsg('Tu acceso es de solo consulta. Puedes revisar la cartera y descargar reportes.','error');}
function applyDashboardAccess(){
 const blocked=dashboardWriteBlocked(),role=dashboardAccess.loading?'loading':dashboardAccess.error?'unavailable':dashboardAccess.role||'unknown';
 if(document.body?.dataset)document.body.dataset.dashboardAccess=role;
 const badge=$('dashboardAccessBadge');if(badge){badge.hidden=role!=='solo_consulta';badge.textContent='Solo consulta';}
}
if(document.head&&document.createElement){
 const style=document.createElement('style');
 const hidden=dashboardWriteSelector+',#invoiceFormPanel,#newCustomerPanel,#promiseFormPanel,.payment-entry,#creditManagementPanel,#holdSettingsForm,#holdOverrideForm,#reminderSettingsPanel,.dashboard-reminder-control';
 style.textContent=['solo_consulta','loading','unavailable'].map(role=>hidden.split(',').map(selector=>'body[data-dashboard-access="'+role+'"] '+selector).join(',')+'{display:none!important}').join('\n')+'body[data-dashboard-access="solo_consulta"] .payment-workspace{grid-template-columns:minmax(0,1fr)!important}#dashboardAccessBadge{font-size:11px;padding:4px 8px;border:1px solid #bdd8cf;border-radius:6px;background:#edf7f3;color:#195c46}';
 document.head.appendChild(style);
}
async function loadDashboardAccess(){
 const account=activeUserId;dashboardAccess={user:account,role:null,loading:true,error:''};applyDashboardAccess();
 try{
  const {data,error}=await sb.from('profiles').select('role').eq('id',account).maybeSingle();if(error)throw error;
  if(account!==activeUserId)throw Error('Cambió la sesión. Vuelve a actualizar.');
  if(!['admin','facturacion','cobranza','solo_consulta'].includes(data?.role))throw Error('Tu cuenta no tiene un rol de acceso asignado.');
  dashboardAccess={user:account,role:data.role,loading:false,error:''};
 }catch(error){if(account===activeUserId)dashboardAccess={user:account,role:null,loading:false,error:error.message||'No se pudo comprobar el acceso.'};throw error;}
 finally{applyDashboardAccess();}
}
const loadDataBeforeDashboardAccess=loadData;
let dashboardAccessLoadBusy=false;
loadData=async function(){
 if(!sb||loading||dashboardAccessLoadBusy)return;dashboardAccessLoadBusy=true;
 try{await loadDashboardAccess();return await loadDataBeforeDashboardAccess();}
 catch(error){showMsg('No se pudo comprobar tu acceso: '+(error.message||error),'error');}
 finally{dashboardAccessLoadBusy=false;applyDashboardAccess();}
};
const reminderCloudLoadBeforeDashboardAccess=reminderCloudLoad;
reminderCloudLoad=async function(local){
 if(dashboardAccess.role!=='solo_consulta')return reminderCloudLoadBeforeDashboardAccess(local);
 const account=activeUserId,{data,error}=await sb.rpc('ar_read_dashboard_workspace');if(error)throw error;
 if(account!==activeUserId)throw Error('Cambió la sesión. Actualiza la cartera.');
 if(!data||!data.payload||data.version<1)throw Error('No se encontró la cartera compartida.');
 reminderCloud={...reminderCloud,ready:false,version:data.version,synced:true,busy:false,queued:false,error:'',providerReady:false};
 return data.payload;
};
const saveFeaturesBeforeDashboardAccess=saveLocalFeatureData;
saveLocalFeatureData=function(){if(dashboardWriteBlocked()){dashboardDenyWrite();return false;}return saveFeaturesBeforeDashboardAccess();};
const queueCloudBeforeDashboardAccess=queueReminderCloudSave;
queueReminderCloudSave=function(){if(!dashboardWriteBlocked())return queueCloudBeforeDashboardAccess();};
const flushCloudBeforeDashboardAccess=flushReminderCloud;
flushReminderCloud=function(){return dashboardWriteBlocked()?Promise.resolve():flushCloudBeforeDashboardAccess();};
const renderAllBeforeDashboardAccess=renderAll;
renderAll=function(){const result=renderAllBeforeDashboardAccess();applyDashboardAccess();return result;};
const renderRemindersBeforeDashboardAccess=renderReminderControls;
renderReminderControls=function(){
 if(dashboardAccess.role!=='solo_consulta')return renderRemindersBeforeDashboardAccess();
 if($('reminderSyncBanner'))$('reminderSyncBanner').innerHTML='';
 applyDashboardAccess();
};
document.addEventListener('click',event=>{if(!dashboardWriteBlocked())return;const action=event.target.closest?.(dashboardWriteSelector);if(action){event.preventDefault();event.stopImmediatePropagation();dashboardDenyWrite();}},true);
document.addEventListener('submit',event=>{if(dashboardWriteBlocked()&&!['loginForm','opsPasswordForm'].includes(event.target.id)){event.preventDefault();event.stopImmediatePropagation();dashboardDenyWrite();}},true);
for(const name of ['preparePayment','preparePromise','openInlineCredit','applyCustomerCredit','openInvoiceEditor','persistInvoiceEdit','openReceiptEditor','openHistoricalEditor','openPlanEditor','commitReceiptCorrection','archiveRecord','restoreArchivedRecord','saveInvoiceWithBusinessLine','openCreditNote','openInvoiceCancellation','commitCreditNote','commitInvoiceCancellation','persistCustomerEdit','openCustomerEditor','saveHoldPreferences','saveHoldOverride','openHoldOverride','setReminderServiceEnabled','openCustomerReminders']){
 const original=globalThis[name];if(typeof original==='function')globalThis[name]=function(...args){if(dashboardWriteBlocked()){dashboardDenyWrite();return;}return original.apply(this,args);};
}
applyDashboardAccess();
// AMAO_DASHBOARD_ACCESS_END

