let operationsState={user:null,ready:false,version:0,payload:{company:{},creditReviews:{},virtuals:[],attachments:[]},error:''};
let operationsTab='day',opsAuditRows=[],opsAuditPage=0,opsAuditOffset=0,opsReportPage=0,opsReportModel=null,opsPendingMessage='',opsBasePayload=null,opsConflict=null,opsCache=null,opsInvoicePage=0;
const opsCanWrite=()=>['admin','facturacion','cobranza'].includes(dashboardAccess.role)&&!dashboardWriteBlocked();
const opsAdmin=()=>dashboardAccess.role==='admin'&&!dashboardWriteBlocked();
const opsClone=v=>JSON.parse(JSON.stringify(v));
function opsData(){return {...currentBillingPayload(),customers,invoices,payments};}
function opsAction(text,action,value='',disabled=false){return '<button type="button" class="pill" data-ops-action="'+action+'" data-value="'+esc(value)+'"'+(disabled?' disabled':'')+'>'+esc(text)+'</button>';}
function opsMetric(label,value,detail=''){return '<div class="ops-tile">'+esc(label)+'<strong>'+esc(value)+'</strong><span>'+esc(detail)+'</span></div>';}
async function loadOperations(){
 const user=activeUserId;if(operationsState.user!==user){operationsState={user,ready:false,version:0,payload:{company:{},creditReviews:{},virtuals:[],attachments:[]},error:''};opsAuditRows=[];opsBasePayload=null;opsConflict=null;}
 try{const {data,error}=await sb.from('ar_operations').select('*').eq('id','main').single();if(error)throw error;if(!data?.payload)throw Error('No se encontró la configuración compartida.');if(user!==activeUserId)return;operationsState={...data,user,ready:true,error:''};opsConfigureMail();}
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
 for(const b of document.querySelectorAll('[data-ops-tab]'))b.setAttribute('aria-selected',String(b.dataset.opsTab===operationsTab));
 $('opsStatus').textContent=operationsState.error||(!operationsState.ready?'Cargando herramientas…':'Datos compartidos · '+date(today())+' · '+selectedCurrency());
 const render={day:renderOpsDay,reports:renderOpsReports,quality:renderOpsQuality,audit:renderOpsAudit,documents:renderOpsDocuments,virtuals:renderOpsVirtuals,settings:renderOpsSettings}[operationsTab];render?.();
 });
}
function openOperations(tab='day'){operationsTab=tab;go('operations');if(tab==='audit')return loadOpsAudit();}
function renderOpsDay(){
 const day=today(),rows=[...(collectionModels.agenda||[])],cur=selectedCurrency(),reviews=operationsState.payload.creditReviews||{};
 for(const c of customers){if(rows.some(r=>r.customer.id===c.id))continue;const review=reviews[c.id],a=accountSummary(c.id,cur),reasons=[];if(review?.date&&review.date<=day)reasons.push('Revisión de crédito: '+date(review.date));if(a.exceeded)reasons.push('Crédito autorizado excedido');if(!reasons.length)continue;rows.push({customer:c,reasons,overdue:a.overdue,lastActivity:collectionModels.behavior.get(c.id)?.lastActivity});}
 $('opsPanel').innerHTML='<h2>Mi día de cobranza</h2><p class="sub">Primero las promesas atrasadas, después los seguimientos y compromisos de hoy. Los importes están en '+esc(cur)+'.</p><div class="ops-grid">'+opsMetric('Clientes por atender',String(rows.length))+opsMetric('Seguimientos para hoy',String(collectionState.activities.filter(a=>a.followup_status==='open'&&a.next_contact_on<=day).length))+opsMetric('Revisión de crédito pendiente',String(Object.values(reviews).filter(r=>r.date&&r.date<=day).length))+opsMetric('Fecha de trabajo',ArBillingCore.statementDate(day),'Ciudad Juárez')+'</div><div class="ops-table">'+table(rows.slice(0,60).map(r=>'<tr><td><b>'+esc(r.customer.legal_name)+'</b></td><td>'+r.reasons.map(esc).join('<br>')+'</td><td>'+money(r.overdue,cur)+'</td><td>'+esc(r.lastActivity?date(r.lastActivity.happened_on):'Sin gestión')+'</td><td><div class="ops-actions">'+opsAction('Ver seguimiento','client',r.customer.id)+opsAction('Registrar gestión','activity',r.customer.id,!collectionCanWrite())+opsAction('Estado de cuenta','statement',r.customer.id)+'</div></td></tr>'),['Cliente','Qué requiere atención','Vencido','Último contacto','Acción'])+'</div><p class="meta">Las próximas facturas y los límites excedidos se consultan también en el resumen y en Clientes en Credit Hold.</p>';
}
function renderOpsQuality(){
 const issues=ArOpsCore.quality(opsData());$('opsPanel').innerHTML='<h2>Calidad de datos</h2><p class="sub">'+issues.length+' observaciones. Revísalas antes de corregir; los saldos y fechas no se cambian automáticamente.</p><div class="ops-toolbar">'+opsAction('Descargar revisión en Excel','quality-export')+'</div><div class="ops-table">'+table(issues.map(r=>'<tr><td>'+esc(r.kind)+'</td><td>'+esc(customerName(r.customer_id))+'</td><td>'+esc(r.message)+'</td><td>'+opsAction('Revisar',r.action==='invoice'?'invoice':r.action==='customer'?'customer':'payments',r.record_id,!opsCanWrite())+'</td></tr>'),['Tipo','Cliente','Observación','Acción'])+'</div>';
}
async function loadOpsAudit(){
 if(!opsCanWrite()){opsAuditRows=[];renderOpsAudit();return;}const user=activeUserId;try{const {data,error}=await sb.from('ar_audit_log').select('id,happened_at,actor_id,actor_role,entity,record_id,action,before_data,after_data').order('id',{ascending:false}).range(opsAuditPage*25,opsAuditPage*25+24);if(error)throw error;if(user!==activeUserId)return;opsAuditRows=data;if(activeTab==='operations'&&operationsTab==='audit')renderOpsAudit();}catch(e){showMsg(e.message,'error');}
}
function renderOpsAudit(){
 if(!opsCanWrite()){$('opsPanel').innerHTML='<h2>Historial de cambios</h2><p>El historial de cambios está disponible para los usuarios con permiso de operación.</p>';return;}
 $('opsPanel').innerHTML='<h2>Historial de cambios</h2><p class="sub">Quién cambió cada registro y sus valores anteriores. El historial comienza con esta actualización.</p><div class="ops-table">'+table(opsAuditRows.map(a=>'<tr><td>'+esc(new Date(a.happened_at).toLocaleString('es-MX',{timeZone:'America/Ciudad_Juarez'}))+'</td><td>'+esc(a.actor_id===activeUserId?'Tú':a.actor_role||'Proceso automático')+'<small class="ops-muted">'+esc(a.actor_role||'Servidor')+'</small></td><td>'+esc(a.entity)+'</td><td>'+esc(({INSERT:'Creado',UPDATE:'Modificado',DELETE:'Eliminado'})[a.action]||a.action)+'</td><td>'+opsAction('Ver cambios','audit-detail',String(a.id))+'</td></tr>'),['Fecha','Responsable','Registro','Acción','Detalle'])+'</div><div class="ops-pager">'+opsAction('Anterior','audit-prev','',opsAuditPage===0)+'<span>Página '+(opsAuditPage+1)+'</span>'+opsAction('Siguiente','audit-next','',opsAuditRows.length<25)+'</div>';
}
function opsExport(name,headers,rows){downloadBlob(new Blob([ArOpsCore.xlsx(headers,rows)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name+'.xlsx');}
