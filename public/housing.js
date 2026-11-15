import { initialHomeLayout, homeLocationFor, furnitureFor, layoutIssue } from '../shared/housing.js';
import { mountHousing3D, locationIllustration } from './housing3d.js';

const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const clone=value=>structuredClone(value);
const glyphs={bed:'▰',table:'▤',chair:'♧',rug:'◇',shelf:'▥',plant:'❧',lamp:'✧',sofa:'▰',cabinet:'▦',chest:'▣',plinth:'♜',trophy:'★',statue:'⬡',telescope:'✦'};
let draft=null,dirty=false,history=[],selectedId=null,controller=null,dragging=false,mode='room',filter='owned',choosing=false,latestState=null;

function prepare(state){
  const house=state.home?.house;
  if(!draft||draft.userId!==state.user.id||(!dirty&&draft.version!==(house?.version||0))){
    draft={userId:state.user.id,version:house?.version||0,locationId:house?.locationId||null,placements:house?clone(house.placements):initialHomeLayout()};
    dirty=false;history=[];selectedId=null;choosing=!draft.locationId;
  }
  latestState=state;
}
function remember(){history.push({locationId:draft.locationId,placements:clone(draft.placements)});if(history.length>30)history.shift();}
function issue(message){const node=document.querySelector('[data-home-status]');if(node)node.textContent=message;}
function changed(){dirty=true;syncPanels();}
function usedCount(id){return draft.placements.filter(p=>p.itemId===id).length;}

function inspector(e=escapeHTML){
  const selected=draft.placements.find(p=>p.id===selectedId),item=furnitureFor(selected?.itemId);
  if(mode==='outside')return '<h3>Dein Haus von außen</h3><p>Wechsle zur Raumansicht oder zum Grundriss, um deine Möbel einzurichten.</p>';
  if(!selected)return '<span class="eyebrow">PLATZ FÜR DEINE IDEEN</span><h3>Wähle ein Möbelstück</h3><p>Ziehe ein Möbelstück an seinen Platz. Du kannst es auch antippen und anschließend den Boden antippen.</p><p>Mit den Pfeiltasten verschiebst du die Auswahl. R dreht sie; Escape hebt die Auswahl auf.</p>';
  return `<span class="eyebrow">AUSGEWÄHLT</span><h3>${e(item.name)}</h3><p>${item.kind==='trophy'?'Deine verdiente Trophäe steht auf einem eigenen Sockel.':'Frei verschieben und drehen. Möbel dürfen auf einem Teppich stehen.'}</p><div class="home-nudge" role="group" aria-label="Möbelstück fein verschieben"><button data-action="home-nudge" data-dx="0" data-dz="-.1" aria-label="Weiter nach hinten">↑</button><button data-action="home-nudge" data-dx="-.1" data-dz="0" aria-label="Nach links">←</button><button data-action="home-nudge" data-dx=".1" data-dz="0" aria-label="Nach rechts">→</button><button data-action="home-nudge" data-dx="0" data-dz=".1" aria-label="Weiter nach vorn">↓</button></div><div class="home-rotation"><button class="button outline" data-action="home-rotate" data-angle="-15" aria-label="15 Grad nach links drehen">↶</button><label for="home-rotation">Drehen · ${Math.round(selected.rotation)}°<input id="home-rotation" data-home-field="rotation" type="range" min="0" max="359" step="1" value="${selected.rotation}"></label><button class="button outline" data-action="home-rotate" data-angle="15" aria-label="15 Grad nach rechts drehen">↷</button></div><details class="home-fine"><summary>Feinposition</summary><label>Links / rechts<input type="number" step=".01" data-home-field="x" value="${selected.x}" aria-label="Position links oder rechts"></label><label>Hinten / vorn<input type="number" step=".01" data-home-field="z" value="${selected.z}" aria-label="Position hinten oder vorn"></label></details><div class="home-inspector-actions"><button class="button outline" data-action="home-remove">Zurück ins Lager</button><button class="text-button" data-action="home-deselect">Auswahl aufheben</button></div>`;
}
function storage(e=escapeHTML){
  const data=latestState.home,owned=new Map(data.owned.map(entry=>[entry.itemId,entry.quantity]));
  const items=data.catalogue.furniture.filter(item=>filter==='all'||filter==='trophies'&&item.kind==='trophy'||filter==='owned'&&owned.has(item.id));
  return `<div class="home-storage-heading"><div><span class="eyebrow">DEINE EINRICHTUNG</span><h2>Möbel & Erinnerungen</h2></div><span>${data.owned.length} / ${data.catalogue.furniture.length} entdeckt</span></div><div class="home-storage-tabs" role="group" aria-label="Einrichtung filtern">${[['owned','Mein Lager'],['all','Alle Entwürfe'],['trophies','Trophäen']].map(([id,name])=>`<button data-action="home-filter" data-filter="${id}" class="${filter===id?'selected':''}" aria-pressed="${filter===id}">${name}</button>`).join('')}</div><div class="home-furniture-grid">${items.map(item=>{
    const count=owned.get(item.id)||0,used=usedCount(item.id),available=count-used;
    return `<article class="home-furniture-card ${count?'owned':'locked'}" data-home-item="${item.id}"><span class="home-furniture-symbol" style="--furniture-color:${item.color}" aria-hidden="true">${glyphs[item.kind]||'✧'}</span><div><strong>${e(item.name)}</strong><small>${count?`${available} im Lager · ${used} aufgestellt`:e(item.source)}</small>${count?`<button class="button outline small" data-action="home-add" data-item-id="${item.id}" ${available>0&&mode!=='outside'?'':'disabled'}>${available>0?'Aufstellen':'Bereits aufgestellt'}</button>`:'<span class="home-lock-label">Im Abenteuer entdecken</span>'}</div></article>`;
  }).join('')||'<p>Hier wartet noch Platz für deine ersten Trophäen. Sichere besondere Erfolge im Turm, auf den Inseln oder gegen den Runengolem.</p>'}</div><p class="home-collection-note">Neue Möbel werden mit gesicherten Abenteuererfolgen freigeschaltet. Deine bereits verdienten Trophäen kannst du auf eigenen Sockeln ausstellen. Zurückgelegte Möbel bleiben in deinem Lager.</p>`;
}
function syncPanels(){
  const inspectorNode=document.querySelector('#home-inspector'),storageNode=document.querySelector('#home-storage');
  if(inspectorNode)inspectorNode.innerHTML=inspector();if(storageNode)storageNode.innerHTML=storage();
  const save=document.querySelector('[data-action="home-save"]');if(save)save.disabled=!dirty;
  const undo=document.querySelector('[data-action="home-undo"]');if(undo)undo.disabled=!history.length;
  const badge=document.querySelector('[data-home-save-state]');if(badge)badge.textContent=dirty?'Ungespeicherte Änderungen':'Alles gespeichert';
  for(const button of document.querySelectorAll('[data-action="home-view"]')){const active=button.dataset.mode===mode;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));}
}

export function renderHousing({state,e=escapeHTML,icon=()=>''}){
  prepare(state);
  if(choosing||!draft.locationId)return `<div class="housing-page"><div class="page-heading"><div><span class="eyebrow">DEIN ZUHAUSE IN AETHERIA</span><h1>Wo möchtest du wohnen<span class="title-dot">?</span></h1><p>Wähle deinen Wohnort. Hausstil und Fensteraussicht passen zur Stadt. Eine Grundausstattung steht für dich bereit.</p></div>${draft.locationId?'<button class="button outline" data-action="home-cancel-location">Zurück zum Einrichten</button>':''}</div><div class="home-location-grid">${state.home.catalogue.locations.map(location=>`<article class="home-location-card ${location.id===draft.locationId?'selected':''}"><div class="home-location-art">${locationIllustration(location)}</div><div><span class="eyebrow">${e(location.name)}</span><h2>${e(location.houseName)}</h2><p>${e(location.description)}</p><small>Fensterblick: ${e(location.view)}</small><button class="button primary" data-action="home-location" data-location="${location.id}">${location.id===draft.locationId?'Hier wohnst du':'Diesen Wohnort wählen'} ${icon('arrow','',17)}</button></div></article>`).join('')}</div></div>`;
  const location=homeLocationFor(draft.locationId);
  return `<div class="housing-page"><div class="page-heading"><div><span class="eyebrow">${e(location.name)} · DEIN ZUHAUSE</span><h1>${e(location.houseName)}<span class="title-dot">.</span></h1><p>${e(location.description)}</p></div><button class="button outline" data-action="home-choose-location">Wohnort wechseln ${icon('grid','',17)}</button></div><div class="home-toolbar"><div class="home-view-buttons" role="group" aria-label="Hausansicht">${[['room','Raumansicht'],['top','Grundriss'],['outside','Außenansicht']].map(([id,name])=>`<button data-action="home-view" data-mode="${id}" class="${mode===id?'selected':''}" aria-pressed="${mode===id}">${name}</button>`).join('')}</div><div class="home-save-controls"><span data-home-save-state>${dirty?'Ungespeicherte Änderungen':'Alles gespeichert'}</span><button class="button outline" data-action="home-undo" ${history.length?'':'disabled'}>↶ Rückgängig</button><button class="button primary" data-action="home-save" ${dirty?'':'disabled'}>${state.home.house?'Einrichtung speichern':'Einziehen & speichern'} ${icon('check','',17)}</button></div></div><div class="home-editor-grid"><section class="home-room-panel"><div class="home-room-label"><span>Fensterblick: ${e(location.view)}</span><small>Freies Platzieren · ohne Raster</small></div><div class="housing-stage" data-home-stage role="group" aria-label="Einrichtbares Haus in ${e(location.name)}"></div><p class="home-editor-status" data-home-status role="status">Möbel auswählen und ziehen – oder antippen und anschließend den neuen Platz antippen.</p></section><aside class="home-inspector" id="home-inspector">${inspector(e)}</aside></div><div class="home-secondary-actions"><span>${draft.placements.length} Gegenstände im Haus</span><button class="text-button" data-action="home-reload">Gespeicherten Stand laden / Änderungen verwerfen</button></div><section class="home-storage" id="home-storage">${storage(e)}</section></div>`;
}

export function mountHousing({state,register}){
  const host=document.querySelector('[data-home-stage]');if(!host||!draft?.locationId)return;
  latestState=state;
  register(host,()=>{
    const mounted=mountHousing3D(host,{locationId:draft.locationId,placements:draft.placements,selectedId,mode,owned:state.home.owned,
      onSelect(id){selectedId=id;const node=document.querySelector('#home-inspector');if(node)node.innerHTML=inspector();},
      onChange(placements){if(JSON.stringify(placements)===JSON.stringify(draft.placements))return;remember();draft.placements=placements;changed();},
      onDragState(active){dragging=active;},onIssue:issue});
    controller=mounted;
    return {dispose(){mounted.dispose();if(controller===mounted)controller=null;dragging=false;}};
  });
}
export function housingIsEditing(){return dragging||Boolean(dirty&&document.querySelector('[data-home-stage]'));}
export function resetHousingUI(){controller?.dispose();controller=null;draft=null;dirty=false;history=[];selectedId=null;dragging=false;mode='room';filter='owned';choosing=false;latestState=null;}
export function handleHousingChange(input,{toast}){
  const key=input.dataset.homeField;if(!['x','z','rotation'].includes(key)||!controller||!selectedId)return false;
  const value=input.value.trim();if(!value||!Number.isFinite(Number(value))){toast('Bitte eine gültige Position eingeben.',true);return true;}
  if(!controller.move(selectedId,{[key]:Number(value)}))syncPanels();return true;
}

export async function handleHousingAction(button,{state,api,mutate,render,toast}){
  const action=button.dataset.action;if(!action?.startsWith('home-'))return false;
  prepare(state);
  if(action==='home-choose-location'){choosing=true;render();return true;}
  if(action==='home-cancel-location'){choosing=false;render();return true;}
  if(action==='home-location'){
    if(!homeLocationFor(button.dataset.location))return true;
    if(draft.locationId!==button.dataset.location){remember();draft.locationId=button.dataset.location;dirty=true;}
    choosing=false;render();return true;
  }
  if(action==='home-filter'){if(['owned','all','trophies'].includes(button.dataset.filter))filter=button.dataset.filter;syncPanels();return true;}
  if(action==='home-view'){if(['room','top','outside'].includes(button.dataset.mode)){mode=button.dataset.mode;controller?.update({mode});syncPanels();}return true;}
  if(action==='home-deselect'){selectedId=null;controller?.select(null);syncPanels();return true;}
  if(action==='home-rotate'||action==='home-nudge'){
    const p=draft.placements.find(entry=>entry.id===selectedId);if(!p||!controller)return true;
    controller.move(p.id,action==='home-rotate'?{rotation:p.rotation+Number(button.dataset.angle)}:{x:p.x+Number(button.dataset.dx),z:p.z+Number(button.dataset.dz)});return true;
  }
  if(action==='home-add'){
    const itemId=button.dataset.itemId,item=furnitureFor(itemId);if(!item||!state.home.owned.some(entry=>entry.itemId===itemId&&entry.quantity>usedCount(itemId)))return true;
    const id=globalThis.crypto?.randomUUID?.()||`home-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
    const candidates=[];for(let x=-3.5;x<=3.5;x+=.25)for(let z=-2.5;z<=2.5;z+=.25)candidates.push({id,itemId,x,z,rotation:0});
    candidates.sort((a,b)=>a.x*a.x+a.z*a.z-b.x*b.x-b.z*b.z);
    const placement=candidates.find(p=>!layoutIssue([...draft.placements,p],state.home.owned));
    if(!placement){toast('Hier ist gerade kein freier Platz. Lege ein anderes Möbelstück ins Lager zurück.',true);return true;}
    remember();draft.placements.push(placement);selectedId=id;controller?.update({placements:draft.placements,selectedId});changed();issue(`${item.name} ist aufgestellt. Ziehe es an deinen Wunschplatz.`);return true;
  }
  if(action==='home-remove'){
    if(!selectedId)return true;remember();draft.placements=draft.placements.filter(p=>p.id!==selectedId);selectedId=null;controller?.update({placements:draft.placements,selectedId});changed();issue('Das Möbelstück liegt wieder in deinem Lager.');return true;
  }
  if(action==='home-undo'){
    const previous=history.pop();if(!previous)return true;const previousLocation=draft.locationId;Object.assign(draft,previous);selectedId=null;dirty=true;
    if(previousLocation===draft.locationId&&controller&&homeLocationFor(draft.locationId)){controller.update({locationId:draft.locationId,placements:draft.placements,selectedId});syncPanels();}else render();return true;
  }
  if(action==='home-reload'){
    await mutate(async()=>{const result=await api('/home');state.home=result.home;draft=null;dirty=false;history=[];selectedId=null;toast('Der gespeicherte Hausstand ist geladen.');});return true;
  }
  if(action==='home-save'){
    await mutate(async()=>{const result=await api('/home',{version:draft.version,locationId:draft.locationId,placements:draft.placements});state.home=result.home;draft.version=result.home.house.version;draft.placements=clone(result.home.house.placements);dirty=false;history=[];toast('Dein Zuhause ist gespeichert.');});return true;
  }
  return false;
}
