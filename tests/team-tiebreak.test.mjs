import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {calculate,emptyState} from '../tournament.js';
test('equal team points rank by total handicap pinfall in public and admin standings',()=>{
  const state=emptyState();
  state.teams=[0,1].map(i=>({id:'T'+i,name:'Team '+i,shift:1,bowlers:[0,1,2].map(j=>({name:'B'+i+j,gender:'Male',average:i?190:210,handicap:i?16:0}))}));
  state.games=[210,100].map((score,i)=>({number:i+1,matches:[{id:'M'+i,aId:'T0',bId:'T1',shift:1,completed:true,teamScoreA:score*3,teamScoreB:450,bowlers:[0,1,2].map(pos=>({pos,a:score,b:150}))}]}));
  const rows=calculate(state).teams;
  assert.deepEqual(rows.map(r=>[r.id,r.points,r.pinfall,r.netPinfall]),[['T1',10,900,996],['T0',10,930,930]]);
  const html=fs.readFileSync(new URL('../private/admin.html.txt',import.meta.url),'utf8');
  const source=html.slice(html.indexOf('function calculateTeamStandings('),html.indexOf('function calculatePlayerStandings('));
  const context={state,teamMap:()=>Object.fromEntries(state.teams.map(t=>[t.id,t])),playerOrder:t=>t.bowlers,teamTotals:t=>({hdcp:t.bowlers.reduce((n,b)=>n+b.handicap,0)})};vm.createContext(context);vm.runInContext(source,context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.calculateTeamStandings())),rows);
  assert.equal(context.calculateTeamStandings('all',1)[0].id,'T0','points remain primary');
  state.games.push({number:3,matches:[{id:'pending',aId:'T0',bId:'T1',completed:false,bowlers:[]}]});
  assert.deepEqual(calculate(state).teams,rows,'unplayed games do not add handicap');
});
