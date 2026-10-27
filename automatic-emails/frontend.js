let reminderCloud={ready:false,version:0,enabled:false,hour:9,zone:'America/Ciudad_Juarez',synced:false,busy:false,queued:false,error:'Servicio pendiente de conexión',providerReady:false};
let reminderServiceSaving=false,reminderServiceFeedback='';
function renderDashboardReminderControl(){
 const button=$('dashboardReminderToggle');if(!button)return;
 const known=reminderCloud.ready,enabled=known&&reminderCloud.enabled;
 $('dashboardReminderStatus').textContent=known?(enabled?'Activos':'Pausados'):'Sin conexión';
 $('dashboardReminderStatus').className='reminder-state '+(known?(enabled?'is-active':'is-paused'):'is-unknown');
 $('dashboardReminderSchedule').textContent=known?'Diario · '+String(reminderCloud.hour).padStart(2,'0')+':00, Ciudad Juárez':'Conecta la cartera para consultar el estado.';
 button.textContent=reminderServiceSaving?'Guardando…':enabled?'Pausar correos':'Activar correos';
 button.disabled=!known||reminderServiceSaving;
 button.setAttribute('aria-checked',known?String(enabled):'false');
 button.setAttribute('aria-label',enabled?'Pausar todos los correos automáticos':'Activar todos los correos automáticos');
 button.className=enabled?'pill reminder-toggle':'green-btn reminder-toggle';
 const feedback=$('dashboardReminderFeedback');
 feedback.textContent=reminderServiceFeedback||reminderCloud.error||(known&&!reminderCloud.synced?'Sincroniza la cartera en Configurar antes de activar.':enabled?'Los avisos se envían aunque cierres esta página.':'Pausa general: no se programan nuevos envíos.');
}
async function setReminderServiceEnabled(enabled){
 if(reminderServiceSaving)return;
 reminderServiceSaving=true;reminderServiceFeedback='';renderReminderControls();
 const account=activeUserId;
 try{
  if(!sb?.rpc)throw Error('Conecta la cartera antes de cambiar los envíos.');
  const current=await sb.rpc('ar_read_reminder_workspace');if(current.error)throw current.error;
  if(account!==activeUserId)throw Error('Cambió la sesión. Actualiza la cartera.');
  const config=current.data;
  reminderCloud.ready=true;reminderCloud.enabled=!!config.enabled;reminderCloud.hour=config.send_hour;reminderCloud.zone=config.timezone;
  if(enabled){
   if(!featuresReady||!reminderCloud.synced||reminderCloud.busy||reminderCloud.queued||config.version!==reminderCloud.version||config.version<1)throw Error('Primero actualiza y sincroniza la cartera desde Configurar.');
   const provider=await sb.rpc('ar_provider_status');if(provider.error)throw provider.error;
   reminderCloud.providerReady=!!provider.data.ready;
   if(!reminderCloud.providerReady)throw Error(provider.data.message||'Configura y verifica el remitente en Configurar antes de activar.');
  }
  if(account!==activeUserId)throw Error('Cambió la sesión. Actualiza la cartera.');
  const result=await sb.rpc('ar_configure_reminders',{next_enabled:enabled,next_hour:config.send_hour,next_timezone:config.timezone});
  if(result.error)throw result.error;
  if(result.data?.enabled!==enabled)throw Error('El servidor no confirmó el cambio. Verifica la conexión.');
  if(account!==activeUserId)return;
  reminderCloud.enabled=result.data.enabled;reminderCloud.error='';
  reminderServiceFeedback=enabled?'Envíos automáticos activados. Se aplicará el horario diario configurado.':'Envíos automáticos pausados para todos los clientes. Los correos ya enviados no se pueden retirar.';
 }catch(error){if(account===activeUserId){reminderCloud.error=error.message||'No se pudo guardar el cambio.';reminderServiceFeedback=reminderCloud.error;}}
 finally{reminderServiceSaving=false;renderReminderControls();}
}
$('dashboardReminderToggle').addEventListener('click',()=>setReminderServiceEnabled(!reminderCloud.enabled));
$('dashboardReminderConfigure').addEventListener('click',()=>{go('customers');$('reminderSettingsPanel').open=true;$('reminderSettingsPanel').scrollIntoView({behavior:'smooth',block:'start'});});
function currentBillingPayload(){return {receipts,creditSettings:customers.map(c=>({...termsFor(c.id)})),plans,promises,localPayments,archivedMovements,creditNotes,invoiceCancellations,holdPreferences,reminderSettings,reminderCustomers};}
function clientStatementAccount(id){return ArBillingCore.buildLedger(customers,invoices,payments,currentBillingPayload(),today()).find(a=>a.customer.id===id);}
function openClientStatement(id){
 const account=clientStatementAccount(id);if(!account)return;
 $('clientStatementContent').classList.remove('statement-compact');$('clientStatementContent').classList.add('statement-restored');$('clientStatementContent').innerHTML=ArBillingCore.statementHTML(account,{companyLogo:document.querySelector('.brand img')?.src||''});
 $('clientStatementModal').dataset.customerId=id;$('clientStatementModal').classList.add('open');$('closeClientStatement').focus();
}
function createStatementPages(width=1400,height=930){const source=$('clientStatementContent'),stage=document.createElement('div');stage.className='statement-export-stage';stage.style.width=width+'px';document.body.appendChild(stage);const pages=[];let page;const newPage=()=>{page=document.createElement('div');page.className='statement-paper statement-restored export-page';page.style.cssText=`width:${width}px;min-height:${height}px;padding:24px;box-sizing:border-box`;stage.appendChild(page);pages.push(page);if(pages.length>1){const b=source.querySelector('.statement-banner')?.cloneNode(true);if(b)page.appendChild(b);}};newPage();const overflow=()=>page.scrollHeight>height;for(const node of source.children){const tbl=node.querySelector('table');if(tbl){const wrapper=document.createElement('div');wrapper.className=node.className;for(const child of node.children){if(!child.querySelector?.('table')&&child.tagName!=='TABLE')wrapper.appendChild(child.cloneNode(true));}const wrap=document.createElement('div');wrap.className='statement-table-wrap';const t=tbl.cloneNode(false);t.appendChild(tbl.tHead.cloneNode(true));const body=document.createElement('tbody');t.appendChild(body);wrap.appendChild(t);wrapper.appendChild(wrap);page.appendChild(wrapper);let currentWrapper=wrapper,currentTable=t,currentBody=body;for(const row of tbl.tBodies[0].rows){const clone=row.cloneNode(true);currentBody.appendChild(clone);if(overflow()&&currentBody.rows.length>1){clone.remove();newPage();currentWrapper=wrapper.cloneNode(true);currentTable=currentWrapper.querySelector('table');currentBody=currentTable.tBodies[0];currentBody.innerHTML='';page.appendChild(currentWrapper);currentBody.appendChild(clone);}else if(overflow()&&currentBody.rows.length===1&&page.children.length>2){currentWrapper.remove();newPage();page.appendChild(currentWrapper);}}}else{const clone=node.cloneNode(true);page.appendChild(clone);if(overflow()&&page.children.length>1){clone.remove();newPage();page.appendChild(clone);}}}return {stage,pages};}
async function buildStatementFiles(){if(!window.html2canvas||!window.jspdf)throw new Error('No se cargaron las herramientas de PDF. Revisa la conexión.');openClientStatement($('clientStatementModal').dataset.customerId);if(!$('clientStatementContent').innerHTML)throw new Error('Abre primero el estado de cuenta.');const c=customers.find(c=>c.id===$('clientStatementModal').dataset.customerId),slug=(c?.legal_name||'cliente').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,60);const {stage,pages}=createStatementPages();const pdf=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});try{for(let k=0;k<pages.length;k++){const canvas=await html2canvas(pages[k],{scale:1.5,backgroundColor:'#ffffff',useCORS:true,logging:false,windowWidth:1450});if(k)pdf.addPage();const factor=Math.min(287/canvas.width,195/canvas.height),w=canvas.width*factor,h=canvas.height*factor;pdf.addImage(canvas.toDataURL('image/png'),'PNG',(297-w)/2,5,w,h,undefined,'FAST');pdf.setFontSize(8);pdf.text(`Página ${k+1} de ${pages.length}`,282,206,{align:'right'});downloadBlob(await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),`Estado_de_cuenta_${slug}_${String(k+1).padStart(2,'0')}.png`);}downloadBlob(pdf.output('blob'),`Estado_de_cuenta_${slug}.pdf`);return pages.length;}finally{stage.remove();}}
function billingNotificationPreview(id){
 const a=clientStatementAccount(id);return a?ArBillingCore.reminders(a,currentBillingPayload(),today()):null;
}
async function reminderCloudLoad(local){
 reminderServiceFeedback='';
 while(reminderCloud.ready&&(reminderCloud.busy||reminderCloud.queued))await flushReminderCloud();
 reminderCloud={...reminderCloud,ready:false,synced:false,error:'Servicio pendiente de conexión'};
 if(!sb?.rpc)return local;
 try{const {data,error}=await sb.rpc('ar_read_reminder_workspace');if(error)throw error;
  reminderCloud={...reminderCloud,ready:true,version:data.version,enabled:data.enabled,hour:data.send_hour,zone:data.timezone,synced:data.version>0,error:''};
  if(!data.payload||!Object.keys(data.payload).length)return local;
  const key=localFeatureKey()+'_cloud_pending',pending=JSON.parse(localStorage.getItem(key)||'null');
  if(pending){if(JSON.stringify(pending.payload)===JSON.stringify(data.payload)){localStorage.removeItem(key);localStorage.setItem(localFeatureKey(),JSON.stringify(data.payload));return data.payload;}if(pending.base_version===data.version){const result=await sb.rpc('ar_write_reminder_workspace',{expected_version:data.version,next_payload:pending.payload});if(result.error)throw result.error;reminderCloud.version=result.data.version;localStorage.removeItem(key);return pending.payload;}
   localStorage.setItem(localFeatureKey()+'_conflict_backup',JSON.stringify(local));reminderCloud.error='Hay cambios locales sin sincronizar y cambios de otro usuario. Se conservó una copia local; revisa antes de activar avisos.';reminderCloud.synced=false;return data.payload;
  }
  localStorage.setItem(localFeatureKey(),JSON.stringify(data.payload));return data.payload;
 }catch(e){reminderCloud.error=/PGRST202|42883/.test(e.code||'')?'Falta instalar el servicio en Supabase.':e.message||'No se pudo conectar la sincronización.';return local;}
}
function queueReminderCloudSave(){
 if(!reminderCloud.ready)return;
 reminderCloud.queued=true;reminderCloud.synced=false;
 localStorage.setItem(localFeatureKey()+'_cloud_pending',JSON.stringify({base_version:reminderCloud.version,payload:currentBillingPayload()}));
 renderReminderControls();setTimeout(flushReminderCloud,0);
}
async function flushReminderCloud(){
 if(!reminderCloud.ready||reminderCloud.busy||!reminderCloud.queued)return;
 reminderCloud.busy=true;reminderCloud.queued=false;const account=activeUserId,payload=currentBillingPayload(),base=reminderCloud.version;
 try{const {data,error}=await sb.rpc('ar_write_reminder_workspace',{expected_version:base,next_payload:payload});if(error)throw error;if(account!==activeUserId)return;
  reminderCloud.version=data.version;reminderCloud.synced=!reminderCloud.queued;reminderCloud.error='';
  if(reminderCloud.queued)localStorage.setItem(localFeatureKey()+'_cloud_pending',JSON.stringify({base_version:data.version,payload:currentBillingPayload()}));else localStorage.removeItem(localFeatureKey()+'_cloud_pending');
 }catch(e){reminderCloud.synced=false;reminderCloud.error='Pendiente de sincronizar: '+(e.message||e);reminderCloud.queued=false;}
 finally{if(account===activeUserId){reminderCloud.busy=false;renderReminderControls();if(reminderCloud.queued)setTimeout(flushReminderCloud,0);}}
}
let reminderFlushPromise=null;
const flushReminderCloudWork=flushReminderCloud;
flushReminderCloud=function(){if(reminderCloud.busy)return reminderFlushPromise||Promise.resolve();reminderFlushPromise=flushReminderCloudWork();return reminderFlushPromise;};
function renderReminderControls(){
 renderDashboardReminderControl();
 if(!$('reminderServiceStatus'))return;
 $('reminderServiceStatus').textContent=reminderCloud.error||(!reminderCloud.ready?'Servicio sin conectar':!reminderCloud.synced?'Cambios pendientes de sincronizar':reminderCloud.enabled?'Avisos diarios activos · '+reminderCloud.hour+':00 · '+reminderCloud.zone:'Datos sincronizados · envíos desactivados');
 $('reminderServiceStatus').className='notice '+(reminderCloud.error?'warning':reminderCloud.enabled&&reminderCloud.synced?'success':'');
 $('reminderSyncBanner').innerHTML=reminderCloud.ready&&(!reminderCloud.synced||reminderCloud.error)?'<div class="notice warning">Avisos por correo: '+esc(reminderCloud.error||'Hay cambios locales pendientes de sincronizar. Los avisos utilizan únicamente la cartera confirmada en Supabase.')+'</div>':'';
 $('reminderDueDays').value=reminderSettings.due_days??7;$('reminderHoldLead').value=reminderSettings.hold_lead_days??7;$('reminderSendHour').value=reminderCloud.hour;
 $('activateReminderService').disabled=reminderServiceSaving||!reminderCloud.ready||!reminderCloud.synced||reminderCloud.enabled;
 $('pauseReminderService').disabled=reminderServiceSaving||!reminderCloud.ready||!reminderCloud.enabled;
 const payload=currentBillingPayload(),accounts=new Map(ArBillingCore.buildLedger(customers,invoices,payments,payload,today()).map(a=>[a.customer.id,a]));
 const rows=customers.map(c=>{const s=reminderCustomers[c.id]||{},p=ArBillingCore.reminders(accounts.get(c.id),payload,today()),to=ArBillingCore.recipients(c,s);return '<tr><td><b>'+esc(c.legal_name)+'</b></td><td>'+to.length+' contacto(s)<div class="meta">'+esc(to.join(', '))+'</div></td><td>'+esc(s.paused?'Pausado':p?(p.kind==='due_and_hold'?'Vencimiento y Credit Hold':p.kind==='credit_hold'?'Credit Hold':'Vencimiento'):'Sin aviso al corte')+'</td><td><button type="button" class="pill" data-customer-reminders="'+esc(c.id)+'">Configurar</button></td></tr>';});
 $('reminderCustomerTable').innerHTML=table(rows,['Cliente','Destinatarios','Aviso previsto','Opciones']);
}
function openCustomerReminders(id){
 const c=customers.find(c=>c.id===id);if(!c)return;const s=reminderCustomers[id]||{};
 modal('Avisos automáticos · '+c.legal_name,'<form id="customerRemindersForm" data-customer="'+esc(id)+'"><p class="meta">Un correo combinado por día, con facturas pendientes y los motivos vigentes. Las excepciones de la tabla de Credit Hold afectan sólo a la publicación. Para detener correos usa las opciones de este cliente. Se detiene al pagar, cancelar, salir del criterio o pausar el cliente.</p>'+[['paused','Pausar todos los avisos de este cliente',!!s.paused],['due_enabled','Avisar facturas por vencer y vencidas (clientes con días de crédito)',s.due_enabled!==false],['hold_enabled','Avisar al aproximarse a Credit Hold o exceder el límite',s.hold_enabled!==false],['include_main','Incluir el correo principal del cliente',s.include_main!==false]].map(([name,label,checked])=>'<label class="check-line"><input type="checkbox" name="'+name+'" '+(checked?'checked':'')+'> '+label+'</label>').join('')+'<p class="meta">Contactos seleccionados: '+esc(ArBillingCore.recipients(c,s).join(', ')||'Sin correos registrados')+'. En Editar cliente puedes marcar qué contactos reciben avisos.</p><div class="form-actions"><button class="green-btn" type="submit">Guardar preferencias</button></div></form>');
}
const renderAllBeforeReminderControls=renderAll;
renderAll=function(){renderAllBeforeReminderControls();renderReminderControls();};
document.addEventListener('click',e=>{const b=e.target.closest('button');if(b?.dataset.customerReminders)openCustomerReminders(b.dataset.customerReminders);});
document.addEventListener('submit',e=>{
 const f=e.target.closest('#customerRemindersForm');if(!f)return;e.preventDefault();const id=f.dataset.customer;reminderCustomers[id]=Object.fromEntries(['paused','due_enabled','hold_enabled','include_main'].map(k=>[k,f.elements[k].checked]));saveLocalFeatureData();renderReminderControls();$('detailModal').classList.remove('open');
});
$('customerEditForm').addEventListener('change',e=>{if(customerEditDraft&&e.target.dataset.contactReminder!==undefined)customerEditDraft.contacts[Number(e.target.dataset.contactReminder)].receive_reminders=e.target.checked;});
$('checkReminderConnection').addEventListener('click',async e=>{
 const b=e.currentTarget;setBusy(b,true,'Revisando…');try{const {data,error}=await sb.rpc('ar_read_reminder_workspace');if(error)throw error;if((!reminderCloud.ready&&data.version>0)||(reminderCloud.ready&&data.version!==reminderCloud.version))throw Error('La cartera del servidor cambió. Usa Actualizar cartera antes de continuar.');reminderCloud={...reminderCloud,ready:true,version:data.version,enabled:data.enabled,hour:data.send_hour,zone:data.timezone};
  const status=await sb.rpc('ar_provider_status');if(status.error)throw status.error;reminderCloud.providerReady=!!status.data.ready;reminderCloud.error=status.data.ready?'':status.data.message||'Falta configurar el remitente y el servicio de correo.';
 }catch(error){reminderCloud.error=error.message||'No se pudo verificar la conexión.';}finally{renderReminderControls();setBusy(b,false);}
});
$('syncReminderData').addEventListener('click',async e=>{const b=e.currentTarget;setBusy(b,true);try{if(!featuresReady)throw Error('Espera a que termine de cargar la cartera.');if(!reminderCloud.ready){const r=await sb.rpc('ar_read_reminder_workspace');if(r.error)throw r.error;if(r.data.version>0)throw Error('Ya existe información sincronizada. Actualiza la cartera antes de guardar cambios.');reminderCloud.ready=true;reminderCloud.version=r.data.version;}queueReminderCloudSave();await flushReminderCloud();}catch(error){reminderCloud.error=error.message;}finally{renderReminderControls();setBusy(b,false);}});
$('reminderSettingsForm').addEventListener('submit',async e=>{
 e.preventDefault();if(reminderServiceSaving)return;const due=Number($('reminderDueDays').value),lead=Number($('reminderHoldLead').value),hour=Number($('reminderSendHour').value);
 if(!Number.isInteger(due)||due<0||due>60||!Number.isInteger(lead)||lead<0||lead>60||!Number.isInteger(hour)||hour<0||hour>23){showMsg('Revisa los días de aviso y la hora.','error');return;}
 reminderSettings={due_days:due,hold_lead_days:lead};saveLocalFeatureData();
 if(reminderCloud.ready){reminderServiceSaving=true;reminderServiceFeedback='';renderReminderControls();try{const current=await sb.rpc('ar_read_reminder_workspace');if(current.error)throw current.error;reminderCloud.enabled=!!current.data.enabled;const r=await sb.rpc('ar_configure_reminders',{next_enabled:current.data.enabled,next_hour:hour,next_timezone:current.data.timezone});if(r.error)throw r.error;reminderCloud.enabled=r.data.enabled;reminderCloud.hour=hour;reminderCloud.error='';}catch(error){reminderCloud.error=error.message||'No se guardó el horario.';}finally{reminderServiceSaving=false;}}renderReminderControls();
});
for(const [id,enabled]of [['activateReminderService',true],['pauseReminderService',false]])$(id).addEventListener('click',async()=>{
 await setReminderServiceEnabled(enabled);
});
$('reminderProviderForm').addEventListener('submit',async e=>{
 e.preventDefault();const f=e.currentTarget.elements,b=e.submitter;setBusy(b,true);
 try{const r=await sb.rpc('ar_set_email_provider',{sender:f.sender.value.trim(),email_api_key:f.apiKey.value.trim(),reply_address:f.replyTo.value.trim(),verified_domain:f.verified.checked});f.apiKey.value='';if(r.error)throw r.error;const status=await sb.rpc('ar_provider_status');if(status.error)throw status.error;reminderCloud.providerReady=!!status.data.ready;reminderCloud.error=status.data.ready?'':status.data.message;}
 catch(error){f.apiKey.value='';reminderCloud.error=error.message||'No se guardó el remitente.';}finally{setBusy(b,false);renderReminderControls();}
});
