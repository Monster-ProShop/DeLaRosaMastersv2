'use strict';
Object.assign(tDict,{'Finals':'Finales','Tournament center':'Centro del torneo','Go to section':'Ir a sección','Resolve legacy shift 3 before continuing.':'Resuelve los datos del turno 3 antes de continuar.'});
const L=(en,es)=>currentLang==='es'?es:en;
const finalsDrafts=new Map(),finalsEditing=new Set();
let finalsView='overall',finalsMessage='';
const finalTypes={overall:{en:'Individual Overall',es:'Individual General',qualify:10,advance:5},seniors:{en:'Seniors Final',es:'Final Seniors',qualify:10,advance:5},women:{en:"Women’s Final",es:'Final Femenil',qualify:6,advance:3},team:{en:'Team Finals',es:'Finales por Equipos'}};
const finalName=type=>L(finalTypes[type].en,finalTypes[type].es);
const sectionItems=[['game','Matches',false],['teamlist','Registered Teams',false],['standings','Standings',false],['finals','Finals',false],['registration','Team Registration',true],['setup','Tournament Setup',true],['calcutta','Calcutta',true],['calcuttaPayout','Calcutta Payout',true],['export','Export Data (XLS)',true]];
function syncNavigation(){
  const menu=document.getElementById('sectionSelect');if(!menu)return;
  let active=document.querySelector('.panel.active')?.id||'game';
  if(!sectionItems.some(([id,,admin])=>id===active&&(!admin||isAdmin))){active='game';document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===active));}
  menu.innerHTML=sectionItems.filter(([, ,admin])=>!admin||isAdmin).map(([id,label])=>`<option value="${id}">${esc(t(label))}</option>`).join('');menu.value=active;
  document.getElementById('sectionTitle').textContent=t(sectionItems.find(([id])=>id===active)[1]);
  renderLegacyShift();
}
function hasLegacyShift(){return state.teams.some(tm=>Number(tm.shift)===3)||state.games.some(g=>g?.matches?.some(m=>Number(m.shift)===3));}
function renderLegacyShift(){
  const el=document.getElementById('legacyShiftControl');if(!el)return;
  el.innerHTML=!isAdmin||!hasLegacyShift()?'':`<div class="card final-card"><h3>${L('Move legacy shift 3','Mover turno 3 anterior')}</h3><p>${L('This tournament now uses two shifts. Move existing shift 3 teams and matches to one of them. Scores are preserved.','Este torneo ahora usa dos turnos. Mueve los equipos y partidas del turno 3 a uno de ellos. Se conservan los puntajes.')}</p><label for="legacyShiftTarget">${L('Destination shift','Turno de destino')}</label><select id="legacyShiftTarget"><option value="1">${t('Shift')} 1</option><option value="2">${t('Shift')} 2</option></select><button onclick="migrateLegacyShift()">${L('Move shift 3 data','Mover datos del turno 3')}</button></div>`;
}
async function migrateLegacyShift(){
  if(!isAdmin)return;const destination=Number(document.getElementById('legacyShiftTarget').value);if(![1,2].includes(destination))return;
  if(!confirm(L('Move all shift 3 teams and matches to shift '+destination+'? Existing finals will need regeneration.','¿Mover todos los equipos y partidas del turno 3 al turno '+destination+'? Será necesario regenerar las finales existentes.')))return;
  state.teams.forEach(tm=>{if(Number(tm.shift)===3)tm.shift=destination;});state.games.forEach(g=>g?.matches?.forEach(m=>{if(Number(m.shift)===3)m.shift=destination;}));await save();renderAll();
}
function finalFingerprint(){return JSON.stringify({teams:state.teams,games:state.games.filter(g=>g&&g.number>=1&&g.number<=7).sort((a,b)=>a.number-b.number)});}
function finalReadiness(){
  if(!state.teams.length)return {ready:false,done:0,total:0};
  let done=0;const ids=new Set(state.teams.map(tm=>tm.id));
  for(const tm of state.teams){for(let round=1;round<=7;round++){
    const games=state.games.filter(g=>g?.number===round);if(games.length!==1)continue;
    const matches=games[0].matches.filter(m=>m.aId===tm.id||m.bId===tm.id);
    if(matches.length!==1)continue;const m=matches[0];
    if(m.aId===m.bId||!ids.has(m.aId)||!ids.has(m.bId)||!m.completed||m.bowlers?.length!==3)continue;
    if(new Set(m.bowlers.map(b=>b.pos)).size!==3||m.bowlers.some(b=>![0,1,2].includes(b.pos)||![b.a,b.b].every(s=>Number.isInteger(s)&&s>=0&&s<=300)))continue;
    done++;
  }}
  return {ready:done===state.teams.length*7&&!hasLegacyShift(),done,total:state.teams.length*7};
}
function finalEvent(type){return state.finals?.events?.[type];}
function finalStale(event){return event&&event.source!==finalFingerprint();}
function finalCanWrite(type){if(!isAdmin)return false;if(!finalReadiness().ready||finalStale(finalEvent(type))){finalAlert(L('Complete regular play and regenerate stale finals before saving.','Completa las partidas regulares y regenera las finales desactualizadas antes de guardar.'));return false;}return true;}
function finalAlert(message){finalsMessage=message;const el=document.getElementById('finalMessage');if(el)el.textContent=message;}
async function finalPersist(prefixes=[]){const saved=await save();if(saved){for(const key of finalsDrafts.keys())if(prefixes.some(p=>key.startsWith(p)))finalsDrafts.delete(key);for(const key of finalsEditing)if(prefixes.some(p=>key.startsWith(p)))finalsEditing.delete(key);finalsMessage=L('Saved. Public results updated.','Guardado. Resultados públicos actualizados.');renderFinals();}return saved;}
function finalIndividuals(type){return calculatePlayerStandings('all',7).filter(p=>type==='overall'||(type==='seniors'?['Male Senior','Female Senior'].includes(p.gender):['Female','Female Senior'].includes(p.gender))).map(p=>({key:p.id,name:p.name,team:p.team,handicap:p.handicap,score:p.netPinfall,games:p.games})).sort((a,b)=>b.score-a.score);}
// Cutoff ties require the rollout decision. Seeding ties also require an explicit order.
function finalRankPlan(rows,limit,allTies=false){
  const sorted=[...rows].sort((a,b)=>b.score-a.score),slots=[];
  for(let i=0;i<Math.min(sorted.length,limit);){let end=i+1;while(end<sorted.length&&sorted[end].score===sorted[i].score)end++;
    const group=sorted.slice(i,end),last=Math.min(end,limit),resolve=group.length>1&&(allTies||end>limit);
    for(let j=i;j<last;j++)slots.push({rank:j+1,entry:resolve?null:sorted[j],options:resolve?group:[],score:sorted[i].score});i=end;
  }return slots;
}
function finalSelected(slots,picks){const used=new Set(),selected=[];for(const slot of slots){const entry=slot.entry||slot.options.find(e=>e.key===picks[slot.rank]);if(!entry||used.has(entry.key))return null;used.add(entry.key);selected.push({...entry,seed:slot.rank});}return selected;}
function finalPickUI(slots,prefix){
  const tied=slots.filter(s=>!s.entry);if(!tied.length)return '';
  return `<div class="final-tie"><strong>${L('Rollout / tie decision required','Se requiere decisión de desempate')}</strong><p class="final-caption">${L('Record the rollout result by selecting who advances. For tied ladder or bracket seeds, select their decided order. Each name can be selected once.','Registra el resultado del desempate seleccionando quién avanza. Para siembras empatadas, selecciona el orden decidido. Cada nombre puede elegirse una sola vez.')}</p>`+tied.map(s=>`<label for="${prefix}-${s.rank}">${L('Place','Lugar')} ${s.rank} · ${s.score}</label><select id="${prefix}-${s.rank}" data-final-draft="${prefix}-${s.rank}" required><option value="">${L('Select rollout winner / seed','Selecciona ganador / siembra')}</option>${s.options.map(e=>`<option value="${esc(e.key)}">${esc(e.name)}${e.team?' — '+esc(e.team):''}</option>`).join('')}</select>`).join('')+'</div>';
}
function finalReadPicks(slots,prefix){return Object.fromEntries(slots.filter(s=>!s.entry).map(s=>[s.rank,document.getElementById(prefix+'-'+s.rank)?.value]));}
function finalTable(rows,columns){return `<div class="final-table"><table><thead><tr>${columns.map(c=>`<th>${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.map((r,i)=>`<tr>${columns.map(c=>`<td>${c[1](r,i)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
function finalNames(rows){return finalTable(rows,[[L('Seed','Siembra'),(r,i)=>r.seed||i+1],[L('Name','Nombre'),r=>esc(r.name)],[L('Team','Equipo'),r=>esc(r.team||'—')],[L('Handicap','Hándicap'),r=>r.handicap??'—'],[L('7-game total + HDCP','Total 7 juegos + HDCP'),r=>r.score]]);}
async function generateFinal(type){
  if(!isAdmin||!finalReadiness().ready)return;
  const existing=finalEvent(type);if(existing&&!confirm(L('Regenerate this final? Its existing scores and advancement decisions will be removed.','¿Regenerar esta final? Se eliminarán sus puntajes y decisiones de avance.')))return;
  let event;
  if(type==='team'){
    const rows=calculateTeamStandings('all',7,'all').map(r=>({key:r.id,name:r.name,shift:r.shift,score:r.points}));
    const seeds=[1,2].map(shift=>rows.find(r=>Number(r.shift)===shift));
    if(seeds.some(r=>!r)||rows.length<18){finalAlert(L('Team finals need at least 18 teams and a first-place team in each of shifts 1 and 2.','Las finales requieren al menos 18 equipos y un primer lugar en cada turno (1 y 2).'));return;}
    const field=rows.filter(r=>!seeds.some(s=>s.key===r.key)).slice(0,16).map((r,i)=>({...r,seed:i+1}));
    event={source:finalFingerprint(),createdAt:new Date().toISOString(),seeded:seeds,field,round16:finalPairs(field),round8:null,stage:'round16'};
  }else{
    const rows=finalIndividuals(type),spec=finalTypes[type];
    if(rows.length<spec.qualify){finalAlert(L('This event requires at least '+spec.qualify+' eligible bowlers.','Este evento requiere al menos '+spec.qualify+' jugadores elegibles.'));return;}
    const slots=finalRankPlan(rows,spec.qualify),qualifiers=finalSelected(slots,{});
    event={source:finalFingerprint(),createdAt:new Date().toISOString(),pool:rows,qualifiers,scores:null,stage:qualifiers?'elimination':'qualification'};
  }
  state.finals||={version:1,events:{}};state.finals.events||={};state.finals.events[type]=event;await finalPersist(type==='team'?['baker-']:['qual-'+type,'elim-'+type,'ladder-'+type,'step-'+type]);
}
async function confirmFinalQualifiers(type){
  if(!finalCanWrite(type))return;const ev=finalEvent(type),slots=finalRankPlan(ev.pool,finalTypes[type].qualify),picks=finalReadPicks(slots,'qual-'+type),selected=finalSelected(slots,picks);
  if(!selected){finalAlert(L('Select a different eligible bowler for every rollout place.','Selecciona un jugador elegible diferente para cada lugar de desempate.'));return;}
  ev.qualifiers=selected;ev.qualificationPicks=picks;ev.stage='elimination';await finalPersist(['qual-'+type]);
}
function eliminationRows(ev){return ev.qualifiers.map(q=>({...q,scratch:ev.scores?.[q.key],score:ev.scores?.[q.key]===undefined?0:ev.scores[q.key]+q.handicap})).sort((a,b)=>b.score-a.score);}
async function saveFinalElimination(type){
  if(!finalCanWrite(type))return;const ev=finalEvent(type),scores={};
  for(let i=0;i<ev.qualifiers.length;i++){const text=document.getElementById('elim-'+type+'-'+i)?.value,n=Number(text);if(text===''||!Number.isInteger(n)||n<0||n>300){finalAlert(L('Enter every scratch score as a whole number from 0 to 300.','Introduce cada puntaje scratch como entero entre 0 y 300.'));return;}scores[ev.qualifiers[i].key]=n;}
  if(ev.ladder&&!confirm(L('Changing elimination scores resets this stepladder and its results. Continue?','Cambiar los puntajes de eliminación reinicia esta escalera y sus resultados. ¿Continuar?')))return;
  ev.scores=scores;delete ev.ladder;delete ev.champion;ev.stage='eliminationSaved';await finalPersist(['elim-'+type,'ladder-'+type,'step-'+type]);
}
async function buildFinalLadder(type){
  if(!finalCanWrite(type))return;const ev=finalEvent(type);if(!ev.scores)return;
  const slots=finalRankPlan(eliminationRows(ev),finalTypes[type].advance,true),picks=finalReadPicks(slots,'ladder-'+type),seeds=finalSelected(slots,picks);
  if(!seeds){finalAlert(L('Resolve all tied advancement and seed positions first.','Resuelve primero todos los empates de avance y siembra.'));return;}
  ev.ladder={seeds,picks,matches:[{a:seeds[seeds.length-1],b:seeds[seeds.length-2]}]};ev.stage='ladder';await finalPersist(['ladder-'+type]);
}
function finalMatchInputs(match,prefix,individual){
  const editable=isAdmin&&(!match.winner||finalsEditing.has(prefix));
  const row=(entry,side)=>`<div class="final-entrant"><strong>#${entry.seed||'—'} ${esc(entry.name)}${individual?`<br><small class="muted">HDCP ${entry.handicap}</small>`:''}</strong>${editable?`<input id="${prefix}-${side}" data-final-draft="${prefix}-${side}" type="number" min="0" max="300" step="1" inputmode="numeric" aria-label="${L('Scratch score','Puntaje scratch')} — ${esc(entry.name)}" value="${match[side+'Score']??''}">`:`<span>${match[side+'Score']===undefined?'—':match[side+'Score']+(individual?entry.handicap:0)}</span>`}</div>`;
  return row(match.a,'a')+row(match.b,'b')+(editable?`<label for="${prefix}-winner">${L('Winner (select for a tie or when recording winner only)','Ganador (selecciona en empate o para registrar solo ganador)')}</label><select id="${prefix}-winner" data-final-draft="${prefix}-winner"><option value="">${L('Determine from scores','Determinar por puntajes')}</option><option value="${esc(match.a.key)}" ${match.winner===match.a.key?'selected':''}>${esc(match.a.name)}</option><option value="${esc(match.b.key)}" ${match.winner===match.b.key?'selected':''}>${esc(match.b.name)}</option></select>`:'')+(match.winner?`<p class="final-winner">${L('Winner','Ganador')}: ${esc((match.winner===match.a.key?match.a:match.b).name)}</p>`:'');
}
function readFinalMatch(match,prefix,individual,requiredScores){
  const aText=document.getElementById(prefix+'-a').value,bText=document.getElementById(prefix+'-b').value,winner=document.getElementById(prefix+'-winner').value;
  if(aText===''&&bText===''&&!requiredScores){if(![match.a.key,match.b.key].includes(winner))throw Error(L('Select the winner.','Selecciona al ganador.'));return {winner};}
  const a=Number(aText),b=Number(bText);if(aText===''||bText===''||![a,b].every(n=>Number.isInteger(n)&&n>=0&&n<=300))throw Error(L('Enter both scratch scores (0–300).','Introduce ambos puntajes scratch (0–300).'));
  const an=a+(individual?match.a.handicap:0),bn=b+(individual?match.b.handicap:0),calculated=an>bn?match.a.key:bn>an?match.b.key:null;
  if(calculated&&winner&&winner!==calculated)throw Error(L('The selected winner conflicts with the score including handicap.','El ganador seleccionado contradice el puntaje con hándicap.'));
  if(!calculated&&![match.a.key,match.b.key].includes(winner))throw Error(L('Tied game: select the rollout winner.','Juego empatado: selecciona al ganador del desempate.'));
  return {aScore:a,bScore:b,winner:calculated||winner};
}
async function saveFinalLadderMatch(type,index){
  if(!finalCanWrite(type))return;const ev=finalEvent(type),ladder=ev.ladder,match=ladder?.matches[index];if(!match)return;
  let result;try{result=readFinalMatch(match,'step-'+type+'-'+index,true,false);}catch(error){finalAlert(error.message);return;}
  if(ladder.matches.length>index+1&&!confirm(L('This correction resets all later stepladder matches. Continue?','Esta corrección reinicia las partidas posteriores de la escalera. ¿Continuar?')))return;
  delete match.aScore;delete match.bScore;Object.assign(match,result);ladder.matches=ladder.matches.slice(0,index+1);delete ev.champion;
  const winner=match.winner===match.a.key?match.a:match.b,next=ladder.seeds.length-3-index;
  if(next>=0)ladder.matches.push({a:winner,b:ladder.seeds[next]});else{ev.champion=winner;ev.stage='complete';}
  if(!ev.champion)ev.stage='ladder';await finalPersist(Array.from({length:ladder.seeds.length-index},(_,j)=>'step-'+type+'-'+(index+j)));
}
function finalPairs(entries){return Array.from({length:entries.length/2},(_,i)=>({a:entries[i],b:entries[entries.length-1-i]}));}
async function saveBakerMatch(round,index){
  if(!finalCanWrite('team'))return;const ev=finalEvent('team'),match=ev[round]?.[index];if(!match)return;
  let result;try{result=readFinalMatch(match,'baker-'+round+'-'+index,false,true);}catch(error){finalAlert(error.message);return;}
  if(round==='round16'&&ev.round8&&!confirm(L('This correction resets the round of 8 and last-six list. Continue?','Esta corrección reinicia la ronda de 8 y la lista de los últimos seis. ¿Continuar?')))return;
  Object.assign(match,result);if(round==='round16'){ev.round8=null;delete ev.lastSix;ev.stage='round16';}else{delete ev.lastSix;ev.stage='round8';}
  if(round==='round8'&&ev.round8.every(m=>m.winner)){ev.lastSix=[...ev.seeded,...ev.round8.map(m=>m.winner===m.a.key?m.a:m.b)];ev.stage='lastSix';}
  await finalPersist(round==='round16'?['baker-round16-'+index,'baker-round8','baker-seed']:['baker-round8-'+index]);
}
function bakerWinners(ev){return ev.round16.filter(m=>m.winner).map(m=>({...m[m.winner===m.a.key?'a':'b'],score:m.winner===m.a.key?m.aScore:m.bScore})).sort((a,b)=>b.score-a.score);}
async function buildBakerRound8(){
  if(!finalCanWrite('team'))return;const ev=finalEvent('team');if(!ev.round16.every(m=>m.winner))return;
  const slots=finalRankPlan(bakerWinners(ev),8,true),picks=finalReadPicks(slots,'baker-seed'),seeds=finalSelected(slots,picks);if(!seeds){finalAlert(L('Resolve tied Baker seeding scores first.','Resuelve primero los puntajes Baker empatados para la siembra.'));return;}
  ev.round8=finalPairs(seeds);ev.round8Seeds=seeds;ev.round8Picks=picks;ev.stage='round8';await finalPersist(['baker-seed']);
}
function editFinal(prefix){if(!isAdmin)return;finalsEditing.add(prefix);renderFinals();}
function cancelFinal(prefix){if(!isAdmin)return;finalsEditing.delete(prefix);for(const key of finalsDrafts.keys())if(key.startsWith(prefix))finalsDrafts.delete(key);renderFinals();}
function finalEditButtons(prefix){return `<button class="btn-secondary" onclick="editFinal('${prefix}')">${t('Edit')}</button>`;}
function renderIndividualFinal(type,ev,locked){
  const spec=finalTypes[type];let html='';
  if(!ev.qualifiers){
    const slots=finalRankPlan(ev.pool,spec.qualify);html+=`<h3>${L('Qualification · 7 games with handicap','Clasificación · 7 juegos con hándicap')}</h3>`+finalNames(ev.pool);
    html+=isAdmin&&!locked?finalPickUI(slots,'qual-'+type)+`<button class="btn-primary" onclick="confirmFinalQualifiers('${type}')">${L('Confirm qualifiers','Confirmar clasificados')}</button>`:`<p class="final-empty">${L('Qualification cutoff tied. Awaiting the admin’s rollout selection.','Empate en el corte de clasificación. Esperando la selección del administrador tras el desempate.')}</p>`;return html;
  }
  html+=`<h3>${L('Qualified bowlers','Jugadores clasificados')}</h3>`+finalNames(ev.qualifiers);
  const editing=isAdmin&&!locked&&(!ev.scores||finalsEditing.has('elim-'+type));
  html+=`<h3>${L('Elimination game','Juego de eliminación')}</h3><p class="final-caption">${L('One new game with handicap. Top '+spec.advance+' advance to the stepladder. Qualifying totals do not carry over.','Un juego nuevo con hándicap. Los mejores '+spec.advance+' avanzan a la escalera. No se arrastra el total clasificatorio.')}</p>`;
  html+=finalTable(ev.qualifiers,[[L('Bowler','Jugador'),q=>esc(q.name)],[L('Scratch','Scratch'),(q,i)=>editing?`<input id="elim-${type}-${i}" data-final-draft="elim-${type}-${i}" aria-label="${L('Elimination scratch','Scratch eliminación')} — ${esc(q.name)}" type="number" min="0" max="300" step="1" inputmode="numeric" value="${ev.scores?.[q.key]??''}">`:ev.scores?.[q.key]??'—'],['HDCP',q=>q.handicap],[L('Total + HDCP','Total + HDCP'),q=>ev.scores?.[q.key]===undefined?'—':ev.scores[q.key]+q.handicap]]);
  if(editing)html+=`<div class="actions"><button class="btn-primary" onclick="saveFinalElimination('${type}')">${L('Save elimination scores','Guardar puntajes de eliminación')}</button>${ev.scores?`<button class="btn-ghost" onclick="cancelFinal('elim-${type}')">${t('Cancel')}</button>`:''}</div>`;
  else if(isAdmin&&!locked)html+=finalEditButtons('elim-'+type);
  if(ev.scores){const results=eliminationRows(ev);html+=`<h3 style="margin-top:20px">${L('Elimination standings','Posiciones de eliminación')}</h3>`+finalTable(results,[[L('Place','Lugar'),(r,i)=>results.findIndex(x=>x.score===r.score)+1],[L('Bowler','Jugador'),r=>esc(r.name)],['Scratch',r=>r.scratch],['HDCP',r=>r.handicap],[L('Total','Total'),r=>r.score]]);
    if(!ev.ladder){const slots=finalRankPlan(results,spec.advance,true);html+=isAdmin&&!locked?finalPickUI(slots,'ladder-'+type)+`<button class="btn-primary" onclick="buildFinalLadder('${type}')">${L('Generate stepladder','Generar escalera')}</button>`:`<p class="final-empty">${L('Awaiting stepladder seeding and any rollout decisions.','Esperando siembra de escalera y decisiones de desempate.')}</p>`;}
  }
  if(ev.ladder){html+=`<h3 style="margin-top:20px">${L('Stepladder','Escalera')}</h3><p class="final-caption">${L('Lowest seed plays the next seed. The winner advances toward seed 1. All individual scores include handicap.','La siembra más baja juega contra la siguiente. El ganador avanza hacia la siembra 1. Todos los puntajes individuales incluyen hándicap.')}</p><div class="final-bracket">`;
    html+=ev.ladder.matches.map((m,i)=>{const prefix='step-'+type+'-'+i,editable=isAdmin&&!locked&&(!m.winner||finalsEditing.has(prefix));return `<div class="final-match"><h4>${L('Match','Partida')} ${i+1}</h4>${finalMatchInputs(m,prefix,true)}${editable?`<button class="btn-primary" onclick="saveFinalLadderMatch('${type}',${i})">${L('Save winner','Guardar ganador')}</button>`:isAdmin&&!locked?finalEditButtons(prefix):''}</div>`;}).join('')+'</div>';
  }
  if(ev.champion)html+=`<div class="final-winner"><strong>${L('Champion','Campeón')}: ${esc(ev.champion.name)}</strong></div>`;return html;
}
function renderTeamFinal(ev,locked){
  let html=`<h3>${L('Seeded teams · first place in each shift','Equipos sembrados · primer lugar de cada turno')}</h3>`+finalTable(ev.seeded,[[L('Shift','Turno'),r=>r.shift],[L('Team','Equipo'),r=>esc(r.name)],[L('Regular match points','Puntos de partidas regulares'),r=>r.score]])+`<p class="final-caption">${L('These two teams sit out the 16-team and 8-team rounds. Baker games are one scratch game per team, shared by all three bowlers. Enter one team score (0–300).','Estos dos equipos descansan las rondas de 16 y de 8. Los juegos Baker son un juego scratch por equipo, compartido entre los tres jugadores. Introduce un puntaje por equipo (0–300).')}</p>`;
  for(const round of ['round16','round8']){if(!ev[round])continue;html+=`<h3>${round==='round16'?L('Round of 16 · 1 vs 16, 2 vs 15…','Ronda de 16 · 1 vs 16, 2 vs 15…'):L('Round of 8 · 1 vs 8, 2 vs 7…','Ronda de 8 · 1 vs 8, 2 vs 7…')}</h3><div class="final-bracket">`+ev[round].map((m,i)=>{const prefix='baker-'+round+'-'+i,editable=isAdmin&&!locked&&(!m.winner||finalsEditing.has(prefix));return `<div class="final-match"><h4>${L('Match','Partida')} ${i+1}</h4>${finalMatchInputs(m,prefix,false)}${editable?`<button class="btn-primary" onclick="saveBakerMatch('${round}',${i})">${L('Save Baker result','Guardar resultado Baker')}</button>`:isAdmin&&!locked?finalEditButtons(prefix):''}</div>`;}).join('')+'</div>';}
  if(!ev.round8&&ev.round16.every(m=>m.winner)){const slots=finalRankPlan(bakerWinners(ev),8,true);html+=`<p class="final-caption">${L('The eight winners are reseeded by their first Baker game score, highest first. Resolve tied scores before generating pairings.','Los ocho ganadores se siembran de nuevo por su primer puntaje Baker, de mayor a menor. Resuelve los empates antes de generar parejas.')}</p>`+(isAdmin&&!locked?finalPickUI(slots,'baker-seed')+`<button class="btn-primary" onclick="buildBakerRound8()">${L('Generate round of 8','Generar ronda de 8')}</button>`:'');}
  if(ev.lastSix)html+=`<h3>${L('Last six teams','Últimos seis equipos')}</h3>`+finalTable(ev.lastSix,[[L('Team','Equipo'),r=>esc(r.name)],[L('Route','Ruta'),(r,i)=>i<2?L('Seeded shift winner','Ganador sembrado del turno'):L('Baker bracket winner','Ganador del cuadro Baker')]])+`<p class="final-empty">${L('The next format is pending. No champion is declared yet.','El siguiente formato está pendiente. Todavía no se declara campeón.')}</p>`;return html;
}
function renderFinals(){
  const el=document.getElementById('finalsContent');if(!el)return;
  const ready=finalReadiness(),type=finalsView,ev=finalEvent(type),stale=finalStale(ev),locked=stale||!ready.ready;
  el.innerHTML=`<div class="card final-card"><div class="final-hero"><img src="./logo.png" alt="De La Rosa Masters"><div><span class="eyebrow">DE LA ROSA MASTERS</span><h2>${L('Championship finals','Finales del campeonato')}</h2><p class="final-caption">${L('Seven games. Two shifts. The road to the title.','Siete juegos. Dos turnos. El camino al título.')}</p></div></div><div class="final-meta"><span class="final-pill">${L('Team games completed','Juegos por equipo completados')}: ${ready.done}/${ready.total}</span><span class="final-pill">${L('Individual finals: handicap','Finales individuales: hándicap')}</span><span class="final-pill">${L('Baker: scratch','Baker: scratch')}</span></div>${!ready.ready?`<p class="final-empty">${L('Finals unlock after every team and bowler has completed all seven regular matches.','Las finales se habilitan cuando todos los equipos y jugadores terminan las siete partidas regulares.')}</p>`:''}<div class="final-event-menu"><label for="finalEventSelect">${L('Final event','Evento final')}</label><select id="finalEventSelect" onchange="finalsView=this.value;finalsMessage='';renderFinals()">${Object.keys(finalTypes).map(k=>`<option value="${k}" ${type===k?'selected':''}>${finalName(k)}</option>`).join('')}</select></div><div id="finalMessage" class="final-message" role="status" aria-live="polite">${esc(finalsMessage)}</div></div><div class="card final-card final-form"><div class="final-header"><h3>${finalName(type)}</h3>${isAdmin?`<button class="btn-primary" onclick="generateFinal('${type}')" ${ready.ready?'':'disabled'}>${ev?L('Regenerate final','Regenerar final'):L('Generate final','Generar final')}</button>`:''}</div>${stale?`<p class="alert alert-warn">${L('Regular-play data changed. These published results are outdated; the administrator must regenerate this event.','Los datos regulares cambiaron. Estos resultados publicados están desactualizados; el administrador debe regenerar este evento.')}</p>`:''}${!ev?`<p class="final-empty">${L('This event has not been generated yet.','Este evento aún no se ha generado.')}</p><p class="final-caption">${type==='team'?L('Two shift winners are seeded. The next 16 teams enter the Baker bracket.','Dos ganadores de turno quedan sembrados. Los siguientes 16 equipos entran al cuadro Baker.'):L('Top '+finalTypes[type].qualify+' qualify with handicap. One game reduces the field to '+finalTypes[type].advance+', followed by a stepladder.','Los mejores '+finalTypes[type].qualify+' clasifican con hándicap. Un juego reduce el grupo a '+finalTypes[type].advance+', seguido de una escalera.')}</p>`:type==='team'?renderTeamFinal(ev,locked):renderIndividualFinal(type,ev,locked)}</div>`;
  // Do not expose editing controls on stale public snapshots or to viewers.
  if(locked)el.querySelectorAll('.final-match input,.final-match select').forEach(e=>e.disabled=true);
  el.querySelectorAll('[data-final-draft]').forEach(input=>{if(finalsDrafts.has(input.dataset.finalDraft))input.value=finalsDrafts.get(input.dataset.finalDraft);input.addEventListener('input',()=>finalsDrafts.set(input.dataset.finalDraft,input.value));input.addEventListener('change',()=>finalsDrafts.set(input.dataset.finalDraft,input.value));});
}
window.addEventListener('beforeunload',event=>{if(finalsDrafts.size){event.preventDefault();event.returnValue='';}});
syncNavigation();
