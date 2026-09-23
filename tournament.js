export const emptyState=()=>({settings:{satGames:4,sunGames:3},teams:[],games:[],started:false,currentGame:1});
function integer(n,min,max){return Number.isInteger(n)&&n>=min&&n<=max;}
function number(n,min,max){return typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;}
export function validateState(s){
  if(!s||!Array.isArray(s.teams)||s.teams.length>200||!Array.isArray(s.games)||s.games.length>30||!s.settings||s.settings.satGames!==4||s.settings.sunGames!==3)throw Error('Invalid tournament structure. Expected 4 Saturday and 3 Sunday games.');
  const ids=new Set();
  for(const team of s.teams){if(typeof team.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(team.id)||ids.has(team.id))throw Error('Invalid or duplicate team ID.');ids.add(team.id);if(![1,2,3].includes(Number(team.shift))||typeof team.name!=='string'||!team.name.trim()||team.name.length>150||!Array.isArray(team.bowlers)||team.bowlers.length!==3)throw Error('Invalid team.');let average=0;
    for(const b of team.bowlers){if(b.superSenior!==undefined&&typeof b.superSenior!=='boolean')throw Error('Invalid Super Senior selection.');if(typeof b.name!=='string'||!b.name.trim()||b.name.length>150||!number(b.average,0,300)||!['Male','Female','Male Senior','Female Senior'].includes(b.gender))throw Error('Invalid bowler.');const h=Math.min(b.gender==='Male'?35:40,Math.max(0,210-b.average));if(b.handicap!==h)throw Error('Bowler handicap does not match the tournament rule.');average+=b.average;}if(average>630)throw Error('Team average exceeds 630.');
  }
  const rounds=new Set();for(const g of s.games){if(!g)continue;if(!integer(g.number,1,30)||rounds.has(g.number)||!Array.isArray(g.matches)||g.matches.length>200)throw Error('Invalid game.');rounds.add(g.number);const played=new Set(),matches=new Set();for(const m of g.matches){if(typeof m.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(m.id)||matches.has(m.id)||!ids.has(m.aId)||!ids.has(m.bId)||m.aId===m.bId||played.has(m.aId)||played.has(m.bId))throw Error('Invalid or duplicate matchup.');matches.add(m.id);played.add(m.aId);played.add(m.bId);if(!Array.isArray(m.bowlers))throw Error('Invalid scores.');if(m.completed){if(m.bowlers.length!==3||new Set(m.bowlers.map(b=>b.pos)).size!==3||m.bowlers.some(b=>!integer(b.pos,0,2)||!integer(b.a,0,300)||!integer(b.b,0,300)))throw Error('Completed matches require three whole-number scores per team (0–300).');m.bowlers.sort((a,b)=>a.pos-b.pos);m.teamScoreA=m.bowlers.reduce((s,b)=>s+b.a,0);m.teamScoreB=m.bowlers.reduce((s,b)=>s+b.b,0);}}}
  if(s.calcutta){for(const sale of Object.values(s.calcutta.sales||{})){if(!sale||typeof sale.buyer!=='string'||sale.buyer.length>150||!number(sale.cost,0,1e9)||!number(sale.paid,0,sale.cost)||!['team','men','combined'].includes(sale.group))throw Error('Invalid Calcutta purchase.');}for(const p of Object.values(s.calcutta.purses||{})){if(!number(p.rate,0,100)||!Array.isArray(p.places)||!p.places.length||p.places.length>100||p.places.some(n=>!number(n,0,100))||p.places.reduce((a,b)=>a+b,0)>100.000001)throw Error('Calcutta allocations must total 100% or less.');}}
  // Reject prototype keys even in backup/import payloads.
  function walk(o,depth=0){if(depth>30)throw Error('Tournament nesting is too deep.');if(!o||typeof o!=='object')return;for(const k of Object.keys(o)){if(['__proto__','constructor','prototype'].includes(k))throw Error('Invalid object key.');walk(o[k],depth+1);}}walk(s);
}
export function calculate(state){
function teamMap() {
  const map = {};
  state.teams.forEach(t => map[t.id] = t);
  return map;
}

function playerOrder(team) {
  // Assuming bowlers are already stored in sorted order from registration
  return team.bowlers;
}


function calculateTeamStandings(dayFilter = 'all', upToGameNo = 999, shiftFilter = 'all'){
  const map=teamMap(), stats=state.teams.map(t=>({id:t.id,name:t.name,shift:t.shift||1,points:0,pinfall:0,highest:0,games:0}));
  const sm=Object.fromEntries(stats.map(s=>[s.id,s]));
  for(const g of state.games){
    if(!g) continue;
    if(g.number > upToGameNo) continue;
    if(dayFilter === 'sat' && g.number > state.settings.satGames) continue;
    if(dayFilter === 'sun' && g.number <= state.settings.satGames) continue;
    
    for(const m of g.matches){
      if(!m.completed)continue;
      const A=map[m.aId], B=map[m.bId], sa=sm[m.aId], sb=sm[m.bId];
      if(!sa || !sb) continue;
      const as=playerOrder(A), bs=playerOrder(B);
      let ap=0, bp=0;
      m.bowlers.forEach((o,pos)=>{
        const aa=o.a+(as[pos]?.handicap||0), bb=o.b+(bs[pos]?.handicap||0);
        if(aa>bb)ap+=2; else if(aa<bb)bp+=2; else {ap+=1;bp+=1;}
        sa.pinfall+=o.a; sb.pinfall+=o.b;
      });
      sa.highest=Math.max(sa.highest,m.teamScoreA); sb.highest=Math.max(sb.highest,m.teamScoreB);
      const ha=m.teamScoreA+teamTotals(A).hdcp, hb=m.teamScoreB+teamTotals(B).hdcp;
      if(ha>hb)ap+=4; else if(ha<hb)bp+=4; else {ap+=2;bp+=2;}
      sa.points+=ap; sb.points+=bp; sa.games++; sb.games++;
    }
  }
  let res = stats;
  if(shiftFilter !== 'all') res = res.filter(s => String(s.shift) === String(shiftFilter));
  return res.sort((a,b)=>b.points-a.points||b.pinfall-a.pinfall||b.highest-a.highest||a.name.localeCompare(b.name));
}

function calculatePlayerStandings(dayFilter = 'all', upToGameNo = 999) {
  const map=teamMap(), players=[];
  state.teams.forEach(t=>t.bowlers.forEach((b,index)=>players.push({
    id: t.id+'|'+index, teamId:t.id, bowlerIndex:index, name: b.name, team: t.name, gender: b.gender, handicap: b.handicap, average: b.average, points: 0, scratchPinfall: 0, netPinfall: 0, highScratch: 0, highNet: 0, games: 0, scratchGames: {}, netGames: {}
  })));
  const sm=Object.fromEntries(players.map(p=>[p.id,p]));
  for(const g of state.games) {
    if(!g) continue;
    if(g.number > upToGameNo) continue;
    if(dayFilter === 'sat' && g.number > state.settings.satGames) continue;
    if(dayFilter === 'sun' && g.number <= state.settings.satGames) continue;

    for(const m of g.matches){
      if(!m.completed)continue; const A=map[m.aId], B=map[m.bId];
      if(!A || !B) continue;
      const as=playerOrder(A), bs=playerOrder(B);
      m.bowlers.forEach((o,pos)=>{
        const bowlerA = as[pos], bowlerB = bs[pos];
        if(!bowlerA || !bowlerB) return;
        const pa=sm[m.aId+'|'+pos], pb=sm[m.bId+'|'+pos];
        if(pa){
          const netA = o.a + bowlerA.handicap;
          const netB = o.b + bowlerB.handicap;
          pa.points += netA>netB?2:netA===netB?1:0; pa.scratchPinfall += o.a; pa.netPinfall += netA;
          pa.highScratch = Math.max(pa.highScratch, o.a); pa.highNet = Math.max(pa.highNet, netA); pa.games++; pa.scratchGames[g.number] = o.a; pa.netGames[g.number] = netA;
        }
        if(pb){
          const netA = o.a + bowlerA.handicap;
          const netB = o.b + bowlerB.handicap;
          pb.points += netB>netA?2:netB===netA?1:0; pb.scratchPinfall += o.b; pb.netPinfall += netB;
          pb.highScratch = Math.max(pb.highScratch, o.b); pb.highNet = Math.max(pb.highNet, netB); pb.games++; pb.scratchGames[g.number] = o.b; pb.netGames[g.number] = netB;
        }
      });
    }
  }
  return players.sort((a,b)=>b.netPinfall - a.netPinfall || b.highNet - a.highNet || b.scratchPinfall - a.scratchPinfall || a.name.localeCompare(b.name));
}

function teamTotals(t){return t.bowlers.reduce((o,b)=>({avg:o.avg+b.average,hdcp:o.hdcp+b.handicap}),{avg:0,hdcp:0})}
return {teams:calculateTeamStandings('all',7),players:calculatePlayerStandings('all',7)};
}
function entry(e){if(!e)return null;const result={};for(const k of ['key','name','team','shift','seed','score','handicap','games','scratch','rank'])if(typeof e[k]==='string'||typeof e[k]==='number')result[k]=e[k];return result;}
function match(m){return {a:entry(m.a),b:entry(m.b),winner:typeof m.winner==='string'?m.winner:null,aScore:typeof m.aScore==='number'?m.aScore:null,bScore:typeof m.bScore==='number'?m.bScore:null};}
function publicFinals(state){const results={};const fingerprint=JSON.stringify({teams:state.teams,games:state.games.filter(g=>g&&g.number>=1&&g.number<=7).sort((a,b)=>a.number-b.number)});for(const type of ['overall','seniors','women','superSeniors','team']){const e=state.finals?.events?.[type];if(!e)continue;const out={stage:e.stage,outdated:e.source!==fingerprint,rulesVersion:e.rulesVersion===2?2:1,shiftCount:e.shiftCount===1?1:2};for(const field of ['pool','qualifiers','seeded','field','lastSix','lastThree','finalResults'])if(Array.isArray(e[field]))out[field]=e[field].map(entry);if(e.scores&&out.qualifiers)out.qualifiers=out.qualifiers.map(q=>({...q,eliminationScratch:typeof e.scores[q.key]==='number'?e.scores[q.key]:null}));if(out.lastThree)out.lastThree=out.lastThree.map(q=>({...q,finalScratch:typeof e.finalScores?.[q.key]==='number'?e.finalScores[q.key]:null}));if(e.ladder)out.ladder={seeds:e.ladder.seeds.map(entry),matches:e.ladder.matches.map(match)};if(e.champion)out.champion=entry(e.champion);for(const field of ['round10','round16','round8'])if(Array.isArray(e[field]))out[field]=e[field].map(match);results[type]=out;}return results;}
export function publicResults(state){
  const stats=calculate(state),byId=Object.fromEntries(state.teams.map(t=>[t.id,t]));
  return {teams:state.teams.map(t=>({id:t.id,name:t.name,shift:t.shift,bowlers:t.bowlers.map(b=>({name:b.name,gender:b.gender,average:b.average,handicap:b.handicap}))})),standings:stats,calcutta:publicCalcutta(state,stats),finals:publicFinals(state),games:state.games.filter(Boolean).map(g=>({number:g.number,day:g.day,matches:g.matches.filter(m=>byId[m.aId]&&byId[m.bId]).map(m=>({id:m.id,shift:m.shift,laneA:m.laneA,laneB:m.laneB,completed:!!m.completed,a:byId[m.aId].name,b:byId[m.bId].name,bowlers:[0,1,2].map(pos=>({a:byId[m.aId].bowlers[pos].name,b:byId[m.bId].bowlers[pos].name,aHandicap:byId[m.aId].bowlers[pos].handicap,bHandicap:byId[m.bId].bowlers[pos].handicap,aScore:m.completed?m.bowlers.find(b=>b.pos===pos)?.a:null,bScore:m.completed?m.bowlers.find(b=>b.pos===pos)?.b:null}))}))}))};
}

export function publicCalcutta(state,overall=calculate(state)){
  const sundayState={...state,games:state.games.filter(g=>g&&[5,6,7].includes(g.number))},sunday=calculate(sundayState);
  const perGame=[5,6,7].map(number=>calculate({...state,games:state.games.filter(g=>g?.number===number)}));
  const teams=Object.fromEntries(state.teams.map(t=>[t.id,t])),sales=state.calcutta?.sales||{},purses=state.calcutta?.purses||{};
  const rows=(stats,group)=>group==='team'?stats.teams.map(r=>({key:'team:'+r.id,name:r.name,shift:r.shift,score:r.pinfall+r.games*teams[r.id].bowlers.reduce((n,b)=>n+b.handicap,0),points:r.points,games:r.games})):stats.players.filter(p=>group==='men'?p.gender==='Male':p.gender!=='Male').map(p=>({key:'player:'+p.teamId+':'+(teams[p.teamId].bowlers[p.bowlerIndex].calcuttaId??p.bowlerIndex),name:p.name,team:p.team,shift:teams[p.teamId].shift,score:p.netPinfall,games:p.games}));
  return Object.fromEntries(['team','men','combined'].map(group=>{
    const auction=rows(overall,group).map((r,i)=>({name:r.name,team:r.team,shift:r.shift,rank:i+1,score:group==='team'?r.points:r.score,cost:typeof sales[r.key]?.cost==='number'?sales[r.key].cost:null}));
    const total=Object.values(sales).filter(s=>s.group===group).reduce((n,s)=>n+Math.round(Number(s.cost)*100),0)/100,cfg=purses[group],purse=cfg?Math.round(total*Number(cfg.rate))/100:0;
    const scores=rows(sunday,group).sort((a,b)=>b.score-a.score),games=perGame.map(s=>Object.fromEntries(rows(s,group).map(r=>[r.key,r.games?r.score:null]))),results=[];let allocated=0;
    for(let i=0;i<scores.length;){let end=i+1;while(end<scores.length&&scores[end].score===scores[i].score)end++;const percent=(cfg?.places||[]).slice(i,end).reduce((n,p)=>n+Number(p),0),prize=scores[i].games?Math.floor((Math.round(purse*100)*percent/100+1e-7)/(end-i))/100:0;
      for(let j=i;j<end;j++){const r=scores[j];results.push({name:r.name,team:r.team,rank:r.games?i+1:null,score:r.score,games:r.games,gameTotals:games.map(g=>g[r.key]??null),prize});allocated+=Math.round(prize*100);}i=end;
    }
    return [group,{auction,total,purse,configured:!!cfg,ready:scores.length>0&&scores.every(r=>r.games===3),rate:cfg?.rate??null,places:cfg?.places||[],unallocated:(Math.round(purse*100)-allocated)/100,results}];
  }));
}
