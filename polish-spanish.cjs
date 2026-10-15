const fs=require('fs');
const html=fs.readFileSync('es.html','utf8');
const match=html.match(/const DATA = (\[[\s\S]*?\n\]);/);
const before=JSON.parse(match[1]);
const after=require('./refine-spanish.cjs').refine(before);
const start=Number(process.argv[2]||0);
let patch='*** Begin Patch\n*** Update File: '+process.cwd()+'/es.html\n';
for(let i=start;i<Math.min(start+32,before.length);i++){
 const suffix=i===before.length-1?'':',';
 const a=JSON.stringify(before[i])+suffix,b=JSON.stringify(after[i])+suffix;
 if(a!==b)patch+='@@\n-'+a+'\n+'+b+'\n';
}
process.stdout.write(patch+'*** End Patch');
