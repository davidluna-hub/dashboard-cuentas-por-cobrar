let weeklyCollectionAnchor=null,promisePublicationAnchor=null,promisePublicationStatus='pending',promisePublicationPage=0;
const reportMoney=(n,c)=>new Intl.NumberFormat('es-MX',{style:'currency',currency:c,currencyDisplay:'code',minimumFractionDigits:2}).format(n||0).replace(/\u00a0/g,' ');
const reportDate=d=>ArBillingCore.statementDate(d);
const reportPeriodLabel=p=>'Semana '+p.number+' de '+p.year+' · '+reportDate(p.start)+' al '+reportDate(p.end);
function currentWeeklyCollectionReport(){return ArWeeklyReports.weeklyCollections({invoices,payments,localPayments,receipts},weeklyCollectionAnchor||ArWeeklyReports.today());}
function currentPromisePublication(){return ArWeeklyReports.promisePublication(promiseDetails(),customers,promisePublicationAnchor||ArWeeklyReports.today(),promisePublicationStatus);}
function publicationPages(rows,size=8){const pages=[];for(let i=0;i<rows.length;i+=size)pages.push(rows.slice(i,i+size));return pages.length?pages:[[]];}
function promisePublicationLabel(p){return ({fulfilled:'Cumplida',overdue:p.applied>0?'Vencida · parcial':'Vencida',today:p.applied>0?'Hoy · parcial':'Para hoy',partial:'Abono parcial',upcoming:'Programada'})[p.state]||'Programada';}
function promisePublicationModel(data=currentPromisePublication(),page=promisePublicationPage){
 const pages=publicationPages(data.rows),index=Math.max(0,Math.min(pages.length-1,page)),rows=pages[index],totals=ArWeeklyReports.promiseTotals(rows),filter=({pending:'Pendientes',fulfilled:'Cumplidas',overdue:'Vencidas',all:'Todas, sin canceladas'})[promisePublicationStatus];
 return {key:'promesas',title:'Promesas de pago',subtitle:reportPeriodLabel(data.period)+' · '+filter+' · Página '+(index+1)+' de '+pages.length,headers:['Cliente','Fecha / factura','Prometido','Recibido','Por cumplir','Estado'],widths:[310,250,218,210,210,170],rows:rows.map((p,n)=>({cells:[(index*8+n+1)+'. '+p.name,reportDate(p.scheduled_date)+'\n'+(p.invoice?.invoice_number||'Acuerdo general')+(p.plan?.kind==='schedule'?' · cuota '+p.installment:''),reportMoney(p.amount,p.currency),reportMoney(p.applied,p.currency),reportMoney(p.remaining,p.currency),promisePublicationLabel(p)],state:p.state})),footers:['MXN','USD'].map(c=>['Total '+c+' de esta página','',reportMoney(totals[c].amount,c),reportMoney(totals[c].applied,c),reportMoney(totals[c].remaining,c),'']),empty:'Sin promesas para esta semana y filtro.',note:'Corte '+reportDate(ArWeeklyReports.today())+'. Estado actual de los compromisos. Una promesa no representa dinero recibido.',index,pages,period:data.period};
}
function weeklyCollectionModel(data=currentWeeklyCollectionReport()){
 return {key:'cobranza_semanal',title:'Cobranza semanal · Cartón y Foam',subtitle:reportPeriodLabel(data.period)+' · Corte '+reportDate(ArWeeklyReports.today()),headers:['Negocio / clasificación','Pagado MXN','Pagado USD'],widths:[550,409,409],rows:data.rows.map(r=>({cells:[r.business,reportMoney(r.mxn,'MXN'),reportMoney(r.usd,'USD')]})),footers:[['Total recibido',reportMoney(data.totals.MXN,'MXN'),reportMoney(data.totals.USD,'USD')]],empty:'Sin pagos recibidos en esta semana.',note:'Fecha del ingreso original. Las aplicaciones de saldo a favor no se cuentan como un nuevo cobro.'+(data.warnings.length?' Atención: '+data.warnings.length+' registro(s) requieren revisión; consulta el dashboard.':''),period:data.period,index:0,pages:[data.rows]};
}
function publicationHTML(model){
 const cells=(values,tag='td')=>values.map(v=>'<'+tag+'>'+esc(v)+'</'+tag+'>').join('');
 return '<div class="report-share-paper"><div class="report-share-heading"><b>AMAO</b><div><strong>'+esc(model.title)+'</strong><span>'+esc(model.subtitle)+'</span></div></div><table class="report-share-table"><colgroup>'+model.widths.map(w=>'<col style="width:'+(w/1368*100).toFixed(2)+'%">').join('')+'</colgroup><thead><tr>'+cells(model.headers,'th')+'</tr></thead><tbody>'+(model.rows.length?model.rows.map(r=>'<tr class="report-status-'+esc(r.state||'')+'">'+cells(r.cells)+'</tr>').join(''):'<tr><td colspan="'+model.headers.length+'">'+esc(model.empty)+'</td></tr>')+'</tbody><tfoot>'+model.footers.map(r=>'<tr>'+cells(r)+'</tr>').join('')+'</tfoot></table><p>'+esc(model.note)+'</p></div>';
}
function promisePublicationText(data=currentPromisePublication()){
 const lines=['AMAO | Promesas de pago',reportPeriodLabel(data.period),'Corte '+reportDate(ArWeeklyReports.today())+' · Estado actual',''];
 data.rows.forEach((p,n)=>lines.push((n+1)+'. '+p.name+' | '+reportDate(p.scheduled_date)+' | '+(p.invoice?.invoice_number||'Acuerdo general'),'Prometido '+reportMoney(p.amount,p.currency)+' | Recibido '+reportMoney(p.applied,p.currency)+' | Por cumplir '+reportMoney(p.remaining,p.currency)+' | '+promisePublicationLabel(p),''));
 if(!data.rows.length)lines.push('Sin promesas para esta semana y filtro.');
 for(const c of ['MXN','USD'])lines.push(c+' · Prometido '+reportMoney(data.totals[c].amount,c)+' · Recibido '+reportMoney(data.totals[c].applied,c)+' · Por cumplir '+reportMoney(data.totals[c].remaining,c));
 return lines.join('\n');
}
function weeklyCollectionText(data=currentWeeklyCollectionReport()){
 return ['AMAO | Cobranza semanal',reportPeriodLabel(data.period),'Negocio | Pagado MXN | Pagado USD',...data.rows.map(r=>r.business+' | '+reportMoney(r.mxn,'MXN')+' | '+reportMoney(r.usd,'USD')),'Total recibido | '+reportMoney(data.totals.MXN,'MXN')+' | '+reportMoney(data.totals.USD,'USD'),'Fecha del ingreso original; el saldo a favor aplicado no se cuenta otra vez.',...(data.warnings.length?['Atención: '+data.warnings.length+' registro(s) requieren revisión en el dashboard.']:[])].join('\n');
}
function renderPromisePublication(){
 if(!$('promiseSharePreview'))return;
 const data=currentPromisePublication(),model=promisePublicationModel(data);promisePublicationPage=model.index;
 $('promiseShareWeek').value=data.period.start;$('promiseShareStatus').value=promisePublicationStatus;
 $('promiseSharePage').innerHTML=model.pages.map((rows,n)=>'<option value="'+n+'">'+(n+1)+' / '+model.pages.length+'</option>').join('');$('promiseSharePage').value=String(model.index);
 $('promiseSharePreview').innerHTML=publicationHTML(model);$('promiseShareText').value=promisePublicationText(data);
 $('promiseShareSummary').textContent=data.rows.length+' compromiso(s) · Por cumplir '+reportMoney(data.totals.MXN.remaining,'MXN')+' y '+reportMoney(data.totals.USD.remaining,'USD');
 $('promiseShareHint').textContent=model.pages.length>1?'La selección se divide en '+model.pages.length+' imágenes de hasta 8 compromisos. Descarga o copia cada página.':'Tabla lista para descargar o copiar y pegar en WhatsApp.';
}
function renderWeeklyCollections(){
 if(!$('weeklyCollectionTable'))return;
 const data=currentWeeklyCollectionReport();$('weeklyCollectionWeek').value=data.period.start;$('weeklyCollectionCaption').textContent=reportPeriodLabel(data.period)+' · '+data.receiptCount+' registro(s) de cobro · Ambas monedas, sin filtros de negocio';
 $('weeklyCollectionMetrics').innerHTML=['MXN','USD'].map(c=>'<div class="weekly-collection-metric"><span>Total recibido '+c+'</span><b>'+esc(reportMoney(data.totals[c],c))+'</b></div>').join('');
 $('weeklyCollectionTable').innerHTML='<table><thead><tr><th>Negocio / clasificación</th><th>Pagado MXN</th><th>Pagado USD</th></tr></thead><tbody>'+data.rows.map(r=>'<tr><td><b>'+esc(r.business)+'</b></td><td>'+reportMoney(r.mxn,'MXN')+'</td><td>'+reportMoney(r.usd,'USD')+'</td></tr>').join('')+'</tbody><tfoot><tr><td>Total recibido</td><td>'+reportMoney(data.totals.MXN,'MXN')+'</td><td>'+reportMoney(data.totals.USD,'USD')+'</td></tr></tfoot></table>';
 $('weeklyCollectionSharePreview').innerHTML=publicationHTML(weeklyCollectionModel(data));$('weeklyCollectionShareText').value=weeklyCollectionText(data);
 $('weeklyCollectionWarning').textContent=data.warnings.length?data.warnings.length+' registro(s) requieren revisión: '+data.warnings.slice(0,3).join(' · ')+'. Las aplicaciones sin ingreso original se excluyen como nuevos cobros.':'';
}
function createPublicationCanvas(model){
 const width=1440,pad=36,columns=model.widths,measure=document.createElement('canvas').getContext('2d');
 const prepare=(values,bold=false)=>values.map((v,n)=>{measure.font=(bold||n===0?'bold ':'')+'22px Arial';return holdCanvasLines(measure,v,columns[n]-28);});
 const headers=prepare(model.headers,true),headerHeight=Math.max(62,...headers.map(l=>l.length*30+28)),prepared=model.rows.map(r=>{const lines=prepare(r.cells);return {lines,height:Math.max(78,...lines.map(l=>l.length*30+28)),state:r.state};}),footers=model.footers.map(values=>{const lines=prepare(values,true);return {lines,height:Math.max(68,...lines.map(l=>l.length*30+28))};});
 measure.font='22px Arial';const subtitle=holdCanvasLines(measure,model.subtitle,width-pad*2-155),bannerHeight=80+subtitle.length*28,tableY=bannerHeight+24,bodyHeight=prepared.reduce((n,r)=>n+r.height,0)||86;
 measure.font='20px Arial';const note=holdCanvasLines(measure,model.note,width-pad*2),height=tableY+headerHeight+bodyHeight+footers.reduce((n,r)=>n+r.height,0)+38+note.length*27+25;
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#126c6b';ctx.fillRect(0,0,width,bannerHeight);ctx.fillStyle='#fff';ctx.font='bold 34px Arial';ctx.fillText('AMAO',pad,49);ctx.font='bold 28px Arial';ctx.fillText(model.title,pad+155,48);ctx.font='22px Arial';ctx.fillStyle='#d9efec';subtitle.forEach((s,n)=>ctx.fillText(s,pad+155,83+n*28));
 const draw=(row,y,fill,bold=false,color='#263b35')=>{let x=pad;row.lines.forEach((lines,n)=>{ctx.fillStyle=fill;ctx.fillRect(x,y,columns[n],row.height);ctx.strokeStyle='#dce5df';ctx.lineWidth=1;ctx.strokeRect(x,y,columns[n],row.height);ctx.fillStyle=color;ctx.font=(bold||n===0?'bold ':'')+'22px Arial';lines.forEach((s,k)=>ctx.fillText(s,x+14,y+38+k*30));x+=columns[n];});};
 let y=tableY;draw({lines:headers,height:headerHeight},y,'#e8f3ef',true,'#12604e');y+=headerHeight;
 prepared.forEach((r,n)=>{draw(r,y,n%2?'#f7faf8':'#fff',false,r.state==='overdue'?'#a92f3b':r.state==='fulfilled'?'#087447':'#263b35');y+=r.height;});
 if(!prepared.length){ctx.fillStyle='#5b6f65';ctx.font='22px Arial';ctx.fillText(model.empty,pad+14,y+48);y+=86;}
 footers.forEach(r=>{draw(r,y,'#e8f3ef',true,'#12604e');y+=r.height;});ctx.font='20px Arial';ctx.fillStyle='#62746b';note.forEach((s,n)=>ctx.fillText(s,pad,y+38+n*27));return canvas;
}
function publicationFilename(model){return 'AMAO_'+model.key+'_'+model.period.start+'_al_'+model.period.end+'_pagina_'+String(model.index+1).padStart(2,'0')+'.png';}
async function downloadPublication(model){const blob=await holdTableImageBlob(createPublicationCanvas(model));downloadBlob(blob,publicationFilename(model));}
async function publicationImageAction(event,getModel,feedbackId,copy=false){
 const b=event.currentTarget;setBusy(b,true,copy?'Copiando tabla…':'Creando imagen…');
 try{const model=getModel();if(copy&&typeof navigator!=='undefined'&&navigator.clipboard?.write&&typeof ClipboardItem!=='undefined'){const blob=holdTableImageBlob(createPublicationCanvas(model));await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);$(feedbackId).textContent='Tabla copiada. Pégala en WhatsApp con Ctrl+V.';}else{await downloadPublication(model);$(feedbackId).textContent=copy?'El navegador no permite copiar imágenes. Se descargó la tabla para adjuntarla en WhatsApp.':'Tabla descargada en PNG. Ya puedes adjuntarla en WhatsApp.';}}
 catch(error){$(feedbackId).textContent='No se pudo preparar la imagen: '+error.message+'. Usa Descargar tabla si no puedes copiar.';}finally{setBusy(b,false);}
}
async function copyPublicationText(id,feedbackId){try{if(typeof navigator==='undefined'||!navigator.clipboard?.writeText)throw Error('Copia el texto manualmente.');await navigator.clipboard.writeText($(id).value);$(feedbackId).textContent='Texto copiado para WhatsApp.';}catch(error){$(feedbackId).textContent=error.message||'Selecciona y copia el texto manualmente.';}}
function changeReportWeek(kind,days){if(kind==='collections'){const p=currentWeeklyCollectionReport().period;weeklyCollectionAnchor=ArWeeklyReports.shift(p.start,days);renderWeeklyCollections();}else{const p=currentPromisePublication().period;promisePublicationAnchor=ArWeeklyReports.shift(p.start,days);promisePublicationPage=0;renderPromisePublication();}}
$('weeklyCollectionPrevious').addEventListener('click',()=>changeReportWeek('collections',-7));$('weeklyCollectionNext').addEventListener('click',()=>changeReportWeek('collections',7));$('weeklyCollectionCurrent').addEventListener('click',()=>{weeklyCollectionAnchor=null;renderWeeklyCollections();});
$('weeklyCollectionWeek').addEventListener('change',()=>{weeklyCollectionAnchor=$('weeklyCollectionWeek').value||null;renderWeeklyCollections();});
$('promiseSharePrevious').addEventListener('click',()=>changeReportWeek('promises',-7));$('promiseShareNext').addEventListener('click',()=>changeReportWeek('promises',7));$('promiseShareCurrent').addEventListener('click',()=>{promisePublicationAnchor=null;promisePublicationPage=0;renderPromisePublication();});
$('promiseShareWeek').addEventListener('change',()=>{promisePublicationAnchor=$('promiseShareWeek').value||null;promisePublicationPage=0;renderPromisePublication();});$('promiseShareStatus').addEventListener('change',()=>{promisePublicationStatus=$('promiseShareStatus').value;promisePublicationPage=0;renderPromisePublication();});$('promiseSharePage').addEventListener('change',()=>{promisePublicationPage=Number($('promiseSharePage').value)||0;renderPromisePublication();});
$('openPromisePublication').addEventListener('click',()=>{$('promisePublicationPanel').open=true;renderPromisePublication();$('promisePublicationPanel').scrollIntoView({behavior:'smooth',block:'start'});});
$('openWeeklyCollectionShare').addEventListener('click',()=>{$('weeklyCollectionSharePanel').open=true;renderWeeklyCollections();$('weeklyCollectionSharePanel').scrollIntoView({behavior:'smooth',block:'start'});});
$('downloadPromiseTableImage').addEventListener('click',e=>publicationImageAction(e,()=>promisePublicationModel(),'promiseShareFeedback'));$('copyPromiseTableImage').addEventListener('click',e=>publicationImageAction(e,()=>promisePublicationModel(),'promiseShareFeedback',true));
$('downloadWeeklyCollectionImage').addEventListener('click',e=>publicationImageAction(e,()=>weeklyCollectionModel(),'weeklyCollectionShareFeedback'));$('copyWeeklyCollectionImage').addEventListener('click',e=>publicationImageAction(e,()=>weeklyCollectionModel(),'weeklyCollectionShareFeedback',true));
$('copyPromiseTableText').addEventListener('click',()=>{renderPromisePublication();return copyPublicationText('promiseShareText','promiseShareFeedback');});$('copyWeeklyCollectionText').addEventListener('click',()=>{renderWeeklyCollections();return copyPublicationText('weeklyCollectionShareText','weeklyCollectionShareFeedback');});
$('exportWeeklyCollectionCSV').addEventListener('click',()=>{const r=currentWeeklyCollectionReport();downloadCSV('AMAO_Cobranza_'+r.period.start+'_al_'+r.period.end+'.csv',[['Fecha del ingreso','Cliente','Factura','Negocio','Moneda','Importe considerado','Tipo','Pago'],...r.movements.map(m=>[m.received_date,customerName(m.customer_id),m.invoice_number,m.business,m.currency,m.amount,m.source,m.id])]);});
$('exportPromisePublicationCSV').addEventListener('click',()=>{const r=currentPromisePublication();downloadCSV('AMAO_Promesas_'+r.period.start+'_al_'+r.period.end+'.csv',[['Cliente','Fecha compromiso','Factura','Moneda','Prometido','Recibido','Por cumplir','Estado'],...r.rows.map(p=>[p.name,p.scheduled_date,p.invoice?.invoice_number||'Acuerdo general',p.currency,p.amount,p.applied,p.remaining,promisePublicationLabel(p)])]);});
const renderAllBeforeWeeklyCollections=renderAll;renderAll=function(){renderAllBeforeWeeklyCollections();renderWeeklyCollections();};
const renderPromisesBeforePublication=renderPromises;renderPromises=function(){renderPromisesBeforePublication();renderPromisePublication();};
const goBeforeWeeklyReports=go;go=function(tab){goBeforeWeeklyReports(tab);if(tab==='overview')renderWeeklyCollections();if(tab==='promises')renderPromisePublication();};
