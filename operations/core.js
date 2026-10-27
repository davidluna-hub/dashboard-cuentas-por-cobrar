(function(root){
'use strict';
const billing=root.ArBillingCore||(typeof require==='function'?require('../automatic-emails/core.js'):null),weekly=root.ArWeeklyReports||(typeof require==='function'?require('../weekly-reports-core.js'):null);
const cents=billing.cents,amount=billing.amount,escape=billing.escape;
function quality(data){
 const issues=[],byId=new Map(data.invoices.map(i=>[i.id,i])),seen=new Set();
 const add=(kind,customer_id,record_id,message,action)=>issues.push({kind,customer_id,record_id,message,action});
 for(const i of data.invoices){const key=i.customer_id+'|'+String(i.invoice_number).trim().toUpperCase();if(seen.has(key))add('Duplicado',i.customer_id,i.id,'Folio repetido: '+i.invoice_number,'invoice');seen.add(key);if(!i.due_date||i.due_date<i.invoice_date)add('Fechas',i.customer_id,i.id,i.invoice_number+': revisa emisión y vencimiento','invoice');if(!['MXN','USD'].includes(i.currency)||Number(i.total)<0)add('Importe / moneda',i.customer_id,i.id,i.invoice_number+': importe o moneda inválidos','invoice');}
 for(const c of data.customers)if(!billing.recipients(c).length)add('Contacto',c.id,c.id,'Sin correo válido para avisos','customer');
 for(const p of [...new Map([...(data.payments||[]),...(data.localPayments||[])].map(x=>[x.id,x])).values()]){const i=byId.get(p.invoice_id);if(!i||p.currency&&p.currency!==i.currency)add('Aplicación',i?.customer_id,p.id,'Aplicación sin factura o con moneda distinta','payment');}
 return issues;
}
function collections(data,start,end){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end||billing.days(end,start)>370)throw Error('Selecciona un periodo válido de hasta 12 meses.');
 const moves=[];for(let d=weekly.week(start).start;d<=end;d=weekly.shift(d,7))moves.push(...weekly.weeklyCollections(data,d).movements.filter(m=>m.received_date>=start&&m.received_date<=end));
 return {movements:moves,rows:['Cartón','Foam','Otro','Anticipos sin aplicar','Sin clasificar'].map(b=>({business:b,MXN:amount(moves.filter(m=>m.business===b&&m.currency==='MXN').reduce((n,m)=>n+cents(m.amount),0)),USD:amount(moves.filter(m=>m.business===b&&m.currency==='USD').reduce((n,m)=>n+cents(m.amount),0))})).filter(r=>['Cartón','Foam'].includes(r.business)||r.MXN||r.USD)};
}
function xlsx(headers,rows,sheet='Reporte'){
 const enc=new TextEncoder(),xml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,''),col=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
 const all=[headers,...rows],sheetXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols>'+headers.map((_,n)=>'<col min="'+(n+1)+'" max="'+(n+1)+'" width="24" customWidth="1"/>').join('')+'</cols><sheetData>'+all.map((r,n)=>'<row r="'+(n+1)+'">'+r.map((v,k)=>{const ref=col(k)+(n+1);return typeof v==='number'&&Number.isFinite(v)?'<c r="'+ref+'" s="2"><v>'+v+'</v></c>':'<c r="'+ref+'" s="'+(n?0:1)+'" t="inlineStr"><is><t xml:space="preserve">'+xml(v)+'</t></is></c>';}).join('')+'</row>').join('')+'</sheetData><autoFilter ref="A1:'+col(headers.length-1)+all.length+'"/></worksheet>';
 const files={
 '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="'+xml(sheet.slice(0,31).replace(/[\[\]:*?\/\\]/g,'_'))+'" sheetId="1" r:id="rId1"/></sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
 'xl/styles.xml':'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF17634F"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
 'xl/worksheets/sheet1.xml':sheetXml};
 const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;},parts=[],central=[],u16=n=>[n&255,(n>>>8)&255],u32=n=>[...u16(n),...u16(n>>>16)];let offset=0;
 for(const [name,content]of Object.entries(files)){const n=enc.encode(name),b=enc.encode(content),c=crc(b),h=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0x800),...u16(0),...u16(0),...u16(33),...u32(c),...u32(b.length),...u32(b.length),...u16(n.length),...u16(0),...n]);parts.push(h,b);central.push(new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x800),...u16(0),...u16(0),...u16(33),...u32(c),...u32(b.length),...u32(b.length),...u16(n.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...n]));offset+=h.length+b.length;}
 const size=central.reduce((n,b)=>n+b.length,0);parts.push(...central,new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(central.length),...u16(central.length),...u32(size),...u32(offset),...u16(0)]));const out=new Uint8Array(parts.reduce((n,b)=>n+b.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;
}
function mergeWorkspaces(base,local,remote,choices={}){
 const conflicts=[],equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x)),object=x=>x&&typeof x==='object'&&!Array.isArray(x),key=x=>x?.id||x?.customer_id;
 function merge(b,l,r,path){
  if(equal(l,r))return clone(l);if(equal(l,b))return clone(r);if(equal(r,b))return clone(l);
  if(Array.isArray(l)&&Array.isArray(r)&&(!b||Array.isArray(b))&&[...l,...r,...(b||[])].every(x=>key(x))){const bm=new Map((b||[]).map(x=>[key(x),x])),lm=new Map(l.map(x=>[key(x),x])),rm=new Map(r.map(x=>[key(x),x])),ids=[...new Set([...rm.keys(),...lm.keys(),...bm.keys()])];return ids.map(id=>merge(bm.get(id),lm.get(id),rm.get(id),path.concat(id))).filter(x=>x!==undefined);}
  if(object(l)&&object(r)&&(b===undefined||object(b))){const out={};for(const k of new Set([...Object.keys(b||{}),...Object.keys(l),...Object.keys(r)])){const v=merge(b?.[k],l[k],r[k],path.concat(k));if(v!==undefined)out[k]=v;}return out;}
  const id=JSON.stringify(path);conflicts.push({id,path,base:clone(b),local:clone(l),remote:clone(r)});return clone(choices[id]==='local'?l:r);
 }
 return {payload:merge(base,local,remote,[]),conflicts};
}

const api={quality,collections,xlsx,mergeWorkspaces};root.ArOpsCore=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
