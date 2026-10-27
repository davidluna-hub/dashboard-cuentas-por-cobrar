let operationsState={user:null,ready:false,version:0,payload:{company:{},creditReviews:{},virtuals:[],attachments:[]},error:''};
let operationsTab='day',opsAuditRows=[],opsAuditPage=0,opsAuditOffset=0,opsReportPage=0,opsReportModel=null,opsPendingMessage='',opsBasePayload=null,opsConflict=null,opsCache=null,opsInvoicePage=0;
let opsAuditLoading=false,opsAuditError='',opsAuditRequest=0;
function opsNotify(message='',type='success',source=null){
 let host=$('opsFeedback');const modal=source?.closest?.('#detailModal');
 if(modal){host=$('opsModalFeedback');if(!host){host=document.createElement('div');host.id='opsModalFeedback';host.setAttribute('role','status');$('detailContent').prepend(host);}}
 if(host){host.hidden=!message;host.textContent=message;host.className='ops-feedback '+type;}
}
async function opsRead(request,timeout=20000){let timer;try{return await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('La consulta está tardando demasiado. Revisa tu conexión y vuelve a intentarlo.')),timeout);})]);}finally{clearTimeout(timer);}}
const opsCanWrite=()=>['admin','facturacion','cobranza'].includes(dashboardAccess.role)&&!dashboardWriteBlocked();
const opsAdmin=()=>dashboardAccess.role==='admin'&&!dashboardWriteBlocked();
const opsClone=v=>JSON.parse(JSON.stringify(v));
function opsData(){return {...currentBillingPayload(),customers,invoices,payments};}
function opsAction(text,action,value='',disabled=false){return '<button type="button" class="pill" data-ops-action="'+action+'" data-value="'+esc(value)+'"'+(disabled?' disabled':'')+'>'+esc(text)+'</button>';}
function opsMetric(label,value,detail=''){return '<div class="ops-tile">'+esc(label)+'<strong>'+esc(value)+'</strong><span>'+esc(detail)+'</span></div>';}
async function loadOperations(){
 const user=activeUserId;if(operationsState.user!==user){operationsState={user,ready:false,version:0,payload:{company:{},creditReviews:{},virtuals:[],attachments:[]},error:''};opsAuditRows=[];opsBasePayload=null;opsConflict=null;}
 try{const {data,error}=await opsRead(sb.from('ar_operations').select('*').eq('id','main').single());if(error)throw error;if(!data?.payload)throw Error('No se encontró la configuración compartida.');if(user!==activeUserId)return;operationsState={...data,user,ready:true,error:''};opsConfigureMail();}
 catch(e){if(user===activeUserId){operationsState.ready=false;operationsState.error=e.message||'No se pudieron cargar las herramientas';}}
}
async function saveOperations(payload){
 if(!opsCanWrite()||!operationsState.ready)throw Error('No tienes permiso o falta actualizar las herramientas.');
 const user=activeUserId,{data,error}=await sb.rpc('ar_write_operations',{expected_version:operationsState.version,next_payload:payload});if(error)throw error;if(user!==activeUserId)throw Error('Cambió la sesión.');operationsState={...data,user,ready:true,error:''};return data;
}
function opsLastCut(){return [...(collectionState.snapshots||[])].sort((a,b)=>b.captured_at.localeCompare(a.captured_at))[0];}
function renderOpsHealth(){
 const host=$('opsHealth');if(!host)return;const pending=reminderCloud.busy||reminderCloud.queued||!reminderCloud.synced,last=opsLastCut(),day=today(),expected=ArBillingCore.shift(day,-1),daily=collectionState.snapshots.some(s=>s.kind==='daily'&&s.snapshot_date===expected);
 host.dataset.state=reminderCloud.error?'error':'ready';host.innerHTML='<b>'+esc(!featuresReady?'Cargando cartera':dashboardAccess.role==='solo_consulta'?'Cartera compartida':reminderCloud.error?'Revisar guardado':pending?'Guardando cambios…':'Cambios confirmados')+'</b><span>'+esc(last?'Último corte: '+date(last.snapshot_date)+' · '+(last.kind==='daily'?'cierre diario':'manual'):'Sin cortes guardados')+'</span>'+(!daily?'<span class="ops-alert">Falta el cierre diario de ayer</span>':'')+(reminderCloud.error&&opsCanWrite()?opsAction('Revisar / reintentar','sync'): '')+opsAction('Mi día','tab','day')+opsAction('Calidad de datos','tab','quality');
}
function renderOpsExecutive(){
 const host=$('opsExecutive');if(host){host.innerHTML='';host.hidden=true;}if(!featuresReady)return;
 const cur=selectedCurrency(),day=today(),details=promiseDetails().filter(p=>p.currency===cur&&!['fulfilled','cancelled'].includes(p.state)),near=enriched().filter(i=>i.currency===cur&&i.balance>0&&i.due_date>=day&&i.due_date<=ArBillingCore.shift(day,7)),hold=buildHoldReview().filter(c=>c.included&&c.accounts.some(a=>a.currency===cur&&a.debt>0));
 const rows=[['Promesas de hoy',details.filter(p=>p.scheduled_date===day),'day'],['Promesas atrasadas',details.filter(p=>p.scheduled_date<day),'day']];
 $('executiveAlerts').innerHTML=rows.map(([title,p,tab])=>'<button type="button" class="exec-alert agenda" data-ops-action="tab" data-value="'+tab+'"><strong>'+p.length+' '+title.toLowerCase()+'</strong><small>'+money(amount(p.reduce((n,x)=>n+cents(x.remaining),0)),cur)+'</small></button>').join('')+'<button type="button" class="exec-alert due" data-exec-action="due"><strong>'+near.length+' facturas por vencer</strong><small>'+money(sum(near,'balance'),cur)+' · próximos 7 días</small></button><button type="button" class="exec-alert risk" data-exec-action="risk"><strong>'+hold.length+' clientes en Credit Hold</strong><small>Según criterios y excepciones de publicación</small></button>';
}

function renderOperations(){
 if(activeTab!=='operations'||!$('opsPanel'))return;
 return opsWithCalculationCache(()=>{
 for(const b of document.querySelectorAll('[data-ops-tab]')){const selected=b.dataset.opsTab===operationsTab;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(selected));b.setAttribute('aria-controls','opsPanel');b.setAttribute('tabindex',selected?'0':'-1');}
 $('opsStatus').textContent=operationsState.error||(!operationsState.ready?'Cargando herramientas…':'Datos compartidos · '+date(today())+' · '+selectedCurrency());
 const render={day:renderOpsDay,reports:renderOpsReports,quality:renderOpsQuality,audit:renderOpsAudit,documents:renderOpsDocuments,virtuals:renderOpsVirtuals,settings:renderOpsSettings}[operationsTab];if(!render)throw Error('La herramienta seleccionada no está disponible.');render();
 });
}
function openOperations(tab='day'){
 if(!['day','reports','quality','audit','documents','virtuals','settings'].includes(tab))throw Error('Selecciona una herramienta válida.');
 operationsTab=tab;opsNotify();go('operations');if(tab==='audit')return loadOpsAudit();
}
function renderOpsDay(){
 if(activeTab!=='operations'||operationsTab!=='day')return;
 const day=today(),rows=[...(collectionModels.agenda||[])],cur=selectedCurrency(),reviews=operationsState.payload.creditReviews||{};
 for(const c of customers){if(rows.some(r=>r.customer.id===c.id))continue;const review=reviews[c.id],a=accountSummary(c.id,cur),reasons=[];if(review?.date&&review.date<=day)reasons.push('Revisión de crédito: '+date(review.date));if(a.exceeded)reasons.push('Crédito autorizado excedido');if(!reasons.length)continue;rows.push({customer:c,reasons,overdue:a.overdue,lastActivity:collectionModels.behavior.get(c.id)?.lastActivity});}
 $('opsPanel').innerHTML='<h2>Mi día de cobranza</h2><p class="sub">Primero las promesas atrasadas, después los seguimientos y compromisos de hoy. Los importes están en '+esc(cur)+'.</p><div class="ops-grid">'+opsMetric('Clientes por atender',String(rows.length))+opsMetric('Seguimientos para hoy',String(collectionState.activities.filter(a=>a.followup_status==='open'&&a.next_contact_on<=day).length))+opsMetric('Revisión de crédito pendiente',String(Object.values(reviews).filter(r=>r.date&&r.date<=day).length))+opsMetric('Fecha de trabajo',ArBillingCore.statementDate(day),'Ciudad Juárez')+'</div><div class="ops-table">'+table(rows.slice(0,60).map(r=>'<tr><td><b>'+esc(r.customer.legal_name)+'</b></td><td>'+r.reasons.map(esc).join('<br>')+'</td><td>'+money(r.overdue,cur)+'</td><td>'+esc(r.lastActivity?date(r.lastActivity.happened_on):'Sin gestión')+'</td><td><div class="ops-actions">'+opsAction('Ver seguimiento','client',r.customer.id)+opsAction('Registrar gestión','activity',r.customer.id,!collectionCanWrite())+opsAction('Estado de cuenta','statement',r.customer.id)+'</div></td></tr>'),['Cliente','Qué requiere atención','Vencido','Último contacto','Acción'])+'</div><p class="meta">Las próximas facturas y los límites excedidos se consultan también en el resumen y en Clientes en Credit Hold.</p>';
}
function opsReviewInvoice(id){
 const invoice=invoices.find(i=>i.id===id);if(!invoice)throw Error('No se encontró la factura. Actualiza la cartera y vuelve a revisarla.');
 if(invoice.status!=='cancelada'){
  if(invoiceEditSaving)throw Error('Espera a que termine de guardarse la factura que estás editando.');
  return openInvoiceEditor(id);
 }
 const cancellation=invoiceCancellations[id]||{},replacement=invoices.find(i=>i.id===cancellation.replacement_id);
 const rows=[['Cliente',customerName(invoice.customer_id)],['Número de factura',invoice.invoice_number],['Estado','Cancelada'],['Fecha de emisión',date(invoice.invoice_date)],['Vencimiento registrado',date(invoice.due_date)],['Total original',money(invoice.total,invoice.currency)+' '+invoice.currency],['Fecha de cancelación',cancellation.date?date(cancellation.date):'No registrada'],['Motivo de cancelación',cancellation.reason||'No registrado'],['Factura sustituta',replacement?.invoice_number||(cancellation.replacement_id?'No disponible en la cartera actual':'Sin sustituta registrada')]];
 modal('Revisión de factura cancelada · '+invoice.invoice_number,'<p class="notice">Esta factura está cancelada. Puedes consultar sus datos y la observación histórica; la revisión conserva su cancelación y no modifica los saldos.</p><div class="ops-table">'+table(rows.map(([label,value])=>'<tr><td><b>'+esc(label)+'</b></td><td>'+esc(value)+'</td></tr>'),['Dato','Información registrada'])+'</div>'+(invoice.notes?'<p class="ops-detail">'+esc(invoice.notes)+'</p>':''));
}
function renderOpsQuality(){
 if(activeTab!=='operations'||operationsTab!=='quality')return;
 const issues=ArOpsCore.quality(opsData());$('opsPanel').innerHTML='<h2>Calidad de datos</h2><p class="sub">'+issues.length+' observaciones. Revísalas antes de corregir; los saldos y fechas no se cambian automáticamente.</p><div class="ops-toolbar">'+opsAction('Descargar revisión en Excel','quality-export')+'</div><div class="ops-table">'+table(issues.map(r=>'<tr><td>'+esc(r.kind)+'</td><td>'+esc(customerName(r.customer_id))+'</td><td>'+esc(r.message)+'</td><td>'+opsAction('Revisar',r.action==='invoice'?'invoice':r.action==='customer'?'customer':'payments',r.record_id,!opsCanWrite())+'</td></tr>'),['Tipo','Cliente','Observación','Acción'])+'</div>';
}
async function loadOpsAudit(){
 if(!opsCanWrite()){opsAuditRows=[];renderOpsAudit();return;}
 const user=activeUserId,page=opsAuditPage,request=++opsAuditRequest;
 opsAuditLoading=true;opsAuditError='';if(activeTab==='operations'&&operationsTab==='audit')renderOpsAudit();
 try{
  const {data,error}=await opsRead(sb.from('ar_audit_log').select('id,happened_at,actor_id,actor_role,entity,record_id,action').order('id',{ascending:false}).range(page*25,page*25+24));
  if(user!==activeUserId||request!==opsAuditRequest||page!==opsAuditPage)return;
  if(error)throw error;opsAuditRows=data||[];
 }catch(error){if(user===activeUserId&&request===opsAuditRequest)opsAuditError=error.message||'No se pudo consultar el historial.';}
 finally{if(user===activeUserId&&request===opsAuditRequest){opsAuditLoading=false;if(activeTab==='operations'&&operationsTab==='audit')renderOpsAudit();}}
}
async function openOpsAuditDetail(id){
 const user=activeUserId,{data:a,error}=await opsRead(sb.from('ar_audit_log').select('id,before_data,after_data').eq('id',id).single());
 if(user!==activeUserId)throw Error('Cambió la sesión. Vuelve a abrir el historial.');if(error)throw error;if(!a)throw Error('No se encontró este cambio. Actualiza el historial.');
 const keys=new Set([...Object.keys(a.before_data||{}),...Object.keys(a.after_data||{})]),rows=[...keys].filter(k=>JSON.stringify(a.before_data?.[k])!==JSON.stringify(a.after_data?.[k]));
 modal('Cambios del registro','<div class="ops-table">'+table(rows.map(k=>'<tr><td>'+esc(k)+'</td><td>'+esc(typeof a.before_data?.[k]==='object'?JSON.stringify(a.before_data[k]):a.before_data?.[k]??'-')+'</td><td>'+esc(typeof a.after_data?.[k]==='object'?JSON.stringify(a.after_data[k]):a.after_data?.[k]??'-')+'</td></tr>'),['Campo','Antes','Después'])+'</div>');
}
function renderOpsAudit(){
 if(activeTab!=='operations'||operationsTab!=='audit')return;
 if(opsAuditLoading){$('opsPanel').innerHTML='<h2>Historial de cambios</h2><p class="ops-loading" role="status">Consultando historial… Puedes cambiar de herramienta mientras se carga.</p>';$('opsPanel').setAttribute('aria-busy','true');return;}
 $('opsPanel').setAttribute('aria-busy','false');
 if(opsAuditError){$('opsPanel').innerHTML='<h2>Historial de cambios</h2><p class="ops-feedback error" role="alert">'+esc(opsAuditError)+'</p>'+opsAction('Reintentar consulta','audit-load');return;}
 if(!opsCanWrite()){$('opsPanel').innerHTML='<h2>Historial de cambios</h2><p>El historial de cambios está disponible para los usuarios con permiso de operación.</p>';return;}
 $('opsPanel').innerHTML='<h2>Historial de cambios</h2><p class="sub">Quién cambió cada registro y sus valores anteriores. El historial comienza con esta actualización.</p><div class="ops-toolbar">'+opsAction('Actualizar historial','audit-load')+'</div><div class="ops-table">'+table(opsAuditRows.map(a=>'<tr><td>'+esc(new Date(a.happened_at).toLocaleString('es-MX',{timeZone:'America/Ciudad_Juarez'}))+'</td><td>'+esc(a.actor_id===activeUserId?'Tú':a.actor_role||'Proceso automático')+'<small class="ops-muted">'+esc(a.actor_role||'Servidor')+'</small></td><td>'+esc(a.entity)+'</td><td>'+esc(({INSERT:'Creado',UPDATE:'Modificado',DELETE:'Eliminado'})[a.action]||a.action)+'</td><td>'+opsAction('Ver cambios','audit-detail',String(a.id))+'</td></tr>'),['Fecha','Responsable','Registro','Acción','Detalle'])+'</div><div class="ops-pager">'+opsAction('Anterior','audit-prev','',opsAuditPage===0)+'<span>Página '+(opsAuditPage+1)+'</span>'+opsAction('Siguiente','audit-next','',opsAuditRows.length<25)+'</div>';
}
function opsExport(name,headers,rows){downloadBlob(new Blob([ArOpsCore.xlsx(headers,rows)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name+'.xlsx');}
