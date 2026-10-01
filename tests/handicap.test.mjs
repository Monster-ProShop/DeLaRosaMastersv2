import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {bowlerHandicap,applyHandicapRule,validateState,publicResults,emptyState} from '../tournament.js';
import {createHandler} from '../server.js';
test('80% handicap rounds arithmetically and caps all men at 35 and women at 40',()=>{
 for(const gender of ['Male','Male Senior','Female','Female Senior']){assert.equal(bowlerHandicap(190,gender),16);assert.equal(bowlerHandicap(188,gender),18);assert.equal(bowlerHandicap(189,gender),17);assert.equal(bowlerHandicap(210,gender),0);assert.equal(bowlerHandicap(250,gender),0);assert.equal(bowlerHandicap(0,gender),gender.startsWith('Female')?40:35);}
 assert.equal(bowlerHandicap(186.875,'Male'),19);
 const source=fs.readFileSync(new URL('../private/admin.html.txt',import.meta.url),'utf8');const fn=source.slice(source.indexOf('function handicap('),source.indexOf('function registrationGender('));const c={};vm.createContext(c);vm.runInContext(fn,c);for(let avg=0;avg<=300;avg+=0.25)for(const gender of ['Male','Female','Male Senior','Female Senior'])assert.equal(c.handicap(avg,gender),bowlerHandicap(avg,gender));
});
test('existing records recalculate without losing scratch scores, categories or stored finals',async()=>{
 const s=emptyState();s.teams=[0,1].map(i=>({id:'T'+i,name:'Team'+i,shift:1,bowlers:[{name:'Man',average:190,gender:'Male Senior',handicap:20,superSenior:true},{name:'Woman',average:160,gender:'Female Senior',handicap:40,superSenior:true},{name:'Other',average:188,gender:'Male',handicap:22}]}));s.games=[{number:1,matches:[{id:'M',aId:'T0',bId:'T1',bowlers:[0,1,2].map(pos=>({pos,a:200,b:180})),teamScoreA:600,teamScoreB:540,completed:true}]}];s.finals={events:{overall:{stage:'complete',source:JSON.stringify({teams:s.teams,games:s.games}),champion:{key:'T0|0',name:'Man',handicap:20}}}};
 const normalized=applyHandicapRule(s);validateState(normalized);assert.deepEqual(normalized.teams[0].bowlers.map(b=>b.handicap),[16,40,18]);assert.deepEqual(s.games,normalized.games);assert.equal(s.teams[0].bowlers[0].handicap,20);assert.deepEqual(normalized.finals,s.finals);assert(publicResults(normalized).finals.overall.outdated);
 const handler=createHandler({},async()=>Response.json([{state:s,revision:5}]));const r=await handler(new Request('https://app.test/api/results'),{SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test',TOURNAMENT_ID:'test'});assert.equal(r.status,200);const result=await r.json();assert.equal(result.standings.players.find(p=>p.id==='T0|0').netPinfall,216);assert.equal(result.revision,5);
});
