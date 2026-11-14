
import fs from 'fs';
const dir='src/game/skills';
const consts = fs.readFileSync('constants.ts','utf8');
const heroBlock = consts.slice(consts.indexOf('export const HEROES'));
const objs=[];let depth=0,start=-1;
for(let i=0;i<heroBlock.length;i++){const c=heroBlock[i];if(c==='{'){if(depth===0)start=i;depth++;}else if(c==='}'){depth--;if(depth===0)objs.push(heroBlock.slice(start,i+1));}}
const pending=objs.filter(o=>/pending:\s*true/.test(o));
const reg={};
for(const f of fs.readdirSync(dir)){
  if(!f.endsWith('.ts')||f.endsWith('.test.ts')||f==='index.ts')continue;
  const t=fs.readFileSync(dir+'/'+f,'utf8');
  for(const m of t.matchAll(/hero:\s*'([^']+)'[\s\S]{0,120}?skill:\s*'([^']+)'/g))(reg[m[1]]||=[]).push(m[2]);
}
let todo=0,total=0;
for(const o of pending){
  const h=(o.match(/name:\s*'([^']+)'/)||[])[1];
  const ss=(o.match(/skillName:\s*'([^']+)'/)||[])[1].split('/').map(s=>s.trim());
  const g=reg[h]||[];
  const parts=ss.map(s=>{const ok=g.includes(s);total++;if(!ok)todo++;return (ok?'[√]':'[ ]')+s;});
  console.log(h.padEnd(6,' '), parts.join(' '));
}
console.log('\nTODO', todo, '/ TOTAL', total);
