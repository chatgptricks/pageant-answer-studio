const fs = require('node:fs');
const overrides = new Map(fs.readFileSync(__dirname+'/spanish-refinements.txt','utf8').trim().split('\n').map(line => { const i=line.indexOf('|'); return [line.slice(0,i),line.slice(i+1)]; }));
function tidy(text) {
 return text.replace(/\banfitrión\b/g,'anfitriona').replace(/\blos nuevos concursantes\b/g,'las nuevas concursantes').replace(/\bClásicos del desfile\b/g,'Preguntas clásicas').replace(/\bdesfiles\b/g,'concursos').replace(/\bdesfile\b/g,'concurso').replace(/\bestoy orgulloso\b/gi,'estoy orgullosa').replace(/\bEstoy agradecido\b/g,'Estoy agradecida').replace(/\bestoy agradecido\b/g,'estoy agradecida').replace(/\bestoy dispuesto\b/gi,'estoy dispuesta').replace(/\bestoy listo\b/gi,'estoy lista').replace(/\bser elegido\b/g,'ser elegida').replace(/\bser juzgado\b/g,'ser juzgada').replace(/\bSoy Singapur\b/g,'Represento a Singapur');
}
function humanize(sentences,id) {
 const out=sentences.map(s=>s.replace(/[.¡!¿?;:—–]/g,'').replace(/,\s+y\b/g,' y').replace(/\s+/g,' ').trim());
 let index=-1;
 const swaps={que:'qeu',por:'pro',con:'cno',para:'paar',una:'uan',como:'cmoo',los:'lso',las:'lsa',del:'dle',sus:'ssu'};
 for(let n=0;n<out.length;n++){const i=(id+n)%out.length;if(/\b(que|por|con|para|una|como|los|las|del|sus)\b/.test(out[i])){out[i]=out[i].replace(/\b(que|por|con|para|una|como|los|las|del|sus)\b/,w=>swaps[w]);index=i;break;}}
 if(index<0)throw Error('Missing small word for typo');
 const j=(index+1)%out.length, words=out[j].split(' '); words[Math.floor(words.length/2)]+=' ';out[j]=words.join(' ');
 return out;
}
function refine(data){
 return data.map(e=>{
  let q=e.question;
  if(q.split(/\s+/).length>22 && q.includes('¿'))q=q.slice(q.indexOf('¿'));
  q=q.replace(/para usted/g,'para ti').replace(/\bsu opinión\b/g,'tu opinión').replace(/\busted\b/g,'tú');
  const clean=e.cleanSentences.map((s,i)=>tidy(overrides.get(e.id+':'+i)||s));
  return {...e,category:tidy(e.category),topic:tidy(e.topic),question:tidy(q),cleanSentences:clean,sentences:humanize(clean,e.id)};
 });
}
module.exports={refine,tidy,humanize};
