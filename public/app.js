let selectedMatchGame=null;
let lang=localStorage.getItem('dlr_public_language')||'es',data=null,promptInstall=null;
const $=id=>document.getElementById(id),tr=(en,es)=>lang==='es'?es:en,esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const table=(headers,rows)=>'<div class="table"><table><thead><tr>'+headers.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const titles=()=>({matches:tr('Matches','Partidas'),teams:tr('Team standings','Posiciones por Equipo'),players:tr('Individual standings','Posiciones Individuales'),finals:tr('Finals','Finales'),calcuttaAuction:tr('Calcutta Auction','Calcutta Subasta'),calcuttaWinners:tr('Calcutta Winners','Calcutta Ganadores')});
function language(){document.documentElement.lang=lang;document.title=tr('De La Rosa Masters — View Results','De La Rosa Masters — Ver Resultados');$('navigation').setAttribute('aria-label',tr('Section','Sección'));$('email').parentElement.firstChild.textContent=tr('Email','Correo electrónico');$('methodLabel').firstChild.textContent=tr('Sign-in method','Método de acceso');$('passwordLabel').firstChild.textContent=tr('Password','Contraseña');$('codeLabel').firstChild.textContent=tr('Email code','Código por correo');$('method').options[0].textContent=tr('Password','Contraseña');$('method').options[1].textContent=tr('Email code','Código por correo');$('subtitle').textContent=tr('View Results','Ver Resultados');$('language').textContent=tr('Español','English');const selected=$('navigation').value;$('navigation').innerHTML=Object.entries(titles()).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');$('navigation').value=selected||'matches';$('refresh').textContent=tr('Refresh','Actualizar');$('adminLink').textContent=tr('Admin Access','Acceso administrador');$('back').textContent=tr('View Results','Ver Resultados');$('submit').textContent=tr('Sign in','Iniciar sesión');$('sendCode').textContent=tr('Send code','Enviar código');$('install').textContent=tr('Install App','Instalar App');deviceLabels();render();}
const tbd=()=>tr('TBD','Por Definir');
function bracket(matches,handicap=true){
const name=e=>e?.name?`${e.seed?'#'+e.seed+' ':''}${e.name}`:tbd();
return table([tr('Match','Partida'),'HDCP',tr('Scratch','Scratch'),tr('Total + HDCP','Total + HDCP'),tr('Winner','Ganador')],(matches||[]).map((m,i)=>[`${i+1}. ${name(m.a)} vs ${name(m.b)}`,`${m.a?handicap?(m.a.handicap||0):0:tbd()} / ${m.b?handicap?(m.b.handicap||0):0:tbd()}`,`${m.aScore??tbd()} / ${m.bScore??tbd()}`,`${m.aScore==null?tbd():m.aScore+(handicap?(m.a?.handicap||0):0)} / ${m.bScore==null?tbd():m.bScore+(handicap?(m.b?.handicap||0):0)}`,m.winner&&m.winner===m.a?.key?m.a.name:m.winner&&m.winner===m.b?.key?m.b.name:tbd()]));}
function publicLadder(e,count){
const seeds=e.ladder?.seeds||[],matches=e.ladder?.matches||[];
let html='<h3>'+tr('Stepladder seeds','Sembrados')+'</h3>'+table([tr('Seed','Sembrado'),tr('Bowler','Jugador'),'HDCP'],Array.from({length:count},(_,i)=>[i+1,seeds[i]?.name||tbd(),seeds[i]?.handicap??tbd()]));
const planned=Array.from({length:count-1},(_,i)=>matches[i]||{a:i===0?seeds[count-1]:null,b:seeds[count-2-i]});
return html+'<h3>'+tr('Stepladder','Escalera')+'</h3>'+bracket(planned);
}
function championDisplay(key,e){
if(e.outdated)return '';
const winners=key==='team'&&e.finalResults?.length?e.finalResults.filter(r=>r.rank===1):e.champion?[e.champion]:[];
if(!winners.length)return '';
const label=tr(winners.length>1?'Champions':'Champion',winners.length>1?'Campeones':key==='women'?'Campeona':'Campeón');
let html='<div class="champion-banner"><p class="champion-label">'+label+'</p>'+winners.map(w=>'<div class="champion-title"><span aria-hidden="true">★</span><strong>'+esc(w.name)+'</strong><span aria-hidden="true">★</span></div>').join('')+'</div>';
if(key==='team'&&e.finalResults?.length){const top=e.finalResults.filter(r=>r.rank<=3),ordered=top.length===3&&new Set(top.map(r=>r.rank)).size===3?[top[1],top[0],top[2]]:top;
html+='<div class="team-podium" aria-label="'+tr('Team podium','Podio por equipos')+'">'+ordered.map(r=>{const members=data.teams?.find(t=>t.id===r.key)?.bowlers||[];return '<section class="podium-place podium-'+r.rank+'"><div class="podium-team"><span class="podium-medal" aria-hidden="true">'+({1:'🥇',2:'🥈',3:'🥉'}[r.rank])+'</span><h3>'+esc(r.name)+'</h3><ul>'+members.map(b=>'<li>'+esc(b.name)+'</li>').join('')+'</ul><p class="podium-score">'+esc(r.score)+' '+tr('pins','pinos')+'</p></div><div class="podium-step"><span>'+r.rank+'</span><small>'+tr('Place','Lugar')+'</small></div></section>';}).join('')+'</div>';}
return html;
}
function renderPublicFinals(){
let html='';const names={overall:tr('Individual Overall','Individual General'),seniors:tr('Seniors Final','Final Seniors'),women:tr('Women’s Final','Final Femenina'),superSeniors:tr('Super Senior Final','Final Super Senior'),team:tr('Team Finals','Finales por Equipo')};
for(const [key,e] of Object.entries(data.finals)){
html+=`<article><h2>${names[key]}</h2>${e.outdated?'<p>'+tr('Qualifying scores changed. Admin review pending.','Cambió la clasificación. Pendiente de revisión del administrador.')+'</p>':''}`;
html+=championDisplay(key,e);
if(key!=='team'){
const entries=e.qualifiers||e.pool||[];html+='<h3>'+tr(e.qualifiers?'Qualifiers / Elimination':'Qualification — cutoff decision pending',e.qualifiers?'Clasificados / Eliminación':'Clasificación — desempate pendiente')+'</h3>'+table([tr('Name','Nombre'),'HDCP',tr('Qualifying total','Total clasificatorio'),tr('Elimination + HDCP','Eliminación + HDCP')],entries.map(p=>[p.name,p.handicap,p.score,p.eliminationScratch==null?tbd():p.eliminationScratch+(p.handicap||0)]));
if(key==='superSeniors'){
const finalists=e.lastThree||Array.from({length:3},()=>({name:tbd()}));html+='<h3>'+tr('Top three — final game','Tres finalistas — juego final')+'</h3>'+table([tr('Bowler','Jugador'),'Scratch','HDCP',tr('Total + HDCP','Total + HDCP')],finalists.map(p=>[p.name,p.finalScratch??tbd(),p.handicap??tbd(),p.finalScratch==null?tbd():p.finalScratch+p.handicap]));
if(e.finalResults?.length)html+='<h3>'+tr('Final standings','Posiciones finales')+'</h3>'+table([tr('Place','Lugar'),tr('Bowler','Jugador'),'Scratch','HDCP',tr('Total','Total')],e.finalResults.map(p=>[p.rank,p.name,p.scratch,p.handicap,p.score]));else if(e.stage==='finalTie')html+='<p>'+tr('Final places pending a rollout decision.','Lugares finales pendientes de desempate.')+'</p>';
}else html+=publicLadder(e,key==='women'?3:5);
}else{
const modern=e.rulesVersion===2,one=e.shiftCount===1;
if(!modern)html+='<p>'+tr('Results awaiting review.','Resultados pendientes de revisión.')+'</p>';
for(const field of ['seeded','field'])html+='<h3>'+tr(field==='seeded'?'Seeded directly into final six':'Baker qualifiers',field==='seeded'?'Sembrados Directo a la Final':'Clasificados Baker')+'</h3>'+table([tr('Seed / Shift','Sembrado / Turno'),tr('Team','Equipo'),'Baker HDCP',tr('Regular points','Puntos regulares')],(e[field]||[]).map(p=>[field==='seeded'?p.shift:p.seed,p.name,p.handicap??0,p.score]));
const first=one?'round10':'round16';html+='<h3>'+tr('Baker round of ','Ronda Baker de ')+(one?10:16)+'</h3>'+bracket(e[first]||[],modern);
if(!one)html+='<h3>'+tr('Baker round of 8','Ronda Baker de 8')+'</h3>'+bracket(e.round8||Array.from({length:4},()=>({})),modern);
const six=e.lastSix||[...(e.seeded||[]),...Array.from({length:6-(e.seeded?.length||0)},()=>({name:tbd()}))];
html+='<h3>'+tr('Final six — one Baker game + handicap','Seis finalistas — un juego Baker + hándicap')+'</h3>'+table([tr('Team','Equipo'),'Baker HDCP',tr('Status','Estado')],six.map(p=>[p.name,p.handicap??tbd(),e.seeded?.some(q=>q.key===p.key)?tr('Seeded','Sembrado'):p.key?tr('Qualified','Clasificado'):tbd()]));
if(e.finalResults?.length)html+='<h3>'+tr('Final standings','Posiciones finales')+'</h3>'+table([tr('Place','Lugar'),tr('Team','Equipo'),'Scratch','HDCP',tr('Total','Total')],e.finalResults.map(p=>[p.rank,p.name,p.scratch,p.handicap,p.score]))+'<p>'+tr('Equal totals share the same place.','Los totales empatados comparten el mismo lugar.')+'</p>';
}
html+='</article>';
}return html;
}

function renderPublicCalcutta(section){
const currency=n=>new Intl.NumberFormat(lang==='es'?'es-MX':'en-US',{style:'currency',currency:'MXN'}).format(n||0);
let html='';for(const [group,label] of [['team',tr('Teams','Equipos')],['men',tr('Men','Hombres')],['combined',tr('Seniors + All Women','Seniors + Todas las Mujeres')]]){const c=data.calcutta?.[group];if(!c)continue;html+='<article><h2>'+label+'</h2><p>'+tr('Auction total','Total de subasta')+': '+currency(c.total)+'</p>';
if(section==='calcuttaAuction')html+=table(['#',tr('Team / Bowler','Equipo / Jugador'),tr('Team','Equipo'),tr('Shift','Turno'),tr('Auction amount (MXN)','Monto de subasta (MXN)')],c.auction.map(r=>[r.rank,r.name,r.team||'—',r.shift,r.cost==null?tr('Not sold','Sin vender'):currency(r.cost)]));
else{html+='<p>'+tr('Purse','Bolsa')+': '+currency(c.purse)+'</p><p>'+(!c.configured?tr('Payout settings pending.','Configuración de premios pendiente.'):c.ready?tr('Final results','Resultados finales'):tr('Provisional — games 5, 6 and 7 are not complete for all entrants.','Provisional — faltan juegos 5, 6 y 7 de algunos participantes.'))+'</p>';
html+=table([tr('Place','Lugar'),tr('Team / Bowler','Equipo / Jugador'),tr('Team','Equipo'),tr('Game 5 + HDCP','Juego 5 + HDCP'),tr('Game 6 + HDCP','Juego 6 + HDCP'),tr('Game 7 + HDCP','Juego 7 + HDCP'),tr('Sunday total','Total domingo'),tr('Prize (MXN)','Premio (MXN)')],c.results.map(r=>[r.rank??'—',r.name,r.team||'—',...r.gameTotals.map(n=>n??tbd()),r.score,c.configured?currency(r.prize):tbd()]));}
html+='</article>';}return html;
}

function render(){if(!data)return;let html='';const section=$('navigation').value;if(section==='teams')html=table(['#',tr('Team','Equipo'),tr('Shift','Turno'),tr('Points','Puntos'),tr('Scratch pins','Pinos sin hándicap'),tr('Games','Juegos')],data.standings.teams.map((t,i)=>[i+1,t.name,t.shift,t.points,t.pinfall,t.games]));
if(section==='players'){for(const [name,filter]of [[tr('Open Standings','Libre'),()=>true],[tr('Seniors','Seniors'),p=>p.gender.includes('Senior')],[tr('Women','Mujeres'),p=>p.gender.includes('Female')]])html+=`<h2>${name}</h2>`+table(['#',tr('Bowler','Jugador'),tr('Team','Equipo'),'HDCP',tr('Total + HDCP','Total + HDCP'),tr('Games','Juegos')],data.standings.players.filter(filter).map((p,i)=>[i+1,p.name,p.team,p.handicap,p.netPinfall,p.games]));}
if(section==='matches'){
const games=[...data.games].sort((a,b)=>a.number-b.number);
if(!games.some(g=>String(g.number)===selectedMatchGame))selectedMatchGame=games.length?String(games[games.length-1].number):null;
if(games.length)html+=`<label for="matchGameFilter">${tr('Select game','Seleccionar juego')}</label><select id="matchGameFilter">${games.map(g=>`<option value="${esc(g.number)}" ${String(g.number)===selectedMatchGame?'selected':''}>${tr('Game','Juego')} ${esc(g.number)}</option>`).join('')}</select>`;
}
if(section==='matches')for(const g of data.games.filter(g=>String(g.number)===selectedMatchGame)){html+=`<h2>${tr('Match','Partida')} ${esc(g.number)}</h2>`;for(const m of g.matches){const ready=m.completed&&m.bowlers.every(b=>Number.isFinite(b.aScore)&&Number.isFinite(b.bScore));const points=(a,b,n)=>!ready?'—':a>b?'🟢'.repeat(n):a===b?'🟢'.repeat(n/2):'❌'.repeat(n);const rows=m.bowlers.map(b=>{const a=b.aScore+b.aHandicap,c=b.bScore+b.bHandicap;return[b.a,b.aHandicap,b.aScore,ready?a:'—',points(a,c,2),b.b,b.bHandicap,b.bScore,ready?c:'—',points(c,a,2)];});const total=side=>m.bowlers.reduce((sum,b)=>sum+b[side+'Score']+b[side+'Handicap'],0);rows.push([tr('Team total','Total equipo'),'','',ready?total('a'):'—',points(total('a'),total('b'),4),tr('Team total','Total equipo'),'','',ready?total('b'):'—',points(total('b'),total('a'),4)]);html+=`<article><h3>${esc(m.a)} vs ${esc(m.b)}</h3><p>${tr('Lanes','Pistas')}: ${esc(m.laneA)} / ${esc(m.laneB)} · ${m.completed?tr('Complete','Completo'):tr('Pending','Pendiente')}</p><p>${tr('Each green dot = 1 point earned. Crosses mark points lost. Totals include handicap.','Cada punto verde = 1 punto ganado. Las cruces indican puntos perdidos. Los totales incluyen hándicap.')}</p>`+table([tr('Bowler','Jugador'),'HDCP',tr('Score','Puntuación'),tr('Total','Total'),tr('Points','Puntos'),tr('Opponent','Oponente'),'HDCP',tr('Score','Puntuación'),tr('Total','Total'),tr('Points','Puntos')],rows)+'</article>';}}
if(section==='finals')html=renderPublicFinals();
if(section==='calcuttaAuction'||section==='calcuttaWinners')html=renderPublicCalcutta(section);
$('content').innerHTML=html||'<article>'+tr('No results published yet.','Aún no hay resultados publicados.')+'</article>';const filter=$('matchGameFilter');if(filter)filter.onchange=()=>{selectedMatchGame=filter.value;render();};}
async function refresh(){try{const r=await fetch('/api/results',{cache:'no-store'});if(!r.ok)throw Error();data=await r.json();render();$('status').textContent=tr('Updated ','Actualizado ')+new Date().toLocaleTimeString();}catch{$('status').textContent=tr('Results unavailable. Please refresh shortly.','Resultados no disponibles. Intenta actualizar en un momento.');}}
async function auth(path,payload){const r=await fetch('/api/auth/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const b=await r.json();if(!r.ok)throw Error(b.error||tr('Sign-in failed','No se pudo iniciar sesión'));return b;}
$('loginForm').addEventListener('submit',async event=>{event.preventDefault();$('submit').disabled=true;try{await auth($('method').value==='code'?'verify':'password',{email:$('email').value,password:$('password').value,code:$('code').value});$('password').value='';location.replace('/admin/');}catch(e){$('status').textContent=e.message;}finally{$('submit').disabled=false;}});
$('sendCode').onclick=async()=>{$('sendCode').disabled=true;try{await auth('code',{email:$('email').value});$('status').textContent=tr('Check your email for the code.','Busca el código en tu correo.');}catch(e){$('status').textContent=e.message;}finally{$('sendCode').disabled=false;}};
$('method').onchange=()=>{const code=$('method').value==='code';$('passwordLabel').hidden=code;$('password').required=!code;$('codeLabel').hidden=!code;$('code').required=code;$('sendCode').hidden=!code;};$('method').onchange();
$('navigation').onchange=render;$('refresh').onclick=refresh;$('language').onclick=()=>{lang=lang==='en'?'es':'en';localStorage.setItem('dlr_public_language',lang);language();};
const appleDevice=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
let pushKey=null,pushRegistration=null,pushSubscription=null;
function deviceLabels(){
$('install').hidden=standalone();$('notifications').hidden=location.pathname==='/login';
$('notifications').textContent=pushSubscription?tr('Disable notifications','Desactivar notificaciones'):tr('Enable notifications','Activar notificaciones');
$('installHelp').textContent=appleDevice?tr('On iPhone/iPad: open this page in Safari, tap Share, then Add to Home Screen and Add. Open the app from its new icon. Notifications require iOS/iPadOS 16.4 or later and permission inside the installed app.','En iPhone/iPad: abre esta página en Safari, toca Compartir, luego Agregar a pantalla de inicio y Agregar. Abre la app desde su nuevo icono. Las notificaciones requieren iOS/iPadOS 16.4 o posterior y permiso dentro de la app instalada.'):tr('Use your browser menu and select Install app or Add to Home Screen.','Usa el menú de tu navegador y selecciona Instalar app o Agregar a pantalla de inicio.');
}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptInstall=event;deviceLabels();});
window.addEventListener('appinstalled',()=>{$('install').hidden=true;$('installHelp').hidden=true;});
$('install').onclick=async()=>{if(promptInstall){await promptInstall.prompt();promptInstall=null;}else $('installHelp').hidden=!$('installHelp').hidden;};
async function pushRequest(path,payload){const response=await fetch('/api/push/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!response.ok)throw Error(tr('Notifications could not be saved. Please try again.','No se pudieron guardar las notificaciones. Intenta de nuevo.'));}
async function prepareNotifications(){if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))return;try{pushRegistration=await navigator.serviceWorker.ready;const response=await fetch('/api/push/config');if(!response.ok)throw Error();pushKey=(await response.json()).publicKey;pushSubscription=await pushRegistration.pushManager.getSubscription();if(pushSubscription)await pushRequest('subscribe',{endpoint:pushSubscription.endpoint});deviceLabels();}catch{$('notificationStatus').textContent=tr('Notifications are temporarily unavailable. Reload to retry.','Las notificaciones no están disponibles temporalmente. Recarga para reintentar.');}}
$('notifications').onclick=async()=>{
if(appleDevice&&!standalone()){$('installHelp').hidden=false;return;}
if(!('PushManager'in window)||!('Notification'in window)){$('notificationStatus').textContent=tr('This browser does not support notifications. On iPhone, install from Safari and use iOS 16.4 or later.','Este navegador no admite notificaciones. En iPhone, instala desde Safari y usa iOS 16.4 o posterior.');return;}
if(!pushRegistration||!pushKey){$('notificationStatus').textContent=tr('Preparing notifications. Please try again shortly.','Preparando notificaciones. Intenta de nuevo en un momento.');prepareNotifications();return;}
$('notifications').disabled=true;
try{
if(pushSubscription){await pushRequest('unsubscribe',{endpoint:pushSubscription.endpoint});await pushSubscription.unsubscribe();pushSubscription=null;$('notificationStatus').textContent=tr('Notifications disabled.','Notificaciones desactivadas.');}
else{const permission=await Notification.requestPermission();if(permission!=='granted'){$('notificationStatus').textContent=tr('Notifications were not allowed. You can change this in your browser or device settings.','No se permitieron las notificaciones. Puedes cambiarlo en la configuración de tu navegador o dispositivo.');return;}
const raw=atob(pushKey.replace(/-/g,'+').replace(/_/g,'/'));const sub=await pushRegistration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(raw,c=>c.charCodeAt(0))});try{await pushRequest('subscribe',{endpoint:sub.endpoint});pushSubscription=sub;}catch(error){await sub.unsubscribe();throw error;}$('notificationStatus').textContent=tr('Notifications enabled.','Notificaciones activadas.');}
deviceLabels();
}catch(error){$('notificationStatus').textContent=error.message||tr('Unable to enable notifications.','No se pudieron activar las notificaciones.');}finally{$('notifications').disabled=false;}
};
if('serviceWorker'in navigator){navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='RESULTS_UPDATED'&&location.pathname!=='/login'){$('navigation').value='matches';refresh();}});if(location.pathname!=='/login')prepareNotifications();}

for(const k of ['dlr_local_cache','dlr_pending_sync'])localStorage.removeItem(k);
language();if(location.pathname==='/login'){$('login').hidden=false;document.querySelector('nav').hidden=true;$('content').hidden=true;}else{refresh();setInterval(()=>{if(!document.hidden)refresh();},30000);}
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
