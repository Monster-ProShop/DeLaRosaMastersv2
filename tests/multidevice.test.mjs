import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,mergeMatchScores} from '../server.js';
import {mock,fixture} from './security.test.mjs';
import {publicResults} from '../tournament.js';
const origin='https://app.test';
function req(path,body,cookies=''){return new Request(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookies},body:body?JSON.stringify(body):undefined});}
test('refresh survives expired access token, rotates HttpOnly cookies and signs out only this device',async()=>{
 const m=mock();let logout='',refreshCalls=0;
 const fetcher=async(url,opts)=>{if(url.includes('grant_type=refresh_token')){refreshCalls++;assert.equal(JSON.parse(opts.body).refresh_token,'refresh-one');return Response.json({access_token:'valid-token',refresh_token:'refresh-two',expires_in:3600});}if(url.includes('/auth/v1/logout')){logout=url;return Response.json({});}return m.fetcher(url,opts);};
 const handle=createHandler({adminHTML:'ADMIN'},fetcher);
 const r=await handle(req('/admin/',null,'__Host-dlr_refresh=refresh-one'),m.env);
 assert.equal(r.status,200);assert.equal(await r.text(),'ADMIN');assert.equal(refreshCalls,1);
 const cookies=r.headers.getSetCookie();assert.equal(cookies.length,2);assert(cookies.every(c=>c.includes('HttpOnly; Secure; SameSite=Strict')));assert(cookies.some(c=>c.includes('refresh-two')&&c.includes('34560000')));
 const out=await handle(req('/api/auth/logout',{},'__Host-dlr_session=valid-token; __Host-dlr_refresh=refresh-two'),m.env);assert.equal(out.status,200);assert(logout.endsWith('scope=local'));assert(out.headers.getSetCookie().every(c=>c.includes('Max-Age=0')));
 assert.equal((await handle(req('/admin/',null,'__Host-dlr_session=valid-token'),m.env)).status,200);
});
test('temporary refresh outage preserves cookies; rejected refresh fails closed',async()=>{
 const m=mock();let status=503;const handle=createHandler({},async(url,opts)=>url.includes('grant_type=refresh_token')?Response.json({}, {status}):m.fetcher(url,opts));
 let r=await handle(req('/api/admin/state',null,'__Host-dlr_refresh=refresh-one'),m.env);assert.equal(r.status,503);assert.equal(r.headers.getSetCookie().length,0);
 status=400;r=await handle(req('/api/admin/state',null,'__Host-dlr_refresh=refresh-one'),m.env);assert.equal(r.status,401);assert.equal(r.headers.getSetCookie().length,2);
});
function scoredState(){const s=fixture();s.teams.push(...s.teams.map(t=>({...structuredClone(t),id:t.id+'x'})));s.games=[{number:1,matches:[{id:'M1',aId:'T0',bId:'T1',bowlers:[],completed:false},{id:'M2',aId:'T0x',bId:'T1x',bowlers:[],completed:false}]}];return s;}
function score(s,index,n){Object.assign(s.games[0].matches[index],{bowlers:[0,1,2].map(pos=>({pos,a:n,b:180})),completed:true,teamScoreA:n*3,teamScoreB:540});}
test('two devices save independent matches and public results include both',async()=>{
 const m=mock(),cookies='__Host-dlr_session=valid-token',base=scoredState();
 let r=await m.handler(req('/api/admin/state',{state:base,revision:0},cookies),m.env);assert.equal(r.status,200);
 const a=structuredClone(base),b=structuredClone(base);score(a,0,200);score(b,1,210);
 r=await m.handler(req('/api/admin/state',{state:a,baseState:base,revision:1},cookies),m.env);assert.equal(r.status,200);
 r=await m.handler(req('/api/admin/state',{state:b,baseState:base,revision:1},cookies),m.env);assert.equal(r.status,200);
 const saved=await r.json();assert.equal(saved.state.games[0].matches[0].teamScoreA,600);assert.equal(saved.state.games[0].matches[1].teamScoreA,630);
 const conflict=structuredClone(base);score(conflict,0,250);r=await m.handler(req('/api/admin/state',{state:conflict,baseState:base,revision:1},cookies),m.env);assert.equal(r.status,409);
 const pub=await (await m.handler(req('/api/results'),m.env)).json();assert(pub.games[0].matches.every(x=>x.completed));
});
test('merge rejects tournament edits and changed opponents; Super Senior standings have eligibility',()=>{
 const base=scoredState(),a=structuredClone(base),now=structuredClone(base);score(a,0,200);a.settings.example=1;assert.equal(mergeMatchScores(base,a,now),null);delete a.settings.example;now.games[0].matches[0].aId='T0x';assert.equal(mergeMatchScores(base,a,now),null);
 base.teams[0].bowlers[0].superSenior=true;const players=publicResults(base).standings.players;assert.equal(players.filter(p=>p.superSenior).length,1);
});
