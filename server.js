import {publicResults,validateState,emptyState} from './tournament.js';
const COOKIE='__Host-dlr_session';
class HTTPError extends Error{constructor(status,message){super(message);this.status=status;}}
const baseHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY'};
function json(value,status=200,extra={}){return new Response(JSON.stringify(value),{status,headers:{...baseHeaders,'Content-Type':'application/json; charset=utf-8',...extra}});}
function tokenFrom(request){return (request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);}
function cookie(token,age){return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.max(0,Math.min(age,3600))}`;}
function writeOrigin(request){const origin=request.headers.get('Origin');if(origin!==new URL(request.url).origin)throw new HTTPError(403,'Origin not allowed.');if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new HTTPError(415,'JSON required.');}
async function body(request,max=4*1024*1024){if(Number(request.headers.get('Content-Length'))>max)throw new HTTPError(413,'Request is too large.');const reader=request.body?.getReader();if(!reader)throw new HTTPError(400,'JSON required.');let size=0,parts=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new HTTPError(413,'Request is too large.');}parts.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new HTTPError(400,'Invalid JSON.');}}
export function createHandler(assets={},fetcher=fetch){
  async function upstream(env,path,{method='GET',data,admin=false,token}={}){
    const key=admin?env.SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_PUBLISHABLE_KEY;
    if(!key||!env.SUPABASE_URL)throw new HTTPError(503,'Server setup is incomplete.');
    const response=await fetcher(env.SUPABASE_URL+path,{method,headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:admin&&key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(15000)});
    let result;try{result=await response.json();}catch{result=null;}
    return {ok:response.ok,status:response.status,data:result};
  }
  async function authorize(env,token){
    if(!token||token.length>12000)throw new HTTPError(401,'Please sign in again.');
    const response=await upstream(env,'/auth/v1/user',{token});const user=response.data;
    if(!response.ok||!user?.id||!user.email_confirmed_at||String(user.email).toLowerCase()!==env.ADMIN_EMAIL.toLowerCase())throw new HTTPError(401,'Administrator sign-in required.');
    const membership=await upstream(env,'/rest/v1/tournament_admins?select=user_id&user_id=eq.'+encodeURIComponent(user.id),{admin:true});
    if(!membership.ok)throw new HTTPError(503,'Administrator permissions are not configured.');
    if(!Array.isArray(membership.data)||membership.data.length!==1)throw new HTTPError(403,'This account is not authorized.');return user;
  }
  async function rateLimit(env,request,route){
    const input=(request.headers.get('CF-Connecting-IP')||'local')+'|'+route;
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input)))).map(b=>b.toString(16).padStart(2,'0')).join('');
    for(const [bucket,limit,window] of [[hash,route==='code'?3:10,600],['admin-global-'+route,route==='code'?10:60,600]]){
      const r=await upstream(env,'/rest/v1/rpc/tournament_auth_attempt',{method:'POST',admin:true,data:{p_bucket:bucket,p_limit:limit,p_window_seconds:window}});
      if(!r.ok)throw new HTTPError(503,'Authentication setup is incomplete.');if(r.data!==true)throw new HTTPError(429,'Too many attempts. Try again in 10 minutes.');
    }
  }
  async function load(env){const r=await upstream(env,'/rest/v1/tournament_data?select=state,revision,updated_at&id=eq.'+encodeURIComponent(env.TOURNAMENT_ID),{admin:true});if(!r.ok)throw new HTTPError(503,'Tournament database is unavailable.');return r.data?.[0]||{state:emptyState(),revision:-1,updated_at:null};}
  return async function handle(request,env){
    try{
      const url=new URL(request.url),path=url.pathname;
      if(path.startsWith('/api/')&&request.method==='POST')writeOrigin(request);
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
        await authorize(env,r.data.access_token);return json({ok:true},200,{'Set-Cookie':cookie(r.data.access_token,r.data.expires_in||3600)});
      }
      if(path==='/api/auth/logout'&&request.method==='POST'){
        const token=tokenFrom(request);if(token)await upstream(env,'/auth/v1/logout',{method:'POST',token}).catch(()=>{});return json({ok:true},200,{'Set-Cookie':cookie('',0)});
      }
      if(path==='/api/results'&&request.method==='GET'){const row=await load(env);return json({revision:row.revision,updatedAt:row.updated_at,...publicResults(row.state)});}
      if(path==='/api/admin/state'){
        await authorize(env,tokenFrom(request));
        if(request.method==='GET')return json(await load(env));
        if(request.method==='POST'){
          const b=await body(request);if(!Number.isSafeInteger(b.revision)||b.revision< -1)throw new HTTPError(400,'Invalid revision.');
          try{validateState(b.state);}catch(e){throw new HTTPError(400,e.message);}
          const r=await upstream(env,'/rest/v1/rpc/save_tournament_state',{method:'POST',admin:true,data:{p_id:env.TOURNAMENT_ID,p_state:b.state,p_expected_revision:b.revision}});
          if(!r.ok)throw new HTTPError(503,'Could not save. Keep this window open and export a backup.');if(r.data?.conflict)throw new HTTPError(409,'Another session changed the tournament. Export your edits, then reload before continuing.');return json({revision:r.data.revision});
        }
        throw new HTTPError(405,'Method not allowed.');
      }
      if(path.startsWith('/api/'))throw new HTTPError(404,'Not found.');
      if(path==='/admin')return Response.redirect(url.origin+'/admin/',302);
      if(path.startsWith('/admin/')){
        try{await authorize(env,tokenFrom(request));}catch(e){if(e.status===401||e.status===403){if(path==='/admin/')return new Response(null,{status:302,headers:{...baseHeaders,Location:'/login','Set-Cookie':cookie('',0)}});}throw e;}
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
  };
}
