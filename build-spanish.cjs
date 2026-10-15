// Build-time translation only: the published app never sends text to a translator.
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const data = JSON.parse(html.match(/const DATA = (\[[\s\S]*?\n\]);/)[1]);
const extract = (name, end) => vm.runInNewContext(html.slice(html.indexOf('const '+name+' ='), html.indexOf(end, html.indexOf('const '+name+' ='))) + ';' + name);
const lines = vm.runInNewContext(html.slice(html.indexOf('const OPENINGS ='), html.indexOf('function renderQuickLines')) + ';({OPENINGS,CLOSINGS})');
const speeches = extract('FINAL_SPEECHES', 'const EXTENDERS');
vm.runInNewContext(html.slice(html.indexOf('FINAL_SPEECHES.push('), html.indexOf('function renderFinalSpeeches')), {FINAL_SPEECHES:speeches});
const extenders = extract('EXTENDERS', 'function renderExtenders');
const strings = [...new Set([...data.flatMap(e=>[e.category,e.topic,e.question,...e.keywords,...e.cleanSentences]),...lines.OPENINGS,...lines.CLOSINGS,...speeches.flatMap(s=>[s.title,...s.sentences]),...extenders])];
const translations = new Map();
let cursor = 0;
async function worker(){
 while(cursor<strings.length){
  const batch=[]; let size=0;
  while(cursor<strings.length && size<2400){const s=strings[cursor++];batch.push(s);size+=s.length;}
  const clean=s=>s.replace(/\b(adn|teh|wiht|wehn|taht|fro|thna)\b/g,w=>({adn:'and',teh:'the',wiht:'with',wehn:'when',taht:'that',fro:'for',thna:'than'}[w])).replace(/we'ren't/g,"we aren't").replace(/Miss Universe/g,'MissUniverseBrand').replace(/\s+/g,' ');
  let result;
  for(let attempt=0;attempt<4;attempt++){
   try {
    const url=new URL('https://translate.googleapis.com/translate_a/single');
    url.search=new URLSearchParams({client:'gtx',sl:'en',tl:'es',dt:'t',q:batch.map(clean).join('\n')});
    const response=await fetch(url); if(!response.ok)throw Error(response.status);
    const json=await response.json(); result=json[0].map(x=>x[0]).join('').split('\n').map(x=>x.trim());
    if(result.length!==batch.length)throw Error('Translation line mismatch');
    break;
   }catch(error){if(attempt===3)throw error;await new Promise(r=>setTimeout(r,1000*(attempt+1)));}
  }
  batch.forEach((s,i)=>translations.set(s,result[i].replace(/Miss\s*Universe\s*Brand/gi,'Miss Universe')));
 }
}
function plain(s){return s.replace(/[.¡!¿?;:—–]/g,'').replace(/,\s+y\b/g,' y').replace(/\s+/g,' ').trim();}
function humanize(sentences,id){
 const out=sentences.map(plain); let typoIndex=-1;
 for(let n=0;n<out.length;n++){const i=(id+n)%out.length;if(/\b(que|por|con|para|una|como|los|las|del|sus)\b/.test(out[i])){out[i]=out[i].replace(/\b(que|por|con|para|una|como|los|las|del|sus)\b/,w=>({que:'qeu',por:'pro',con:'cno',para:'paar',una:'uan',como:'cmoo',los:'lso',las:'lsa',del:'dle',sus:'ssu'}[w]));typoIndex=i;break;}}
 if(typoIndex<0)throw Error('No minor word for typo');
 const spaceIndex=(typoIndex+1)%out.length;
 const words=out[spaceIndex].split(' ');words[Math.floor(words.length/2)]+=' ';out[spaceIndex]=words.join(' ');
 return out;
}
(async()=>{
 await Promise.all(Array.from({length:4},worker));
 const tr=s=>{if(!translations.has(s))throw Error('Missing translation');return translations.get(s)};
 const es=require('./refine-spanish.cjs').refine(data.map(e=>({...e,category:tr(e.category),topic:tr(e.topic),question:tr(e.question),keywords:[...e.keywords,...e.keywords.map(tr)],cleanSentences:e.cleanSentences.map(s=>plain(tr(s))),sentences:humanize(e.cleanSentences.map(tr),e.id)})));
 let output=html.replace(/<html lang="en">/,'<html lang="es">').replace(/const DATA = \[[\s\S]*?\n\];/,'const DATA = [\n'+es.map(e=>JSON.stringify(e)).join(',\n')+'\n];');
 output=output.replace(/const OPENINGS = [\s\S]*?(?=function renderQuickLines)/,'const OPENINGS = '+JSON.stringify(lines.OPENINGS.map(tr))+';\nconst CLOSINGS = '+JSON.stringify(lines.CLOSINGS.map(tr))+';\n');
 output=output.replace(/const FINAL_SPEECHES = .*;/,'const FINAL_SPEECHES = '+JSON.stringify(speeches.map((s,i)=>({title:tr(s.title),sentences:humanize(s.sentences.map(tr),i)})))+';');
 output=output.replace(/FINAL_SPEECHES.push\([\s\S]*?(?=function renderFinalSpeeches)/,'');
 output=output.replace(/const EXTENDERS = [\s\S]*?(?=function renderExtenders)/,'const EXTENDERS = '+JSON.stringify(extenders.map(tr))+';\n');
 const ui=require('./spanish-ui.json');
 for(const [en,es] of Object.entries(ui).sort((a,b)=>b[0].length-a[0].length))output=output.split(en).join(es);
 const extras=require('./spanish-extras.json');
 extras.FINAL_SPEECHES=extras.FINAL_SPEECHES.map((s,i)=>({...s,sentences:require('./refine-spanish.cjs').humanize(s.sentences,i)}));
 for(const [key,value] of Object.entries(extras))output=output.replace(new RegExp('const '+key+' = .*;'),'const '+key+' = '+JSON.stringify(value)+';');
 process.stdout.write('*** Begin Patch\n*** Add File: '+process.cwd()+'/es.html\n'+output.split('\n').map(l=>'+'+l).join('\n')+'\n*** End Patch');
})().catch(e=>{console.error(e);process.exit(1)});
