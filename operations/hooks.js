async function opsEnsureSynced(){
 if(!reminderCloud.ready)throw Error('Actualiza la cartera antes de guardar.');
 for(let n=0;n<12&&(reminderCloud.busy||reminderCloud.queued);n++)await flushReminderCloud();
 if(!reminderCloud.synced||reminderCloud.error)throw Error('Hay cambios sin confirmar. Usa Revisar / reintentar antes de continuar.');
}
function opsAcceptAtomic(version){reminderCloud.version=version;reminderCloud.synced=true;reminderCloud.error='';localStorage.setItem(localFeatureKey(),JSON.stringify(currentBillingPayload()));localStorage.removeItem(localFeatureKey()+'_cloud_pending');opsBasePayload=opsClone(currentBillingPayload());resetQuickSearchCache();renderOpsHealth();}
applyCustomerCredit=async function(id,settings,apply=true){
 if(dashboardWriteBlocked()||!['admin','facturacion'].includes(dashboardAccess.role))throw Error('Sin permiso para cambiar crédito.');await opsEnsureSynced();const total=apply?creditOpenInvoices(id).length:0,{data,error}=await sb.rpc('ar_apply_customer_credit',{target_customer:id,settings,apply_open:apply,expected_version:reminderCloud.version});if(error)throw error;
 const changed=new Map(data.invoices.map(i=>[i.id,i.due_date]));invoices=invoices.map(i=>changed.has(i.id)?{...i,due_date:changed.get(i.id)}:i);creditSettings=creditSettings.filter(t=>t.customer_id!==id).concat(data.terms);opsAcceptAtomic(data.version);return {updated:data.invoices.length,total};
};
commitInvoiceCancellation=async function(id,replacement,dateValue,reason){
 if(dashboardWriteBlocked()||!['admin','facturacion'].includes(dashboardAccess.role))throw Error('Sin permiso para cancelar facturas.');validateInvoiceCancellation(id,replacement);await opsEnsureSynced();const {data,error}=await sb.rpc('ar_cancel_invoice',{target_invoice:id,replacement_invoice:replacement||null,cancel_date:dateValue,cancel_reason:reason,expected_version:reminderCloud.version});if(error)throw error;
 invoices=invoices.map(i=>i.id===id?{...i,status:'cancelada'}:i);invoiceCancellations={...invoiceCancellations,[id]:data.detail};opsAcceptAtomic(data.version);
};
const opsOldCloudLoad=reminderCloudLoad;
reminderCloudLoad=async function(local){const payload=await opsOldCloudLoad(local);opsBasePayload=opsClone(payload);return payload;};
const opsOldQueueCloud=queueReminderCloudSave;
queueReminderCloudSave=function(){opsOldQueueCloud();try{const key=localFeatureKey()+'_cloud_pending',pending=JSON.parse(localStorage.getItem(key)||'null');if(pending){pending.base_payload=opsBasePayload;localStorage.setItem(key,JSON.stringify(pending));}}catch{}renderOpsHealth();};
const opsOriginalMsg=showMsg;
showMsg=function(msg,type='success',target='globalMsg'){
 if(target==='globalMsg'&&type==='success'&&msg&&/guardad|registrad|aplicad|cancelad|eliminad|corrección|reprogramad/i.test(msg)&&(reminderCloud.busy||reminderCloud.queued||!reminderCloud.synced)&&featuresReady&&opsCanWrite()){
  opsPendingMessage=msg;return opsOriginalMsg('Cambio preparado. Esperando confirmación de Supabase…','warning',target);
 }
 return opsOriginalMsg(msg,type,target);
};
const opsOldFlush=flushReminderCloud;
flushReminderCloud=async function(){
 const sent=opsClone(currentBillingPayload()),beforeVersion=reminderCloud.version;await opsOldFlush();if(reminderCloud.version>beforeVersion){opsBasePayload=sent;try{const key=localFeatureKey()+'_cloud_pending',pending=JSON.parse(localStorage.getItem(key)||'null');if(pending){pending.base_payload=sent;localStorage.setItem(key,JSON.stringify(pending));}}catch{}}if(reminderCloud.synced&&!reminderCloud.error){opsBasePayload=opsClone(sent);if(opsPendingMessage){opsOriginalMsg(opsPendingMessage+' Confirmado en Supabase.','success');opsPendingMessage='';}}
 else if(reminderCloud.error&&opsPendingMessage)opsOriginalMsg('No se confirmó el cambio. Se conserva una copia local. Usa Revisar / reintentar.','warning');renderOpsHealth();
};
async function opsReviewSync(){
 if(!['admin','facturacion','cobranza'].includes(dashboardAccess.role))return;const {data,error}=await sb.rpc('ar_read_reminder_workspace');if(error)throw error;const pending=JSON.parse(localStorage.getItem(localFeatureKey()+'_cloud_pending')||'null');
 if(!pending){await loadData();return;}
 if(data.version===pending.base_version){reminderCloud.error='';reminderCloud.queued=true;await flushReminderCloud();return;}
 const base=pending.base_payload||{},local=pending.payload,remote=data.payload,merge=ArOpsCore.mergeWorkspaces(base,local,remote);opsConflict={base,local,remote,version:data.version,merge};
 modal('Revisar cambios de dos sesiones','<p>Otra sesión guardó cambios. Los cambios independientes se combinarán. Para cada diferencia elige qué valor conservar; por defecto se conserva el del servidor.</p><form id="opsConflictForm"><div class="ops-table">'+table(merge.conflicts.map((c,n)=>'<tr><td>'+esc(c.path.join(' / '))+'</td><td>'+esc(JSON.stringify(c.local)??'Eliminar')+'</td><td>'+esc(JSON.stringify(c.remote)??'Eliminar')+'</td><td><select name="choice'+n+'" class="field"><option value="remote">Servidor</option><option value="local">Mi cambio</option></select></td></tr>'),['Campo','Mi cambio','Servidor','Conservar'])+'</div><p class="meta">'+merge.conflicts.length+' diferencias requieren elección. La copia local se conserva hasta confirmar el guardado.</p><div class="form-actions">'+opsAction('Descargar copia local','sync-backup')+'<button class="green-btn" type="submit">Guardar combinación revisada</button></div></form>');
}
async function saveOpsConflict(e){
 e.preventDefault();if(!opsConflict||!opsCanWrite())return;const c=opsConflict,choices=Object.fromEntries(c.merge.conflicts.map((x,n)=>[x.id,e.target.elements['choice'+n].value])),merged=ArOpsCore.mergeWorkspaces(c.base,c.local,c.remote,choices).payload,{data,error}=await sb.rpc('ar_write_reminder_workspace',{expected_version:c.version,next_payload:merged});if(error)throw error;
 localStorage.setItem(localFeatureKey(),JSON.stringify(merged));localStorage.removeItem(localFeatureKey()+'_cloud_pending');reminderCloud.version=data.version;reminderCloud.queued=false;reminderCloud.busy=false;reminderCloud.error='';reminderCloud.synced=true;opsConflict=null;opsPendingMessage='';$('detailModal').classList.remove('open');await loadData();opsOriginalMsg('Cambios combinados y confirmados en Supabase.');
}
const opsOriginalLoadCollections=loadCollectionData;
loadCollectionData=async function(){await opsOriginalLoadCollections();await loadOperations();};
const opsOriginalEnriched=enriched;
enriched=function(){if(opsCache?.rows)return opsCache.rows;const rows=opsOriginalEnriched();if(opsCache)opsCache.rows=rows;return rows;};
const opsOriginalSummary=accountSummary;
accountSummary=function(id,currency){const key=id+'|'+currency;if(opsCache?.accounts.has(key))return opsCache.accounts.get(key);const a=opsOriginalSummary(id,currency);opsCache?.accounts.set(key,a);return a;};
const opsOriginalRender=renderAll;
renderAll=function(){opsCache={rows:null,accounts:new Map()};try{const result=opsOriginalRender();renderOperations();return result;}finally{opsCache=null;}};
const opsOriginalGo=go;
go=function(tab){opsOriginalGo(tab);if(tab==='operations'){$('crumb').textContent='Herramientas de cobranza';renderOperations();}};
const opsOriginalBehavior=customerBehaviorSummary;
customerBehaviorSummary=function(id){const html=opsOriginalBehavior(id),r=operationsState.payload?.creditReviews?.[id];return html+(r?'<span class="ops-client-review">Revisar crédito: '+esc(date(r.date))+' · '+esc(r.priority)+'</span>':'')+(opsAdmin()?'<button type="button" class="tracking-link" data-ops-action="credit-review" data-value="'+esc(id)+'">'+(r?'Editar revisión':'Programar revisión')+'</button>':'');};
const opsOriginalInvoiceRow=invoiceRow;
invoiceRow=function(i){return opsOriginalInvoiceRow(i).replace('<button type="button" data-client-statement=', '<button type="button" data-ops-action="invoice-documents" data-value="'+esc(i.id)+'">Comprobantes</button><button type="button" data-client-statement=');};
renderFilteredInvoiceTable=function(rows){
 const filtered=filteredInvoiceRows(rows),size=50,pages=Math.max(1,Math.ceil(filtered.length/size));opsInvoicePage=Math.min(opsInvoicePage,pages-1);$('invoiceTable').innerHTML=table(filtered.slice(opsInvoicePage*size,(opsInvoicePage+1)*size).map(invoiceRow),invoiceHeaders)+'<div class="invoice-pager">'+opsAction('Anterior','invoice-prev','',opsInvoicePage===0)+'<span>Página '+(opsInvoicePage+1)+' de '+pages+' · '+filtered.length+' facturas</span>'+opsAction('Siguiente','invoice-next','',opsInvoicePage>=pages-1)+'</div>';$('invoiceFilterSummary').textContent=filtered.length+' facturas · '+selectedCurrency()+' · hasta 50 por página';updateInvoiceFilterControls();
};
window.addEventListener?.('beforeunload',e=>{if(localStorage.getItem(localFeatureKey()+'_cloud_pending')){e.preventDefault();e.returnValue='';}});
const opsResetBeforeOperations=resetCollectionTools;
resetCollectionTools=function(){opsResetBeforeOperations();operationsState={user:null,ready:false,version:0,payload:{company:{},creditReviews:{},virtuals:[],attachments:[]},error:''};opsBasePayload=null;opsConflict=null;opsAuditRows=[];opsReportModel=null;opsPendingMessage='';opsDocumentCustomer='';opsDocumentRecord='';opsVirtualCustomer='';for(const id of ['opsPanel','opsExecutive','opsHealth'])if($(id))$(id).innerHTML='';};

executiveRisk=function(){const byId=new Map(customerRollup().map(c=>[c.id,c]));return buildHoldReview().filter(r=>r.included&&r.accounts.some(a=>a.currency===selectedCurrency()&&a.debt>0)).map(r=>({...byId.get(r.customer.id),reasons:holdReviewReasons(r)}));};
const opsDrawBeforeReuse=draw;
draw=function(id,type,data,extra={}){const chart=charts[id];if(chart&&chart.config?.type===type&&typeof chart.update==='function'){chart.data=data;chart.options={...chart.options,...extra};chart.update('none');return;}return opsDrawBeforeReuse(id,type,data,extra);};

function opsConfigureMail(){const c=operationsState.payload?.company||{};ArBillingCore.mailDefaults.sender=c.email||'';ArBillingCore.mailDefaults.cc=c.copy_email||'';const form=$('reminderProviderForm');if(form?.elements){form.elements.sender.value=c.email||'';form.elements.replyTo.value=c.email||'';if(form.elements.copyEmail)form.elements.copyEmail.value=c.copy_email||'';}}
