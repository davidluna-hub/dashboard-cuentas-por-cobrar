const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
let html=fs.readFileSync(path.join(root,'app/template.html'),'utf8').replace(/\r\n/g,'\n');
html=html.replace(/\/\* @include ([^*]+) \*\/|<!-- @include ([^>]+) -->/g,(_,a,b)=>fs.readFileSync(path.join(root,(a||b).trim()),'utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n'));
if(html.includes('@include'))throw Error('Unresolved module');
fs.writeFileSync(path.join(root,'index.html'),html);console.log('Built index.html: '+Buffer.byteLength(html)+' bytes');
