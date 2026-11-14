
import fs from 'fs';
const consts = fs.readFileSync('constants.ts','utf8');
const heroBlock = consts.slice(consts.indexOf('export const HEROES'));
const objs = []; let depth=0,start=-1;
for (let i=0;i<heroBlock.length;i++){const c=heroBlock[i];if(c==='{'){if(depth===0)start=i;depth++;}else if(c==='}'){depth--;if(depth===0)objs.push(heroBlock.slice(start,i+1));}}
const pending = objs.filter(o=>/pending:\s*true/.test(o));
const skip = new Set(['name','skillName','skillDesc','title','faction','pack','avatar','portrait']);
// gather registered skill tokens from all skill source files
const dir='src/game/skills';
let src='';
for(const f of fs.readdirSync(dir)) if(f.endsWith('.ts') && !f.endsWith('.test.ts') && f!=='index.ts') src += fs.readFileSync(dir+'/'+f,'utf8');
const reg = new Set([...src.matchAll(/skill:\s*'([^']+)'/g)].map(m=>m[1]));
const heroesReg = {};
for (const f of fs.readdirSync(dir)) {
  if(!f.endsWith('.ts')||f.endsWith('.test.ts')||f==='index.ts') continue;
  const t=fs.readFileSync(dir+'/'+f,'utf8');
  for(const m of t.matchAll(/hero:\s*'([^']+)'[\s\S]{0,80}?skill:\s*'([^']+)'/g)) {
    (heroesReg[m[1]] ||= []).push(m[2]);
  }
}
const out=[];
for(const o of pending){
  const h=(o.match(/name:\s*'([^']+)'/)||[])[1];
  const ss=(o.match(/skillName:\s*'([^']+)'/)||[])[1].split('/').map(s=>s.trim());
  const got = heroesReg[h]||[];
  const missing = ss.filter(s=>!got.includes(s));
  out.push(h+' | declared: '+ss.join(',')+' | registered: '+(got.join(',')||'(none)')+(missing.length?' <<MISSING '+missing.join(',')+'>>':''));
}
console.log(out.join('\n'));
const tot = out.reduce((a,l)=>a+(l.includes('MISSING')?1:0),0);
console.log('\nheroes with missing skills:', tot, '/', out.length);
