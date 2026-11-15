import test from 'node:test';
import assert from 'node:assert/strict';
import { HOME_LOCATIONS, FURNITURE, ROOM, homeInventory, initialHomeLayout, layoutIssue, normalizeHomeLayout, placementCorners } from '../shared/housing.js';

const piece=(id,itemId,x=0,z=0,rotation=0)=>({id,itemId,x,z,rotation});
const owned=homeInventory([]);

test('seven housing locations have distinct houses and outlooks while keeping the same usable room',()=>{
  assert.equal(HOME_LOCATIONS.length,7);assert.equal(new Set(HOME_LOCATIONS.map(l=>l.style)).size,7);
  assert.equal(new Set(HOME_LOCATIONS.map(l=>l.view)).size,7);
  assert.ok(HOME_LOCATIONS.every(l=>l.name&&l.houseName&&l.sky&&l.floor&&l.wall));
  assert.equal(ROOM.width,8);assert.equal(ROOM.depth,6);
  assert.equal(layoutIssue(initialHomeLayout(),owned),null);
});
test('free positions and rotations survive validation without snapping to a grid',()=>{
  const layout=[piece('chair','chair-oak',.123,-.789,37.25)];const before=structuredClone(layout);
  assert.deepEqual(normalizeHomeLayout(layout,owned),layout);assert.deepEqual(layout,before);
  assert.equal(placementCorners(layout[0]).length,4);
});
test('walls and rotated footprints restrict furniture, and rugs can go underneath it',()=>{
  assert.match(layoutIssue([piece('bed','bed-oak',3.7,0)],owned),/Wand/);
  assert.match(layoutIssue([piece('bed','bed-oak',3,0,45)],owned),/Wand/);
  assert.match(layoutIssue([piece('chair','chair-oak'),piece('table','table-oak')],owned),/Möbelstück/);
  assert.equal(layoutIssue([piece('rug','rug-woven'),piece('table','table-oak')],owned),null);
  assert.equal(layoutIssue([piece('chair','chair-oak',-1.1,0,45),piece('table','table-oak',.6,0,30)],owned),null);
});
test('collected furniture and trophies require secured achievements and quantity cannot be forged',()=>{
  const found=homeInventory(['pet-firefly','trophy-golem','trophy-tower-gold']);
  assert.ok(found.some(i=>i.itemId==='lamp-firefly'));
  assert.ok(found.some(i=>i.itemId==='display-trophy-golem'));
  assert.equal(homeInventory(['trophy-golem','trophy-golem']).find(i=>i.itemId==='display-trophy-golem').quantity,1);
  assert.match(layoutIssue([piece('prize','display-trophy-golem')],owned),/freigeschaltet/);
  assert.equal(layoutIssue([piece('prize','display-trophy-golem')],found),null);
  assert.match(layoutIssue([piece('a','chair-oak',-2),piece('b','chair-oak'),piece('c','chair-oak',2)],owned),/Exemplare/);
  assert.equal(FURNITURE.filter(i=>i.kind==='trophy').length,4);
});
test('invalid placement IDs, excessive layouts and non-finite coordinates are rejected',()=>{
  for(const layout of [[piece('same','chair-oak'),piece('same','chair-oak',2)], [piece('<img>','chair-oak')], [piece('x','missing')], [piece('x','chair-oak',NaN)], [piece('x','chair-oak',0,0,360)],Array.from({length:41},(_,i)=>piece(String(i),'chair-oak'))]) assert.ok(layoutIssue(layout,owned));
  const safe=normalizeHomeLayout([{...piece('safe','chair-oak'),y:999,ownerId:'other'}],owned);
  assert.equal('y' in safe[0],false);assert.equal('ownerId' in safe[0],false);
});
