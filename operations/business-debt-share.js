let businessDebtShareBusy=false;
let businessDebtCommentDrafts=new Map();
const businessDebtHeaders=['Cliente','Negocio','Facturas abiertas','Adeudo total','Al corriente','1–30 días','31–60 días','Más de 60','Vencido','Máx. días','Comentarios'];
function businessDebtCommentKey(customerId,business,currency=selectedCurrency()){
 return 'amao_business_debt_comment_v1_'+encodeURIComponent(activeUserId||'')+'_'+currency+'_'+encodeURIComponent(customerId)+'_'+encodeURIComponent(business);
}
function businessDebtCommentValue(customerId,business,currency=selectedCurrency()){
 if(!featuresReady)return '';
 const key=businessDebtCommentKey(customerId,business,currency);
 if(businessDebtCommentDrafts.has(key))return businessDebtCommentDrafts.get(key);
 try{return String(localStorage.getItem(key)||'').slice(0,240);}catch{return '';}
}
function businessDebtCommentField(group){
 const value=businessDebtCommentValue(group.customer_id,group.business);
 return '<textarea class="field business-debt-comment" rows="2" maxlength="240" data-business-debt-customer="'+esc(group.customer_id)+'" data-business-debt-business="'+esc(group.business)+'" data-business-debt-currency="'+esc(selectedCurrency())+'" aria-label="Comentario de '+esc(group.customer)+' · '+esc(group.business)+'" placeholder="Comentario para esta línea"'+(!featuresReady?' disabled':'')+'>'+esc(value)+'</textarea>';
}
function businessDebtShareFeedback(message='',error=false){
 const host=$('businessDebtFeedback');if(!host)return;
 host.textContent=message;host.classList.toggle('red',error);
}
function syncBusinessDebtShareControls(){
 const filter=$('analysisBusinessFilter')?.value||'all';
 if($('businessDebtFilter'))$('businessDebtFilter').value=filter;
 const rows=window.businessDebtRows||[],total=(window.businessDebtExport||[]).reduce((n,r)=>n+cents(r[3]),0),clients=new Set(rows.map(r=>r.customer_id)).size;
 const label=filter==='all'?'Todos los negocios':filter;
 if($('businessDebtCaption'))$('businessDebtCaption').textContent=label+' · '+selectedCurrency()+' · Saldos al '+date(today())+' · '+clients+' clientes · Adeudo '+money(amount(total),selectedCurrency());
 for(const id of ['downloadBusinessDebtImage','copyBusinessDebtImage'])if($(id))$(id).disabled=!featuresReady||!rows.length||businessDebtShareBusy;
}
const businessDebtRenderBeforeShare=renderBusinessDebt;
renderBusinessDebt=function(rows){
 const result=businessDebtRenderBeforeShare(rows);
 const groups=window.businessDebtRows||[];
 window.businessDebtExport=(window.businessDebtExport||[]).map((row,index)=>[...row,businessDebtCommentValue(groups[index]?.customer_id,groups[index]?.business)]);
 syncBusinessDebtShareControls();return result;
};
function businessDebtShareModel(){
 if(!featuresReady||dashboardAccess.loading||dashboardAccess.error||!activeUserId)throw Error('Actualiza la cartera antes de crear la imagen.');
 renderBusinessDebt(selectedAnalysisRows());
 const rows=(window.businessDebtExport||[]).map(row=>[...row]);
 if(!rows.length)throw Error('No hay adeudos para el negocio y moneda seleccionados.');
 const currency=selectedCurrency(),filter=$('analysisBusinessFilter').value,label=filter==='all'?'Todos los negocios':filter;
 const totals=Array(11).fill('');totals[0]='TOTAL GENERAL';totals[1]=label;totals[2]=rows.reduce((n,r)=>n+Number(r[2]),0);
 for(let col=3;col<=8;col++)totals[col]=amount(rows.reduce((n,r)=>n+cents(r[col]),0));
 totals[9]=Math.max(0,...rows.map(r=>Number(r[9])||0));
 const display=row=>row.map((value,col)=>col>=3&&col<=8?money(value,currency):col===9?String(value)+' días':String(value??''));
 return {title:'Adeudo por cliente y negocio',subtitle:'Negocio: '+label+' · Moneda: '+currency+' · Saldos al '+date(today())+' · '+new Set((window.businessDebtRows||[]).map(r=>r.customer_id)).size+' clientes · '+totals[2]+' facturas',headers:businessDebtHeaders.map((header,index)=>index===2?'Facturas':header),widths:[375,145,150,220,210,190,190,190,210,145,470],aligns:['left','left','right','right','right','right','right','right','right','right','left'],rows:rows.map(row=>({cells:display(row)})),footers:[display(totals)],note:'Saldo pendiente actual, después de pagos y notas de crédito. Las facturas liquidadas y canceladas no se incluyen. Todos los clientes del filtro aparecen en esta imagen. Comentarios capturados para cada línea.',currency,filter,label,user:activeUserId,sourceRows:rows};
}
async function businessDebtImageAction(copy=false){
 if(businessDebtShareBusy)return;
 businessDebtShareBusy=true;syncBusinessDebtShareControls();businessDebtShareFeedback(copy?'Preparando imagen para copiar…':'Generando imagen para WhatsApp…');
 try{
  const model=businessDebtShareModel(),canvas=createTrackingCanvas(model);
  const blob=await holdTableImageBlob(canvas);
  if(!featuresReady||activeUserId!==model.user)throw Error('Cambió la sesión. Vuelve a abrir el reporte.');
  if(selectedCurrency()!==model.currency||$('analysisBusinessFilter').value!==model.filter)throw Error('Cambió el filtro. Vuelve a generar la imagen del negocio que elegiste.');
  if(JSON.stringify(window.businessDebtExport)!==JSON.stringify(model.sourceRows))throw Error('El desglose o los comentarios cambiaron. Vuelve a generar la imagen.');
  let copied=false;
  if(copy&&navigator.clipboard?.write&&typeof ClipboardItem!=='undefined'){
   try{await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);copied=true;}catch{}
  }
  if(copied)businessDebtShareFeedback('Imagen de '+model.label+' · '+model.currency+' copiada. Pégala en WhatsApp con Ctrl + V.');
  else{
   const slug=model.filter==='all'?'Todos':model.filter==='Cartón'?'Carton':model.filter;
   downloadBlob(blob,'AMAO_Adeudo_'+slug+'_'+model.currency+'_'+today()+'.png');
   businessDebtShareFeedback((copy?'El navegador no permitió copiar; se descargó la imagen. ':'Imagen descargada. ')+model.label+' · '+model.currency+' · Incluye todos los clientes, comentarios y total. Adjunta el PNG en WhatsApp.');
  }
 }catch(error){businessDebtShareFeedback(error.message||'No se pudo crear la imagen. Vuelve a intentarlo.',true);}
 finally{businessDebtShareBusy=false;syncBusinessDebtShareControls();}
}
$('businessDebtFilter').addEventListener('change',event=>{
 const value=event.target.value;if(!['all','Cartón','Foam','Otro'].includes(value))return;
 $('analysisBusinessFilter').value=value;businessDebtShareFeedback();renderAll();
});
$('downloadBusinessDebtImage').addEventListener('click',()=>businessDebtImageAction(false));
$('copyBusinessDebtImage').addEventListener('click',()=>businessDebtImageAction(true));
$('businessDebtTable').addEventListener('input',event=>{
 const field=event.target,customerId=field?.dataset?.businessDebtCustomer;
 if(!customerId||!featuresReady)return;
 const business=field.dataset.businessDebtBusiness,currency=field.dataset.businessDebtCurrency;
 const value=String(field.value||'').slice(0,240),key=businessDebtCommentKey(customerId,business,currency);
 businessDebtCommentDrafts.set(key,value);
 const groups=window.businessDebtRows||[],index=groups.findIndex(g=>g.customer_id===customerId&&g.business===business);
 if(currency===selectedCurrency()&&index>=0&&window.businessDebtExport?.[index])window.businessDebtExport[index][10]=value;
 try{if(value)localStorage.setItem(key,value);else localStorage.removeItem(key);businessDebtShareFeedback();}
 catch{businessDebtShareFeedback('El comentario sigue disponible en esta sesión, pero no se pudo conservar al recargar.',true);}
});
const businessDebtResetBeforeShare=resetCollectionTools;
resetCollectionTools=function(){
 const result=businessDebtResetBeforeShare();businessDebtCommentDrafts.clear();window.businessDebtRows=[];window.businessDebtExport=[];
 if($('businessDebtTable'))$('businessDebtTable').innerHTML='';
 businessDebtShareFeedback();syncBusinessDebtShareControls();return result;
};
