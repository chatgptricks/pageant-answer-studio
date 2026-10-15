const {JSDOM}=require(process.env.JSDOM_PATH || 'jsdom');
const fs=require('fs');
const assert=require('node:assert/strict');
(async()=>{
for(const file of ['index.html','es.html']){
 const errors=[];let copied='';
 const dom=new JSDOM(fs.readFileSync(file,'utf8'),{runScripts:'dangerously',url:'https://example.test/'+file,beforeParse(w){w.scrollTo=()=>{};w.navigator.clipboard={writeText:async s=>{copied=s;}};w.addEventListener('error',e=>errors.push(e.message));}});
 const w=dom.window,d=w.document;w.eval(fs.readFileSync('app.js','utf8'));
 const data=w.eval('DATA');
 assert.equal(data.length,316);assert.equal(w.eval('questionBankItems.length'),158);
 assert.equal(w.eval('OPENINGS.length'),12);assert.equal(w.eval('CLOSINGS.length'),12);assert.equal(w.eval('FINAL_SPEECHES.length'),10);
 assert.equal(w.eval('state.copyAllCaps'),true);
 for(const e of data){
  assert.equal(data.filter(x=>x.topicId===e.topicId).length,2);
  assert.equal(e.sentences.length,3);
  assert(e.question.length>5);
  const changed=e.sentences.map((s,i)=>s.replace(/\s+/g,' ')!==e.cleanSentences[i].replace(/\s+/g,' '));
  assert.equal(changed.filter(Boolean).length,1,'typo '+e.id);
  const spaces=e.sentences.map(s=>s.includes('  '));assert.equal(spaces.filter(Boolean).length,1);
  assert(!spaces[changed.indexOf(true)],'separate typo and space '+e.id);
  assert(!e.sentences.some(s=>/[.—]/.test(s)||/,\s+(and|y)\b/.test(s)));
 }
 for(const topic of new Set(data.map(e=>e.topicId))){
  d.querySelector('[data-answers="'+topic+'"]').click();
  assert.equal(w.eval('state.ranked.length'),2);
  assert.equal(w.eval('state.ranked[0].topicId'),topic);
 }
 const search=d.getElementById('search');search.value=file==='es.html'?'guerra':'war';search.dispatchEvent(new w.Event('input'));
 assert.equal(w.eval('state.ranked[0].topicId'),66);
 await w.copyText(file==='es.html'?'Educación y confianza':'Education and confidence');
 assert.equal(copied,file==='es.html'?'EDUCACIÓN Y CONFIANZA':'EDUCATION AND CONFIDENCE');
 d.getElementById('copyAllCaps').checked=false;d.getElementById('copyAllCaps').dispatchEvent(new w.Event('change'));
 await w.copyText('Normal');assert.equal(copied,'Normal');
 for(const view of ['intro','answers','questions','speech','outro']){w.location.hash=view;w.dispatchEvent(new w.HashChangeEvent('hashchange'));assert.equal(d.body.dataset.view,view);}
 assert.equal(errors.length,0,errors.join('\n'));
 console.log(file,JSON.stringify({answers:data.length,questions:w.eval('questionBankItems.length'),maxSentenceWords:Math.max(...data.flatMap(e=>e.cleanSentences.map(s=>s.split(/\s+/).length))),maxQuestionWords:Math.max(...data.map(e=>e.question.split(/\s+/).length)),routeChecks:158,search:'PASS',clipboard:'PASS',views:'PASS'}));
 if(file==='es.html')console.log('SPANISH UI',d.body.textContent.replace(/\s+/g,' ').slice(0,2700));
 w.close();
}
})();
