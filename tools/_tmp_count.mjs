
import fs from 'fs';
const consts = fs.readFileSync('constants.ts','utf8');
const heroBlock = consts.slice(consts.indexOf('export const HEROES'));
const objs = [];
let depth=0, start=-1;
for (let i=0;i<heroBlock.length;i++){
  const c=heroBlock[i];
  if(c==='{'){ if(depth===0) start=i; depth++; }
  else if(c==='}'){ depth--; if(depth===0){ objs.push(heroBlock.slice(start,i+1)); } }
}
const pending = objs.filter(o=>/pending:\s*true/.test(o));
const skillNames = {};
for(const o of pending){
  const n=(o.match(/name:\s*'([^']+)'/)||[])[1];
  const ss=[...o.matchAll(/skillName:\s*'([^']+)'/g)].map(m=>m[1]);
  skillNames[n]=ss;
}
console.log('pending count', pending.length);
const cov = fs.readFileSync('src/game/skills/skillCoverage.test.ts','utf8');
const legacy = new Set([...cov.matchAll(/^\s*'([^']+)',/gm)].map(m=>m[1]));
const remaining=[];
for(const [h,ss] of Object.entries(skillNames)) for(const s of ss) if(legacy.has(h+'::'+s)) remaining.push(h+'::'+s);
console.log('LEGACY size', legacy.size);
console.log('REMAINING', remaining.length);
console.log(remaining.join('\n'));
