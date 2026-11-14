
import fs from 'fs';
const cov = fs.readFileSync('src/game/skills/skillCoverage.test.ts','utf8');
console.log('has 妆戎 entry:', cov.includes("'吕玲绮::妆戎'"));
const legacy = new Set([...cov.matchAll(/^\s*'([^']+)',/gm)].map(m=>m[1]));
console.log('legacy size', legacy.size, 'has妆戎', legacy.has('吕玲绮::妆戎'));
console.log('sample', [...legacy].slice(0,5));
