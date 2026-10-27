let opsStatementSummary=false;
const opsOriginalStatementAccount=clientStatementAccount;
clientStatementAccount=function(id){const a=opsOriginalStatementAccount(id);if(a)a.company=opsCompany();return a;};
const opsOriginalStatementOpen=openClientStatement;
openClientStatement=function(id){opsOriginalStatementOpen(id);if(opsStatementSummary){const account=clientStatementAccount(id);if(account)$('clientStatementContent').innerHTML=ArBillingCore.statementExecutiveHTML(account,{companyLogo:document.querySelector('.brand img')?.src||''});}const button=$('opsStatementMode');if(button)button.textContent=opsStatementSummary?'Ver detalle por factura':'Resumen de una página';};
function opsFormalPromise(key){const row=trackingRow(key);if(!row)return;$('detailModal').classList.remove('open');preparePromise();go('promises');$('promiseFormPanel').classList.remove('hidden');$('promiseCustomer').value=row.customer_id;$('promiseCurrency').value=row.currency;fillPromiseInvoices();$('promiseAmount').value=row.payment||'';$('promiseDate').value=row.paymentDate||today();updatePromisePreview();$('promiseFormPanel').scrollIntoView({behavior:'smooth'});}
const opsOriginalTrackingUpdate=openTrackingUpdate;
openTrackingUpdate=function(key){opsOriginalTrackingUpdate(key);const form=$('trackingUpdateForm');if(form&&collectionCanWrite()){const b=document.createElement('button');b.type='button';b.className='pill';b.dataset.opsAction='formal-promise';b.dataset.value=key;b.textContent='Crear promesa formal con este acuerdo';form.querySelector('.form-actions')?.prepend(b);}};
async function opsHandleAction(action,value,button){
 if(action==='tab')return openOperations(value);
 if(action==='sync')return opsReviewSync();
 if(action==='sync-backup')return downloadBlob(new Blob([JSON.stringify(opsConflict?.local||currentBillingPayload(),null,2)],{type:'application/json'}),'AMAO_cambios_pendientes_'+today()+'.json');
 if(action==='client')return openCollectionClient(value);
 if(action==='activity')return openCollectionActivity(null,value);
 if(action==='statement')return openClientStatement(value);
 if(action==='invoice')return openInvoiceEditor(value);
 if(action==='customer')return openCustomerEditor(value);
 if(action==='payments')return go('payments');
 if(action==='invoice-prev'||action==='invoice-next'){opsInvoicePage+=action==='invoice-next'?1:-1;return renderInvoiceSearchOnly();}
 if(action==='quality-export'){const rows=ArOpsCore.quality(opsData());return opsExport('Calidad_datos_'+today(),['Tipo','Cliente','Observación'],rows.map(r=>[r.kind,customerName(r.customer_id),r.message]));}
 if(action==='audit-prev'||action==='audit-next'){opsAuditPage+=action==='audit-next'?1:-1;return loadOpsAudit();}
 if(action==='audit-load')return loadOpsAudit();
 if(action==='audit-detail')return openOpsAuditDetail(value);
 if(action==='report-build'){opsReportPage=0;return updateOpsReport();}
 if(action==='report-week'||action==='report-month'){opsReportFilters.start=action==='report-week'?ArWeeklyReports.week(today()).start:today().slice(0,7)+'-01';opsReportFilters.end=today();opsReportPage=0;return renderOpsReports();}
 if(action==='report-prev'||action==='report-next'){opsReportPage+=action==='report-next'?1:-1;return updateOpsReport();}
 if(action==='report-excel'){updateOpsReport();const r=opsReportModel;if(r)return opsExport('AMAO_'+opsReportFilters.type+'_'+r.start+'_'+r.end,r.headers,r.rows);throw Error('Corrige el periodo del reporte antes de descargarlo.');}
 if(action==='report-image')return opsReportImage();
 if(action==='report-copy'){updateOpsReport();if(!opsReportModel)throw Error('Corrige el periodo del reporte antes de copiarlo.');const text=$('opsReportText').value;try{await navigator.clipboard.writeText(text);}catch{const field=$('opsReportText');field.focus();field.select?.();throw Error('El navegador no permitió copiar. El texto está seleccionado; usa Ctrl + C para copiarlo.');}opsNotify('Reporte copiado para compartir.');return showMsg('Reporte copiado para compartir.');}
 if(action==='users-load')return loadOpsUsers();
 if(action==='user-role')return saveOpsRole(value);
 if(action==='credit-review')return openOpsCreditReview(value);
 if(action==='document-open')return openOpsDocument(value);
 if(action==='document-remove')return removeOpsDocument(value);
 if(action==='invoice-documents'){const i=invoices.find(i=>i.id===value);if(!i)return;opsDocumentCustomer=i.customer_id;opsDocumentEntity='invoice';opsDocumentRecord=i.id;return openOperations('documents');}
 if(action==='virtual-edit')return openOpsVirtual(value);
 if(action==='virtual-export')return exportOpsVirtual();
 if(action==='virtual-remove'){if(!opsCanWrite())return;const next=opsClone(operationsState.payload),r=next.virtuals.find(v=>v.id===value);if(r){r.removed_at=new Date().toISOString();await saveOperations(next);renderOpsVirtuals();}return;}
 if(action==='statement-mode'){opsStatementSummary=!opsStatementSummary;return openClientStatement($('clientStatementModal').dataset.customerId);}
 if(action==='formal-promise')return opsFormalPromise(value);
 throw Error('Esta opción no está disponible. Actualiza el dashboard y vuelve a intentarlo.');
}
const opsPendingActions=new Set();
document.addEventListener('click',async event=>{
 const b=event.target.closest?.('button');if(!b||(!b.dataset.opsTab&&!b.dataset.opsAction)||b.disabled)return;
 const key=(b.dataset.opsTab?'tab:'+b.dataset.opsTab:b.dataset.opsAction+':'+(b.dataset.value||''));if(opsPendingActions.has(key)){opsNotify('Esta acción sigue en curso…','loading',b);return;}
 opsPendingActions.add(key);b.disabled=true;b.setAttribute('aria-busy','true');opsNotify('', 'success',b);
 try{if(b.dataset.opsTab)await openOperations(b.dataset.opsTab);else await opsHandleAction(b.dataset.opsAction,b.dataset.value||'',b);}
 catch(e){const message=e.message||'No se pudo completar la acción.';opsNotify(message,'error',b);showMsg(message,'error');}
 finally{opsPendingActions.delete(key);if(b.isConnected!==false){b.disabled=false;b.removeAttribute('aria-busy');}}
});
document.addEventListener('keydown',event=>{const b=event.target.closest?.('[data-ops-tab]');if(!b||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=[...document.querySelectorAll('[data-ops-tab]')],index=tabs.indexOf(b),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;tabs[next]?.focus();tabs[next]?.click();});
document.addEventListener('change',event=>{
 const id=event.target.id||'';if(id.startsWith('opsReport')){opsReportPage=0;try{updateOpsReport();opsNotify();}catch(error){opsNotify(error.message,'error');}}
 if(id==='opsDocumentCustomer'||id==='opsDocumentEntity'){opsDocumentCustomer=$('opsDocumentCustomer').value;opsDocumentEntity=$('opsDocumentEntity').value;opsDocumentRecord='';renderOpsDocuments();}
 if(id==='opsDocumentRecord')opsDocumentRecord=event.target.value;
 if(id==='opsVirtualCustomer'||id==='opsVirtualMonth'){opsVirtualCustomer=$('opsVirtualCustomer').value;opsVirtualMonth=$('opsVirtualMonth').value;renderOpsVirtuals();}
 if(['invoiceSearch','invoiceCustomerFilter','invoiceStatus','invoiceFilterDate','invoiceFilterAmount','currency'].includes(id))opsInvoicePage=0;
});
document.addEventListener('input',event=>{if(['invoiceSearch','invoiceCustomerSearch'].includes(event.target.id))opsInvoicePage=0;if(event.target.id==='statementSearch')opsStatementPage=0;if(event.target.id==='paymentHistorySearch'){opsCashPage=0;opsApplicationPage=0;}});
document.addEventListener('submit',async e=>{
 const actions={opsCompanyForm:saveOpsCompany,opsCreditReviewForm:saveOpsCreditReview,opsVirtualForm:saveOpsVirtual,opsDocumentForm:uploadOpsDocument,opsConflictForm:saveOpsConflict,opsPasswordForm:async event=>{event.preventDefault();const f=event.target.elements;if(f.password.value!==f.confirm.value)throw Error('Las contraseñas no coinciden.');if(f.password.value.length<12)throw Error('Utiliza al menos 12 caracteres.');const {error}=await sb.auth.updateUser({password:f.password.value});f.password.value='';f.confirm.value='';if(error)throw error;opsOriginalMsg('Tu contraseña fue actualizada.','success','opsPasswordFeedback');}};
 const run=actions[e.target.id];if(!run)return;e.preventDefault();const b=e.submitter;if(b?.disabled)return;if(b){b.disabled=true;b.setAttribute('aria-busy','true');}opsNotify('', 'success',e.target);try{await run(e);}catch(error){opsNotify(error.message||'No se pudo guardar.','error',e.target);opsOriginalMsg(error.message||'No se pudo guardar.','error',e.target.id==='opsPasswordForm'?'opsPasswordFeedback':'globalMsg');}finally{if(b&&b.isConnected!==false){b.disabled=false;b.removeAttribute('aria-busy');}}
});
let opsReloadPending=false;
$('opsReload').addEventListener('click',async e=>{if(opsReloadPending)return;opsReloadPending=true;const button=e.currentTarget;button.disabled=true;try{opsNotify('Actualizando cartera y herramientas…','loading');await loadData();if(!featuresReady||!operationsState.ready)throw Error(operationsState.error||'No se pudo actualizar la cartera. Revisa tu conexión y vuelve a intentarlo.');opsNotify('Cartera y herramientas actualizadas.');}catch(error){opsNotify(error.message||'No se pudieron actualizar las herramientas.','error');showMsg(error.message||'No se pudieron actualizar las herramientas.','error');}finally{opsReloadPending=false;button.disabled=false;}});
let opsStatementPage=0,opsCashPage=0,opsApplicationPage=0;
function opsPager(page,total,kind){const pages=Math.max(1,Math.ceil(total/50));return '<div class="invoice-pager">'+opsAction('Anterior',kind+'-prev','',page===0)+'<span>Página '+(page+1)+' de '+pages+' · '+total+' registros</span>'+opsAction('Siguiente',kind+'-next','',page>=pages-1)+'</div>';}
function opsStatementTableHTML(rows){opsStatementPage=Math.min(opsStatementPage,Math.max(0,Math.ceil(rows.length/50)-1));return table(rows.slice(opsStatementPage*50,(opsStatementPage+1)*50).map(invoiceRow),invoiceHeaders)+opsPager(opsStatementPage,rows.length,'statement');}
function opsCashPager(total){return opsPager(opsCashPage,total,'cash');}
function opsApplicationPager(total){return opsPager(opsApplicationPage,total,'application');}
const opsActionBeforePagers=opsHandleAction;
opsHandleAction=async function(action,value,button){
 if(action==='statement-next'||action==='statement-prev'){opsStatementPage+=action.endsWith('next')?1:-1;return renderStatementSearchOnly();}
 if(action==='cash-next'||action==='cash-prev'){opsCashPage+=action.endsWith('next')?1:-1;return renderCashHistory();}
 if(action==='application-next'||action==='application-prev'){opsApplicationPage+=action.endsWith('next')?1:-1;return renderCashHistory();}
 return opsActionBeforePagers(action,value,button);
};
