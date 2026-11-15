import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../server.js';
import { initialHomeLayout } from '../shared/housing.js';

async function fixture(t,options={}){
  const app=createApp({dbPath:':memory:',...options});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  let closed=false;const close=async()=>{if(!closed){closed=true;await app.close();}};t.after(close);
  const origin=`http://127.0.0.1:${app.server.address().port}`;
  function client(){let cookie='';return{async request(path,body){const response=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return{status:response.status,body:await response.json()};},async login(email='lina@demo.schule'){return this.request('/api/auth/login',{email,password:'Klassenhelden!2026'});}};}
  const student=client();await student.login();return{...app,origin,close,client,student};
}
const ok=response=>{assert.equal(response.status,200,JSON.stringify(response.body));return response.body;};
const homeRequest=(locationId='lysara',version=0,placements=initialHomeLayout())=>({locationId,version,placements});

test('a student chooses a home without spending school progress and location changes keep the layout',async t=>{
  const {db,student}=await fixture(t);const before=db.prepare("SELECT * FROM users WHERE id='demo-lina'").get();
  const initial=ok(await student.request('/api/home')).home;assert.equal(initial.house,null);assert.equal(initial.catalogue.locations.length,7);
  const created=ok(await student.request('/api/home',homeRequest())).home;assert.equal(created.house.version,1);
  const changed=ok(await student.request('/api/home',homeRequest('silverwind',1,created.house.placements))).home;
  assert.equal(changed.house.locationId,'silverwind');assert.deepEqual(changed.house.placements,created.house.placements);
  assert.deepEqual(db.prepare("SELECT * FROM users WHERE id='demo-lina'").get(),before);
  assert.deepEqual(ok(await student.request('/api/state')).home,changed);
});
test('invalid layouts, wrong quantities, locked trophies and stale saves never change the saved house',async t=>{
  const {db,student}=await fixture(t);const saved=ok(await student.request('/api/home',homeRequest())).home;
  const before=db.prepare("SELECT * FROM player_homes WHERE user_id='demo-lina'").get();
  for(const body of [homeRequest('missing',1),homeRequest('lysara',1,[{id:'x',itemId:'display-trophy-golem',x:0,z:0,rotation:0}]),homeRequest('lysara',1,[{id:'x',itemId:'chair-oak',x:99,z:0,rotation:0}]),homeRequest('lysara',1,[{id:'a',itemId:'chair-oak',x:0,z:0,rotation:0},{id:'b',itemId:'chair-oak',x:0,z:0,rotation:0}]),homeRequest('zephyria',0)]){
    const response=await student.request('/api/home',body);assert.ok(response.status>=400&&response.status<500,JSON.stringify(response));assert.deepEqual(db.prepare("SELECT * FROM player_homes WHERE user_id='demo-lina'").get(),before);
  }
  assert.deepEqual(ok(await student.request('/api/home')).home,saved);
});
test('role checks, per-player isolation and concurrent versions protect ownership',async t=>{
  const {db,student,client}=await fixture(t),teacher=client(),ben=client();await teacher.login('lehrer@demo.schule');await ben.login('ben@demo.schule');
  assert.equal((await teacher.request('/api/home')).status,403);assert.equal((await teacher.request('/api/home',homeRequest())).status,403);
  assert.equal(ok(await teacher.request('/api/state')).home,null);
  const results=await Promise.all([student.request('/api/home',{...homeRequest('nebelheim'),userId:'demo-ben'}),student.request('/api/home',homeRequest('aethkern'))]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(ok(await ben.request('/api/home')).home.house,null);
  assert.equal(db.prepare('SELECT count(*) AS count FROM player_homes').get().count,1);
});
test('secured trophies unlock placeable furniture; unbanked adventure rewards do not',async t=>{
  const {db,student}=await fixture(t);assert.ok(!ok(await student.request('/api/home')).home.owned.some(item=>item.itemId==='display-trophy-golem'));
  db.prepare('INSERT INTO cosmetic_unlocks VALUES(?,?,?)').run('demo-lina','trophy-golem',new Date().toISOString());
  const unlocked=ok(await student.request('/api/home')).home;assert.ok(unlocked.owned.some(item=>item.itemId==='lamp-crystal'));
  const placement={id:'earned-trophy',itemId:'display-trophy-golem',x:.13,z:-.23,rotation:27};
  const house=ok(await student.request('/api/home',homeRequest('zephyria',0,[placement]))).home.house;assert.deepEqual(house.placements,[placement]);
});
test('home location, free coordinates and trophies survive restarting the same existing database',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'aetheria-home-'));t.after(()=>rm(dir,{recursive:true,force:true}));const dbPath=join(dir,'game.sqlite');
  const first=await fixture(t,{dbPath});const layout=[{id:'chair',itemId:'chair-oak',x:-1.234,z:.567,rotation:43}];
  const saved=ok(await first.student.request('/api/home',homeRequest('aether-grove',0,layout))).home;
  await first.close();const second=await fixture(t,{dbPath});assert.deepEqual(ok(await second.student.request('/api/home')).home,saved);
});
test('house editor and shared dependencies are served locally while database internals remain private',async t=>{
  const {origin}=await fixture(t);
  for(const path of ['/housing.js','/housing3d.js','/housing.css','/shared/housing.js']){const response=await fetch(origin+path);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),path.endsWith('.css')?/text\/css/:/javascript/);}
  assert.equal((await fetch(origin+'/lib/housing.js')).status,404);
});
