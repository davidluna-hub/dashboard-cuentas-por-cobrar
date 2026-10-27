const fs=require('fs'),assert=require('node:assert/strict');
const lib=require('../tools/dependency.cjs')('pdf-lib'),core=require('./core.js');
let source=fs.readFileSync(__dirname+'/pdf.js','utf8').replace(/^import[^\n]+\n/,'').replace('export async function statementPDF','return async function statementPDF');
const drawCalls=[];
const PDFDocument={...lib.PDFDocument,create:async()=>{const doc=await lib.PDFDocument.create(),add=doc.addPage.bind(doc);doc.addPage=(...args)=>{const page=add(...args),draw=page.drawText.bind(page);page.drawText=(text,options)=>{drawCalls.push({text,...options});return draw(text,options)};return page;};return doc;}};
const statementPDF=new Function('PDFDocument','StandardFonts','rgb',source)(PDFDocument,lib.StandardFonts,lib.rgb);
(async()=>{const logo=fs.readFileSync(__dirname+'/logo.js','utf8').match(/export const companyLogo=(.*);/)[1];for(const count of [8,25,200,754]){
drawCalls.length=0;const account=require('./statement-fixture.cjs')(count),bytes=await statementPDF(account,core,JSON.parse(logo)),pdf=await lib.PDFDocument.load(bytes);
if(count===8)assert.equal(pdf.getPageCount(),1,'Typical account fits one page');for(const i of account.open)assert.equal(drawCalls.filter(c=>c.text.includes(i.invoice_number)).length,i.id==='i0'?2:1,i.invoice_number+' must appear once in invoices, plus its active commitment');
const content=drawCalls.map(c=>c.text).join('\n');assert.doesNotMatch(content,/LIQUIDADA-EXCLUIR|CANCELADA-EXCLUIR|Al corriente/);for(const label of ['tesoreria@example.com','(656) 555-0100','Plazo 30 días','Posición neta','Último abono','26/10/2026','CLABE:','Resumen de pagos y abonos','7 días vencidos','Falta 1 día','Vence hoy','Faltan 8 días'])assert.ok(content.includes(label),label+' missing');
assert(drawCalls.filter(c=>c.text.includes('INV/2026/')).every(c=>c.y>=29),'Invoice rows overlap footer');assert(drawCalls.every(c=>c.size>=6.5),'Text was shrunk below a readable size');assert(drawCalls.every(c=>c.y>=10&&c.y<=595));assert(drawCalls.every(c=>c.x>=24&&c.x<=818));
const notes=drawCalls.filter(c=>c.text==='Promesa de pago:');assert.equal(notes.length,1,'Only the linked invoice has a note');assert.equal(notes[0].size,6.5,'Promise note must be smaller than invoice status');assert.ok(drawCalls.some(c=>c.text==='26/10/2026'&&c.size===6.5&&c.x===notes[0].x&&c.y<notes[0].y),'Date follows the note in the same status cell');
if(count===8||count===25)fs.writeFileSync(__dirname+'/statement-restored-'+count+'.pdf',bytes);
console.log('PASS: restored PDF, '+count+' pending invoices, '+pdf.getPageCount()+' page(s), complete details and readable type.');
}})().catch(e=>{console.error(e);process.exit(1)});
