import {publicResults,validateState,emptyState,applyHandicapRule} from './tournament.js';
const COOKIE='__Host-dlr_session';
const REFRESH_COOKIE='__Host-dlr_refresh';
class HTTPError extends Error{constructor(status,message){super(message);this.status=status;}}
// Merge only independent regular-match score edits; never overwrite a changed match or pairing.
export function mergeMatchScores(base,proposed,current){
  if(!base)return null;
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const scores=m=>({bowlers:m.bowlers,completed:m.completed,teamScoreA:m.teamScoreA,teamScoreB:m.teamScoreB});
  const structure=s=>{const c=structuredClone(s);delete c.currentGame;for(const g of c.games||[])if(g)for(const m of g.matches){delete m.bowlers;delete m.completed;delete m.teamScoreA;delete m.teamScoreB;}return c;};
  if(!equal(structure(base),structure(proposed))||!equal(base.teams,current.teams)||!equal(base.settings,current.settings))return null;
  const next=structuredClone(current);
  for(const game of proposed.games){if(!game)continue;const oldGame=base.games.find(g=>g?.number===game.number),nowGame=next.games.find(g=>g?.number===game.number);if(!oldGame||!nowGame)return null;
    for(const match of game.matches){const old=oldGame.matches.find(m=>m.id===match.id);if(!old)return null;if(equal(scores(old),scores(match)))continue;
      const now=nowGame.matches.find(m=>m.id===match.id);if(!now||now.aId!==old.aId||now.bId!==old.bId||(!equal(scores(now),scores(old))&&!equal(scores(now),scores(match))))return null;
      Object.assign(now,structuredClone(scores(match)));
    }
  }
  return next;
}
const baseHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY'};
function json(value,status=200,extra={}){return new Response(JSON.stringify(value),{status,headers:{...baseHeaders,'Content-Type':'application/json; charset=utf-8',...extra}});}
function tokenFrom(request,name=COOKIE){return (request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);}
function cookie(token,age,name=COOKIE){return `${name}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.max(0,Math.min(age,34560000))}`;}
function writeOrigin(request){const origin=request.headers.get('Origin');if(origin!==new URL(request.url).origin)throw new HTTPError(403,'Origin not allowed.');if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new HTTPError(415,'JSON required.');}
async function body(request,max=4*1024*1024){if(Number(request.headers.get('Content-Length'))>max)throw new HTTPError(413,'Request is too large.');const reader=request.body?.getReader();if(!reader)throw new HTTPError(400,'JSON required.');let size=0,parts=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new HTTPError(413,'Request is too large.');}parts.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new HTTPError(400,'Invalid JSON.');}}
export function createHandler(assets={},fetcher=fetch){
  async function upstream(env,path,{method='GET',data,admin=false,token,prefer}={}){
    const key=admin?env.SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_PUBLISHABLE_KEY;
    if(!key||!env.SUPABASE_URL)throw new HTTPError(503,'Server setup is incomplete.');
    const response=await fetcher(env.SUPABASE_URL+path,{method,headers:{apikey:key,...(prefer?{Prefer:prefer}:{}),...(token?{Authorization:'Bearer '+token}:admin&&key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(15000)});
    let result;try{result=await response.json();}catch{result=null;}
    return {ok:response.ok,status:response.status,data:result};
  }
  async function authorize(env,token){
    if(!token||token.length>12000)throw new HTTPError(401,'Please sign in again.');
    const response=await upstream(env,'/auth/v1/user',{token});const user=response.data;
    if(response.status>=500)throw new HTTPError(503,'Sign-in service temporarily unavailable. Please retry.');
    if(!response.ok||!user?.id||!user.email_confirmed_at||String(user.email).toLowerCase()!==env.ADMIN_EMAIL.toLowerCase())throw new HTTPError(401,'Administrator sign-in required.');
    const membership=await upstream(env,'/rest/v1/tournament_admins?select=user_id&user_id=eq.'+encodeURIComponent(user.id),{admin:true});
    if(!membership.ok)throw new HTTPError(503,'Administrator permissions are not configured.');
    if(!Array.isArray(membership.data)||membership.data.length!==1)throw new HTTPError(403,'This account is not authorized.');return user;
  }
  async function rateLimit(env,request,route){
    const input=(request.headers.get('CF-Connecting-IP')||'local')+'|'+route;
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input)))).map(b=>b.toString(16).padStart(2,'0')).join('');
    for(const [bucket,limit,window] of [[hash,route==='code'?3:route==='push'?300:10,600],['admin-global-'+route,route==='code'?10:route==='push'?3000:60,600]]){
      const r=await upstream(env,'/rest/v1/rpc/tournament_auth_attempt',{method:'POST',admin:true,data:{p_bucket:bucket,p_limit:limit,p_window_seconds:window}});
      if(!r.ok)throw new HTTPError(503,'Authentication setup is incomplete.');if(r.data!==true)throw new HTTPError(429,'Too many attempts. Try again in 10 minutes.');
    }
  }
  async function load(env){const r=await upstream(env,'/rest/v1/tournament_data?select=state,revision,updated_at&id=eq.'+encodeURIComponent(env.TOURNAMENT_ID),{admin:true});if(!r.ok)throw new HTTPError(503,'Tournament database is unavailable.');const row=r.data?.[0]||{state:emptyState(),revision:-1,updated_at:null};return {...row,state:applyHandicapRule(row.state)};}
  const push=createPushService(upstream,fetcher);
  const refreshing=new Map();
  return async function handle(request,env,ctx){
    const cookies=[];
    const setSession=data=>{cookies.push(cookie(data.access_token,data.expires_in||3600));if(data.refresh_token)cookies.push(cookie(data.refresh_token,34560000,REFRESH_COOKIE));};
    const clearSession=()=>{cookies.length=0;cookies.push(cookie('',0),cookie('',0,REFRESH_COOKIE));};
    async function authenticatedToken(){
      const token=tokenFrom(request);
      try{await authorize(env,token);return token;}catch(e){if(e.status!==401)throw e;}
      const refresh=tokenFrom(request,REFRESH_COOKIE);
      if(!refresh||refresh.length>12000)throw new HTTPError(401,'Please sign in again.');
      const key=env.SUPABASE_URL+'|'+refresh;
      if(!refreshing.has(key))refreshing.set(key,upstream(env,'/auth/v1/token?grant_type=refresh_token',{method:'POST',data:{refresh_token:refresh}}).finally(()=>refreshing.delete(key)));
      const r=await refreshing.get(key);
      if(!r.ok){if(r.status>=500||r.status===429)throw new HTTPError(503,'Sign-in service temporarily unavailable. Please retry.');clearSession();throw new HTTPError(401,'Please sign in again.');}
      if(!r.data?.access_token||!r.data?.refresh_token)throw new HTTPError(503,'Could not renew sign-in. Please retry.');
      await authorize(env,r.data.access_token);setSession(r.data);return r.data.access_token;
    }
    const response=await route();
    if(!cookies.length)return response;
    const headers=new Headers(response.headers);headers.delete('Set-Cookie');for(const value of cookies)headers.append('Set-Cookie',value);
    return new Response(response.body,{status:response.status,headers});
    async function route(){
    try{
      const url=new URL(request.url),path=url.pathname;
      if(path.startsWith('/api/')&&request.method==='POST')writeOrigin(request);
      if(path==='/api/push/config'&&request.method==='GET'){const c=await push.config(env);return json({publicKey:c.publicKey});}
      if(['/api/push/subscribe','/api/push/unsubscribe'].includes(path)&&request.method==='POST'){
        await rateLimit(env,request,'push');const b=await body(request,8192);if(!validPushEndpoint(b.endpoint))throw new HTTPError(400,'Invalid push endpoint.');
        if(path.endsWith('/unsubscribe'))await push.unsubscribe(env,b.endpoint);else await push.subscribe(env,b.endpoint);return json({ok:true});
      }
      if(path==='/api/auth/code'&&request.method==='POST'){
        await rateLimit(env,request,'code');const b=await body(request,4096);
        if(String(b.email||'').trim().toLowerCase()!==env.ADMIN_EMAIL.toLowerCase())throw new HTTPError(401,'Administrator sign-in required.');
        const r=await upstream(env,'/auth/v1/otp',{method:'POST',data:{email:env.ADMIN_EMAIL,create_user:false}});
        if(!r.ok)throw new HTTPError(r.status===429?429:503,'Could not send a code. Check your Supabase email delivery setup.');return json({ok:true});
      }
      if(['/api/auth/verify','/api/auth/password'].includes(path)&&request.method==='POST'){
        await rateLimit(env,request,'login');const b=await body(request,4096);
        if(String(b.email||'').trim().toLowerCase()!==env.ADMIN_EMAIL.toLowerCase())throw new HTTPError(401,'Administrator sign-in required.');
        const isCode=path.endsWith('/verify');if(isCode&&!/^\d{6,10}$/.test(String(b.code||'')))throw new HTTPError(400,'Enter the code from your email.');
        if(!isCode&&(typeof b.password!=='string'||b.password.length<1||b.password.length>512))throw new HTTPError(400,'Enter your password.');
        const r=await upstream(env,isCode?'/auth/v1/verify':'/auth/v1/token?grant_type=password',{method:'POST',data:isCode?{email:env.ADMIN_EMAIL,token:b.code,type:'email'}:{email:env.ADMIN_EMAIL,password:b.password}});
        if(!r.ok||!r.data?.access_token)throw new HTTPError(401,'Sign-in failed. Check your details and try again.');
        await authorize(env,r.data.access_token);setSession(r.data);return json({ok:true});
      }
      if(path==='/api/auth/logout'&&request.method==='POST'){
        let token;try{token=await authenticatedToken();}catch(e){if(e.status!==401)throw e;}
        if(token){const r=await upstream(env,'/auth/v1/logout?scope=local',{method:'POST',token});if(!r.ok&&r.status!==401)throw new HTTPError(503,'Could not sign out. Please retry.');}
        clearSession();return json({ok:true});
      }
      if(path==='/api/results'&&request.method==='GET'){const row=await load(env);return json({revision:row.revision,updatedAt:row.updated_at,...publicResults(row.state)});}
      if(path==='/api/admin/state'){
        await authenticatedToken();
        if(request.method==='GET')return json(await load(env));
        if(request.method==='POST'){
          const b=await body(request);if(!Number.isSafeInteger(b.revision)||b.revision< -1)throw new HTTPError(400,'Invalid revision.');
          try{validateState(b.state);}catch(e){throw new HTTPError(400,e.message);}
          if(b.baseState){try{validateState(b.baseState);}catch{throw new HTTPError(400,'Invalid original tournament.');}}
          let previous,next,r;
          for(let attempt=0;attempt<4;attempt++){
            previous=await load(env);
            next=previous.revision===b.revision?b.state:mergeMatchScores(b.baseState,b.state,previous.state);
            if(!next)throw new HTTPError(409,'Another device changed this match or tournament setup. Your edits are still here. Export a backup, then reload and review before saving.');
            validateState(next);
            r=await upstream(env,'/rest/v1/rpc/save_tournament_state',{method:'POST',admin:true,data:{p_id:env.TOURNAMENT_ID,p_state:next,p_expected_revision:previous.revision}});
            if(!r.ok)throw new HTTPError(503,'Could not save. Keep this window open and export a backup.');
            if(!r.data?.conflict)break;
          }
          if(r.data?.conflict)throw new HTTPError(409,'The tournament is busy. Your edits are still here; retry saving.');
          if(scoreVersion(previous.state)!==scoreVersion(next)){
            const send=push.broadcast(env).then(result=>{if(result.failed)console.warn('Push delivery failures:',result.failed);}).catch(()=>console.warn('Push notification delivery unavailable'));
            if(ctx?.waitUntil)ctx.waitUntil(send);else await send;
          }return json({revision:r.data.revision,state:next});
        }
        throw new HTTPError(405,'Method not allowed.');
      }
      if(path.startsWith('/api/'))throw new HTTPError(404,'Not found.');
      if(path==='/admin')return Response.redirect(url.origin+'/admin/',302);
      if(path.startsWith('/admin/')){
        try{await authenticatedToken();}catch(e){if(e.status===401||e.status===403){if(path==='/admin/'){clearSession();return new Response(null,{status:302,headers:{...baseHeaders,Location:'/login'}});}}throw e;}
        const map={'/admin/':[assets.adminHTML,'text/html'],'/admin/finals.js':[assets.adminFinals,'application/javascript'],'/admin/finals.css':[assets.adminStyle,'text/css']};
        if(!map[path])throw new HTTPError(404,'Not found.');return new Response(map[path][0],{headers:{...baseHeaders,'Content-Type':map[path][1]+'; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"}});
      }
      if(request.method!=='GET'&&request.method!=='HEAD')throw new HTTPError(405,'Method not allowed.');
      const allowed=new Set(['/','/index.html','/login','/app.js','/style.css','/sw.js','/manifest.webmanifest','/logo.png','/favicon.png','/apple-touch-icon.png','/icon-finals-192.png','/icon-finals-512.png','/icon-finals-maskable.png']);
      if(!allowed.has(path))throw new HTTPError(404,'Not found.');
      const assetURL=new URL(request.url);if(path==='/login')assetURL.pathname='/';const response=await env.ASSETS.fetch(new Request(assetURL,request));const headers=new Headers(response.headers);
      for(const [k,v]of Object.entries(baseHeaders))headers.set(k,v);headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
      if(path==='/sw.js')headers.set('Service-Worker-Allowed','/');return new Response(response.body,{status:response.status,headers});
    }catch(error){return json({error:error.status?error.message:'Service temporarily unavailable.'},error.status||503);}
    }
  };
}

// Web Push uses a fixed service-worker message and an authenticated, empty payload.
const pushEncoder=new TextEncoder();
const pushB64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
export function validPushEndpoint(value){try{const u=new URL(value);return value.length<=4096&&u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&(u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname.endsWith('.push.services.mozilla.com')||u.hostname==='web.push.apple.com'||u.hostname.endsWith('.notify.windows.com'));}catch{return false;}}
export function scoreVersion(state){
  const regular=(state.games||[]).filter(Boolean).map(g=>({number:g.number,matches:(g.matches||[]).filter(m=>m.completed).map(m=>({id:m.id,aId:m.aId,bId:m.bId,scores:[...(m.bowlers||[])].sort((a,b)=>a.pos-b.pos).map(b=>[b.pos,b.a,b.b])})).sort((a,b)=>a.id.localeCompare(b.id))})).filter(g=>g.matches.length).sort((a,b)=>a.number-b.number);
  const finals=Object.entries(state.finals?.events||{}).sort().map(([type,e])=>({type,scores:Object.entries(e.scores||{}).sort(),finalScores:Object.entries(e.finalScores||{}).sort(),matches:[...(e.ladder?.matches||[]),...(e.round10||[]),...(e.round16||[]),...(e.round8||[])].filter(m=>m.winner||m.aScore!=null||m.bScore!=null).map(m=>[m.a?.key,m.b?.key,m.aScore??null,m.bScore??null,m.winner??null])})).filter(e=>e.scores.length||e.finalScores.length||e.matches.length);
  return JSON.stringify({regular,finals});
}
export function createPushService(upstream,fetcher=fetch){
  const configs=new Map();
  const prefix=env=>'push-sub:'+env.TOURNAMENT_ID+':';
  async function getRow(env,id){const r=await upstream(env,'/rest/v1/tournament_data?select=state&id=eq.'+encodeURIComponent(id),{admin:true});if(!r.ok)throw Error('Push storage unavailable');return r.data?.[0]?.state;}
  async function put(env,id,state){const r=await upstream(env,'/rest/v1/tournament_data?on_conflict=id',{admin:true,method:'POST',prefer:'resolution=merge-duplicates,return=minimal',data:{id,state,updated_at:new Date().toISOString()}});if(!r.ok)throw Error('Push storage unavailable');}
  async function config(env){const cacheKey=env.SUPABASE_URL+'|'+env.TOURNAMENT_ID;if(!configs.has(cacheKey))configs.set(cacheKey,(async()=>{const id='push-config:'+env.TOURNAMENT_ID;let stored=await getRow(env,id);if(!stored){const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const generated={kind:'push-config',publicKey:pushB64(await crypto.subtle.exportKey('raw',pair.publicKey)),privateKey:await crypto.subtle.exportKey('jwk',pair.privateKey)};const r=await upstream(env,'/rest/v1/rpc/save_tournament_state',{admin:true,method:'POST',data:{p_id:id,p_state:generated,p_expected_revision:-1}});if(!r.ok)throw Error('Push setup unavailable');stored=await getRow(env,id);}if(!stored?.privateKey||!stored.publicKey)throw Error('Push setup unavailable');return stored;})().catch(e=>{configs.delete(cacheKey);throw e;}));return configs.get(cacheKey);}
  async function subId(env,endpoint){return prefix(env)+pushB64(await crypto.subtle.digest('SHA-256',pushEncoder.encode(endpoint)));}
  async function subscribe(env,endpoint){if(!validPushEndpoint(endpoint))throw Error('Invalid push endpoint');await config(env);await put(env,await subId(env,endpoint),{kind:'push-sub',active:true,endpoint});}
  async function unsubscribe(env,endpoint){if(!validPushEndpoint(endpoint))throw Error('Invalid push endpoint');await put(env,await subId(env,endpoint),{kind:'push-sub',active:false});}
  async function authorization(env,endpoint){const c=await config(env),header=pushB64(pushEncoder.encode(JSON.stringify({typ:'JWT',alg:'ES256'}))),claims=pushB64(pushEncoder.encode(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+3600,sub:'mailto:'+env.ADMIN_EMAIL}))),input=header+'.'+claims,key=await crypto.subtle.importKey('jwk',c.privateKey,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,pushEncoder.encode(input));return 'vapid t='+input+'.'+pushB64(sig)+', k='+c.publicKey;}
  async function broadcast(env){let after=null;const summary={sent:0,failed:0,expired:0};for(;;){const r=await upstream(env,'/rest/v1/tournament_data?select=id,state&id=like.'+encodeURIComponent(prefix(env)+'*')+'&state->>active=eq.true&order=id&limit=100'+(after?'&id=gt.'+encodeURIComponent(after):''),{admin:true});if(!r.ok)throw Error('Push subscribers unavailable');const entries=r.data||[];if(!entries.length)break;for(let start=0;start<entries.length;start+=10)await Promise.all(entries.slice(start,start+10).map(async row=>{try{const endpoint=row.state.endpoint;if(!validPushEndpoint(endpoint)){summary.failed++;return;}const response=await fetcher(endpoint,{method:'POST',headers:{Authorization:await authorization(env,endpoint),TTL:'300',Urgency:'normal',Topic:'dlr-results'},redirect:'error',signal:AbortSignal.timeout(8000)});await response.arrayBuffer();if(response.ok)summary.sent++;else if([404,410].includes(response.status)){await put(env,row.id,{kind:'push-sub',active:false});summary.expired++;}else summary.failed++;}catch{summary.failed++;}}));if(entries.length<100)break;after=entries[entries.length-1].id;}
  return summary;}
  return {config,subscribe,unsubscribe,broadcast};
}
