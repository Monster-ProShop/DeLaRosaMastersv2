import test from 'node:test';
import assert from 'node:assert/strict';
import {createPushService,scoreVersion,validPushEndpoint,createHandler} from '../server.js';
import {emptyState} from '../tournament.js';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test',SUPABASE_PUBLISHABLE_KEY:'test',TOURNAMENT_ID:'test',ADMIN_EMAIL:'admin@example.com'};
function storage(){
 const rows=new Map();
 const upstream=async(e,path,o={})=>{const u=new URL(path,e.SUPABASE_URL);let data;
 if(u.pathname.endsWith('/save_tournament_state')){const b=o.data,old=rows.get(b.p_id);if((old?.revision??-1)!==b.p_expected_revision)data={conflict:true};else {const row={id:b.p_id,state:structuredClone(b.p_state),revision:b.p_expected_revision+1};rows.set(row.id,row);data={revision:row.revision};}}
 else if(o.method==='POST'){rows.set(o.data.id,{...o.data,revision:0});data=null;}
 else {data=[...rows.values()];for(const id of u.searchParams.getAll('id')){if(id.startsWith('eq.'))data=data.filter(r=>r.id===id.slice(3));if(id.startsWith('like.'))data=data.filter(r=>r.id.startsWith(id.slice(5,-1)));if(id.startsWith('gt.'))data=data.filter(r=>r.id>id.slice(3));}if(u.searchParams.has('state->>active'))data=data.filter(r=>r.state.active);data.sort((a,b)=>a.id<b.id?-1:1);data=data.slice(0,Number(u.searchParams.get('limit'))||10000);}
 return {ok:true,data:structuredClone(data)};};return {rows,upstream};
}
test('push endpoints reject non-push hosts and credential/redirect targets',()=>{
 for(const url of ['http://fcm.googleapis.com/x','https://evil.test/x','https://fcm.googleapis.com.evil.test/x','https://user@fcm.googleapis.com/x','https://fcm.googleapis.com:444/x','https://127.0.0.1/x'])assert.equal(validPushEndpoint(url),false);
 for(const url of ['https://fcm.googleapis.com/fcm/send/x','https://web.push.apple.com/x','https://updates.push.services.mozilla.com/wpush/v2/x'])assert.equal(validPushEndpoint(url),true);
});
test('subscriptions persist idempotently; VAPID is valid ES256 and sends a bodyless notification',async()=>{
 const db=storage(),calls=[],service=createPushService(db.upstream,async(url,opts)=>{calls.push({url,opts});return new Response(null,{status:201});});
 const endpoint='https://web.push.apple.com/test';await service.subscribe(env,endpoint);await service.subscribe(env,endpoint);
 assert.equal(db.rows.size,2);const c=await service.config(env);assert.equal(c.publicKey.length,87);
 assert.deepEqual(await service.broadcast(env),{sent:1,failed:0,expired:0});assert.equal(calls[0].opts.body,undefined);
 const token=calls[0].opts.headers.Authorization.match(/^vapid t=(.+), k=(.+)$/);assert.equal(token[2],c.publicKey);
 const [header,claims,sig]=token[1].split('.'),payload=JSON.parse(Buffer.from(claims,'base64url'));assert.equal(payload.aud,'https://web.push.apple.com');assert(payload.exp>Date.now()/1000&&payload.exp<Date.now()/1000+86400);
 const key=await crypto.subtle.importKey('raw',Buffer.from(c.publicKey,'base64url'),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);assert(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,Buffer.from(sig,'base64url'),new TextEncoder().encode(header+'.'+claims)));
 await service.unsubscribe(env,endpoint);assert.equal((await service.broadcast(env)).sent,0);
});
test('expired subscriptions do not skip later pages; failures are isolated',async()=>{
 const db=storage(),service=createPushService(db.upstream,async url=>new Response(null,{status:url.endsWith('/expired')?410:url.endsWith('/failed')?503:201}));
 await service.config(env);for(let i=0;i<205;i++)db.rows.set('push-sub:test:'+String(i).padStart(3,'0'),{id:'push-sub:test:'+String(i).padStart(3,'0'),state:{active:true,endpoint:'https://fcm.googleapis.com/'+(i<100?'expired':i===100?'failed':'valid')}});
 assert.deepEqual(await service.broadcast(env),{sent:104,failed:1,expired:100});
});
test('only saved score changes alter notification signature',()=>{
 const state=emptyState(),initial=scoreVersion(state);state.calcutta={sales:{a:{cost:100}}};assert.equal(scoreVersion(state),initial);
 state.games=[{number:1,matches:[{id:'m',completed:false,bowlers:[{pos:0,a:200,b:180}]}]}];assert.equal(scoreVersion(state),initial);
 state.games[0].matches[0].completed=true;assert.notEqual(scoreVersion(state),initial);const saved=scoreVersion(state);assert.equal(scoreVersion(structuredClone(state)),saved);state.games[0].matches[0].bowlers[0].a=201;assert.notEqual(scoreVersion(state),saved);
});
test('public config never exposes private signing material; only successful changed saves broadcast',async()=>{
 const db=storage(),sent=[];const initial=emptyState();initial.teams=[0,1].map(i=>({id:'T'+i,name:'Team'+i,shift:1,bowlers:[0,1,2].map(j=>({name:'P'+i+j,gender:'Male',average:190,handicap:20}))}));db.rows.set('test',{id:'test',state:initial,revision:0});
 const fetcher=async(url,opts)=>{const u=new URL(url);if(u.hostname==='fcm.googleapis.com'){sent.push(url);return new Response(null,{status:201});}if(u.pathname==='/auth/v1/user')return Response.json({id:'admin',email:env.ADMIN_EMAIL,email_confirmed_at:'2026-01-01'});if(u.pathname.endsWith('/tournament_admins'))return Response.json([{user_id:'admin'}]);if(u.pathname.endsWith('/tournament_auth_attempt'))return Response.json(true);const r=await db.upstream(env,u.pathname+u.search,{method:opts.method,data:opts.body?JSON.parse(opts.body):undefined});return Response.json(r.data);};
 const handler=createHandler({},fetcher),request=(path,body)=>new Request('https://app.test'+path,{method:body?'POST':'GET',headers:{Origin:'https://app.test','Content-Type':'application/json',Cookie:'__Host-dlr_session=valid'},body:body?JSON.stringify(body):undefined});
 const config=await (await handler(request('/api/push/config'),env)).json();assert.deepEqual(Object.keys(config),['publicKey']);
 assert.equal((await handler(request('/api/push/subscribe',{endpoint:'https://fcm.googleapis.com/test'}),env)).status,200);
 const changed=structuredClone(initial);changed.games=[{number:1,matches:[{id:'m',aId:'T0',bId:'T1',completed:true,bowlers:[0,1,2].map(pos=>({pos,a:200,b:180})),teamScoreA:0,teamScoreB:0}]}];
 assert.equal((await handler(request('/api/admin/state',{state:changed,revision:0}),env)).status,200);assert.equal(sent.length,1);
 assert.equal((await handler(request('/api/admin/state',{state:changed,revision:1}),env)).status,200);assert.equal(sent.length,1);
 changed.games[0].matches[0].bowlers[0].a=201;assert.equal((await handler(request('/api/admin/state',{state:changed,revision:1}),env)).status,409);assert.equal(sent.length,1);
});
