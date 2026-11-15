import * as THREE from './vendor/three.module.min.js';
import { ROOM, homeLocationFor, furnitureFor, layoutIssue } from '../shared/housing.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const clone = value => structuredClone(value);
const round = value => Math.round(value * 100) / 100;

export function locationIllustration(location) {
  const l = location || homeLocationFor('lysara');
  const forest = ['canopy','grove'].includes(l.style), clouds = ['cloud','harbor'].includes(l.style);
  return `<svg viewBox="0 0 300 180" aria-hidden="true"><path fill="${l.sky}" d="M0 0h300v180H0Z"/><circle cx="245" cy="36" r="19" fill="#f0dfaa" opacity=".8"/>${forest ? '<path d="M0 100 25 30l30 70 24-65 28 65 25-76 35 76 24-65 29 65 38-73 42 76v77H0Z" fill="#427c68"/>' : clouds ? '<g fill="#eef5ef" opacity=".7"><ellipse cx="52" cy="80" rx="80" ry="22"/><ellipse cx="255" cy="109" rx="76" ry="18"/></g>' : `<path d="M0 121 72 55l51 63 68-68 109 70v60H0Z" fill="${l.style === 'desert' ? '#b88f73' : '#779a94'}"/>`}<path d="M0 145Q75 115 153 146t147-9v43H0Z" fill="${forest ? '#77996e' : l.style === 'desert' ? '#d9bd8e' : '#91ae94'}"/>${l.style === 'harbor' ? '<path d="M0 55Q97 6 169 60t131-11" fill="none" stroke="#9ae4d6" stroke-width="14" opacity=".65"/>' : ''}<path d="M82 91h136v74H82Z" fill="${l.wall}" stroke="${l.trim}" stroke-width="3"/><path d="m65 95 86-66 87 66Z" fill="${l.roof}" stroke="${l.trim}" stroke-width="3"/><path d="M141 164v-45a15 15 0 0 1 30 0v45" fill="${l.trim}"/><g fill="#dce9c9" stroke="${l.trim}" stroke-width="4"><path d="M101 111h24v27h-24Z"/><path d="M184 111h24v27h-24Z"/></g>${forest ? '<path d="M79 165v15m119-15v15" stroke="#655643" stroke-width="11"/><path d="M73 75q-29-6-37 25m188-10q35-10 49 14" fill="none" stroke="#477c58" stroke-width="8"/>' : ''}${l.style === 'workshop' ? '<path d="M196 51V27h18v43" fill="#72767b"/><circle cx="150" cy="75" r="14" fill="none" stroke="#d5b773" stroke-width="6"/>' : ''}${l.style === 'town' ? '<path d="M85 100v62m129-62v62M83 99l130 62M214 99 83 161" stroke="#735b45" stroke-width="7"/>' : ''}</svg>`;
}

function disposeTree(root) {
  const geometries = new Set(), materials = new Set();
  root.traverse(node => { if (node.geometry) geometries.add(node.geometry); for (const m of Array.isArray(node.material) ? node.material : [node.material]) if (m) materials.add(m); });
  for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); root.removeFromParent();
}
const mat = color => new THREE.MeshStandardMaterial({ color, roughness:.86, flatShading:true });
const basic = color => new THREE.MeshBasicMaterial({ color });
function mesh(parent, geometry, material, at = [0,0,0]) { const m = new THREE.Mesh(geometry, material); m.position.set(...at); parent.add(m); return m; }
const box = (p,m,at,size) => mesh(p,new THREE.BoxGeometry(...size),m,at);
const cyl = (p,m,at,r,h,n=8) => mesh(p,new THREE.CylinderGeometry(r,r,h,n),m,at);
const ball = (p,m,at,size) => { const b=mesh(p,new THREE.SphereGeometry(1,8,5),m,at);b.scale.set(...size);return b; };

function furnitureModel(item) {
  const p = new THREE.Group(), color = mat(item.color), wood = mat('#8e684b'), trim = mat('#d5bd8a'), pale = mat('#e7dfc6'), dark = mat('#3d505b');
  const w=item.width,d=item.depth;
  const legs = (h=.65) => { for (const x of [-1,1]) for (const z of [-1,1]) box(p,wood,[x*(w/2-.11),h/2,z*(d/2-.11)],[.12,h,.12]); };
  if (item.kind === 'bed') {
    box(p,wood,[0,.23,0],[w,.3,d]);box(p,color,[0,.48,0],[w-.08,.25,d-.1]);box(p,pale,[0,.64,-d*.3],[w-.25,.13,.4]);
    box(p,wood,[0,.61,-d/2+.07],[w,.85,.14]);box(p,trim,[0,.88,-d/2+.07],[w+.02,.09,.16]);
  } else if (item.kind === 'table') { legs();box(p,color,[0,.75,0],[w,.15,d]); }
  else if (item.kind === 'chair') { legs(.42);box(p,color,[0,.48,0],[w,.13,d]);box(p,color,[0,.81,-d/2+.07],[w, .64,.12]);box(p,trim,[0,1.13,-d/2+.07],[w,.07,.14]); }
  else if (item.kind === 'rug') {
    box(p,color,[0,.02,0],[w,.035,d]);for(const x of [-1,1])box(p,trim,[x*(w/2-.08),.042,0],[.07,.012,d-.14]);
    for(const z of [-1,1])box(p,trim,[0,.042,z*(d/2-.08)],[w-.14,.012,.07]);
    const star=mesh(p,new THREE.OctahedronGeometry(.28),pale,[0,.052,0]);star.scale.set(1,.035,1);
  } else if (item.kind === 'shelf') {
    box(p,wood,[0,.8,-d/2+.04],[w,1.6,.08]);for(const x of [-1,1])box(p,color,[x*(w/2-.06),.8,0],[.12,1.6,d]);
    for(const y of [.08,.58,1.08,1.58])box(p,color,[0,y,0],[w,.1,d]);
    const colors=['#8298aa','#a3869e','#aab98b','#b8a079'];
    for(let row=0;row<3;row++)for(let i=0;i<5;i++)box(p,mat(colors[(row+i)%4]),[-w*.34+i*w*.16,.28+row*.5,.05],[w*.12,.28,d*.55]);
  } else if (item.kind === 'plant') {
    const r=Math.min(w,d)*.31;cyl(p,wood,[0,.18,0],r,.36);cyl(p,trim,[0,.35,0],r*1.1,.07);
    cyl(p,wood,[0,.66,0],.035,.65);for(let i=0;i<5;i++){const a=i/5*Math.PI*2;const leaf=ball(p,color,[Math.cos(a)*w*.18,.78+(i%2)*.18,Math.sin(a)*d*.18],[w*.2,.27,d*.16]);leaf.rotation.z=Math.sin(a)*.4;}
  } else if (item.kind === 'lamp') {
    cyl(p,wood,[0,.08,0],w*.4,.16);cyl(p,trim,[0,.67,0],.055,1.2);
    mesh(p,new THREE.OctahedronGeometry(w*.44),color,[0,1.43,0]);ball(p,basic('#f3dd9e'),[0,1.42,.015],[w*.2,.21,d*.2]);
  } else if (item.kind === 'sofa') {
    legs(.2);box(p,color,[0,.46,0],[w,.48,d]);box(p,color,[0,.85,-d/2+.12],[w,.6,.24]);
    for(const x of [-1,1])box(p,color,[x*(w/2-.12),.64,0],[.24,.46,d]);for(const x of [-.23,.23])box(p,pale,[x*w,.73,-d*.1],[w*.35,.13,d*.65]);
  } else if (item.kind === 'cabinet' || item.kind === 'chest') {
    const h=item.kind==='cabinet'?.9:.55;box(p,color,[0,h/2,0],[w,h,d]);
    for(let i=0;i<(item.kind==='cabinet'?3:1);i++){const y=item.kind==='cabinet'?.18+i*.27:.28;box(p,wood,[0,y,d/2+.012],[w*.9,.025,.025]);box(p,trim,[0,y+.06,d/2+.03],[.17,.04,.04]);}
    box(p,trim,[0,h+.03,0],[w+.02,.06,d+.02]);
  } else if (item.kind === 'telescope') {
    for(let i=0;i<3;i++){const a=i/3*Math.PI*2;const leg=cyl(p,wood,[Math.cos(a)*.23,.4,Math.sin(a)*.23],.035,.83);leg.rotation.z=Math.cos(a)*-.4;leg.rotation.x=Math.sin(a)*.4;}
    cyl(p,trim,[0,.88,0],.055,.44);const tube=cyl(p,color,[0,1.15,0],.14,.7);tube.rotation.z=-1.05;
    const lens=cyl(p,basic('#9ccfd2'),[.30,1.32,0],.12,.035);lens.rotation.z=-1.05;
  } else {
    box(p,wood,[0,.1,0],[w,.2,d]);box(p,color,[0,.4,0],[w*.7,.5,d*.7]);box(p,trim,[0,.68,0],[w,.08,d]);
    if(item.kind==='trophy'&&item.trophyId?.includes('tower')){
      box(p,color,[0,.95,0],[w*.4,.5,d*.4]);for(const x of [-1,1])for(const z of [-1,1])box(p,trim,[x*w*.14,1.23,z*d*.14],[w*.1,.13,d*.1]);
    }else if(item.kind==='statue'||item.trophyId==='trophy-golem'){
      box(p,color,[0,.91,0],[w*.43,.35,d*.4]);box(p,color,[0,1.18,0],[w*.34,.25,d*.32]);for(const x of [-1,1])box(p,color,[x*w*.32,.91,0],[w*.18,.3,d*.25]);
      mesh(p,new THREE.OctahedronGeometry(.09),basic('#b9e3dd'),[0,.95,d*.22]);
    }else if(item.kind==='trophy'){
      mesh(p,new THREE.TorusGeometry(w*.24,.04,5,16),color,[0,1.02,0]);const jewel=mesh(p,new THREE.OctahedronGeometry(.14),trim,[0,1.02,0]);jewel.scale.z=.3;
    }
  }
  return p;
}

function panorama(p,l) {
  box(p,basic(l.sky),[0,2.7,-8],[12,7,.06]);
  const sun=ball(p,basic('#eedcaf'),[3.3,4.6,-7.8],[.5,.5,.12]);
  if(['cloud','harbor'].includes(l.style))for(let i=0;i<5;i++)ball(p,basic('#e1e9e6'),[-4+i*2,1+(i%2)*1.1,-5.6],[1.4,.28,.6]);
  if(l.style==='cloud')for(let i=0;i<4;i++)mesh(p,new THREE.ConeGeometry(1.3,2.1,5),basic('#8f9ebc'),[-3+i*2,.1,-6.4]);
  if(['canopy','grove'].includes(l.style)){
    for(let i=0;i<7;i++){const x=-5+i*1.6;box(p,mat('#655d49'),[x,.7,-5.5],[.2,3.5,.25]);ball(p,mat(i%2?'#4e8066':'#6a9673'),[x,2.3,-5.5],[1.3,1.7,.9]);}
    for(let i=0;i<9;i++)ball(p,basic(i%2?'#bbd4a6':'#b6c9e5'),[-4+i, .15+(i%3)*.25,-4.3],[.09,.1,.08]);
  }else if(l.style==='harbor'){
    for(let i=0;i<3;i++){
      const g=new THREE.Group();g.position.set(-3+i*3,2.3+(i%2)*.7,-5.7);p.add(g);box(g,mat('#8b6d51'),[0,-.2,0],[1,.2,.4]);box(g,mat('#ddc394'),[0,.25,0],[.035,.8,.035]);box(g,mat(i%2?'#a6c9c0':'#c9adce'),[.21,.3,0],[.4,.55,.035]);
    }
    for(let i=0;i<2;i++){const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(-6,1.3+i*.6,-6),new THREE.Vector3(0,2.1+i*.7,-6),new THREE.Vector3(6,1.6+i*.6,-6)]);mesh(p,new THREE.TubeGeometry(curve,18,.09,4,false),basic(i?'#b9a9e7':'#8cd9ca'));}
  }else{
    const desert=l.style==='desert';
    for(let i=0;i<5;i++){const hill=mesh(p,new THREE.ConeGeometry(2.2,desert?1.3:2.7,5),basic(desert?'#c3a17b':'#809ba4'),[-5+i*2.4,.3,-6.5]);hill.rotation.y=i*.8;}
    if(l.style==='town'||l.style==='workshop'||desert)for(let i=0;i<5;i++){
      const x=-3.8+i*1.9,h=desert?1.5+(i%2)*.7:.7+(i%2)*.4;
      box(p,mat(desert?'#9c8a8a':l.wall),[x,h/2,-5.1],[1.2,h,1]);const roof=mesh(p,new THREE.ConeGeometry(.95,.7,4),mat(l.roof),[x,h+.3,-5.1]);roof.rotation.y=Math.PI/4;
      box(p,basic('#d8dcb8'),[x,h*.65,-4.59],[.2,.25,.025]);
    }
  }
}

function roomModel(l,outside=false) {
  const p=new THREE.Group(),wall=mat(l.wall),floor=mat(l.floor),trim=mat(l.trim),wood=mat('#725d48');
  box(p,floor,[0,-.13,0],[8.2,.26,6.2]);
  for(let i=0;i<12;i++)box(p,wood,[-3.7+i*.67,.004,0],[.018,.008,6]);
  box(p,wall,[-2.8,1.8,-3],[2.4,3.6,.15]);box(p,wall,[2.8,1.8,-3],[2.4,3.6,.15]);
  box(p,wall,[0,.5,-3],[3.2,1,.15]);box(p,wall,[0,3.35,-3],[3.2,.5,.15]);
  for(const x of [-1.6,1.6])box(p,trim,[x,2,-2.88],[.12,2.2,.18]);
  for(const y of [1,3.1])box(p,trim,[0,y,-2.88],[3.35,.12,.18]);
  box(p,trim,[0,2.05,-2.88],[.07,2,.12]);box(p,trim,[0,1.05,-2.72],[3.4,.10,.45]);
  box(p,wall,[-4,.75,0],[.15,1.5,6]);
  if(['canopy','grove','town','harbor'].includes(l.style)){
    for(const x of [-3.85,-1.7,1.7,3.85])box(p,wood,[x,1.8,-2.88],[.15,3.7,.2]);box(p,wood,[0,3.55,-2.86],[8,.2,.25]);
    if(['canopy','grove'].includes(l.style))for(const x of [-3.6,3.6])for(let j=0;j<3;j++)ball(p,mat('#5d8b61'),[x+(j-1)*.2,2+j*.35,-2.75],[.25,.48,.12]);
  }else if(l.style==='workshop'){
    for(let i=0;i<5;i++)box(p,trim,[-3.8, .4+i*.65,-2.78],[.16,.45,.18]);
    const gear=mesh(p,new THREE.TorusGeometry(.36,.08,4,12),trim,[2.9,2.55,-2.83]);for(let i=0;i<8;i++)box(p,trim,[2.9+Math.cos(i*Math.PI/4)*.45,2.55+Math.sin(i*Math.PI/4)*.45,-2.83],[.15,.15,.1]);
  }else if(l.style==='desert'){
    const arch=mesh(p,new THREE.TorusGeometry(1.58,.12,4,24,Math.PI),trim,[0,1.6,-2.86]);arch.scale.y=.94;
  }else if(l.style==='cloud'){
    for(const x of [-3.3,3.3]){cyl(p,trim,[x,1.7,-2.7],.14,3.4);ball(p,basic('#dbe4eb'),[x,3.4,-2.7],[.35,.18,.25]);}
  }
  if(outside){
    box(p,wall,[-4,2.55,0],[.15,2.1,6]);
    box(p,wall,[4,1.8,0],[.15,3.6,6]);box(p,wall,[0,1.8,3],[8,3.6,.15]);
    box(p,wood,[0,1.2,3.1],[1.25,2.4,.14]);ball(p,trim,[.43,1.2,3.2],[.07,.07,.07]);
    for(const x of [-2.3,2.3]){box(p,basic('#c5ddd0'),[x,2,3.1],[1.3,1.3,.07]);for(const dx of [-.7,.7])box(p,trim,[x+dx,2,3.18],[.1,1.45,.12]);box(p,trim,[x,2,3.18],[1.45,.07,.12]);}
    if(l.style==='desert'){
      box(p,mat(l.roof),[0,3.68,0],[8.5,.25,6.5]);
      for(const x of [-4,4])box(p,trim,[x,3.95,0],[.22,.45,6.4]);
      for(const z of [-3,3])box(p,trim,[0,3.95,z],[8.2,.45,.22]);
      ball(p,mat(l.roof),[2,3.9,-1],[1.1,.8,1.1]);
      mesh(p,new THREE.TorusGeometry(.63,.12,4,20,Math.PI),trim,[0,2.4,3.22]);
    }else if(l.style==='cloud'){
      ball(p,mat(l.roof),[0,3.55,0],[4.4,1.8,3.4]);
      for(const x of [-3.65,3.65]){cyl(p,trim,[x,1.8,3.23],.16,3.6);ball(p,trim,[x,3.65,3.23],[.32,.14,.3]);}
    }else{
      const roof=mesh(p,new THREE.ConeGeometry(5.8,2.2,l.style==='canopy'||l.style==='grove'?6:4),mat(l.roof),[0,4.45,0]);roof.rotation.y=Math.PI/4;roof.scale.z=.8;
    }
    if(l.style==='workshop'){
      box(p,mat('#677a83'),[2.4,4.5,-1],[.7,2.1,.7]);
      mesh(p,new THREE.TorusGeometry(.48,.1,4,12),trim,[0,3.3,3.2]);
      for(let i=0;i<8;i++)box(p,trim,[Math.cos(i*Math.PI/4)*.6,3.3+Math.sin(i*Math.PI/4)*.6,3.2],[.2,.2,.12]);
    }
    if(l.style==='town'){
      for(const x of [-3.8,-.85,.85,3.8])box(p,wood,[x,1.8,3.19],[.18,3.6,.16]);
      for(const x of [-2.3,2.3]){const beam=box(p,wood,[x,1.8,3.2],[.15,4,.15]);beam.rotation.z=x>0?-.65:.65;}
      box(p,wood,[0,.7,3.2],[8,.16,.15]);
    }
    if(['canopy','grove'].includes(l.style)){
      for(const x of [-3.5,3.5]){const branch=cyl(p,wood,[x,-.55,1],.25,1.4);branch.rotation.z=x>0?-.25:.25;}
      for(let i=0;i<3;i++)ball(p,mat(l.style==='canopy'?'#729c62':'#547f62'),[-2.5+i*2.5,4.6+(i%2)*.6,-1],[1.5,.75,1.4]);
      for(const x of [-3.8,3.8])for(let i=0;i<4;i++)ball(p,mat('#658d68'),[x,1+i*.55,3.2],[.25,.5,.18]);
    }
    if(l.style==='harbor'){
      box(p,floor,[0,-.05,3.7],[8.8,.15,1.2]);
      for(const x of [-4.2,-2.1,2.1,4.2])box(p,trim,[x,.55,4.2],[.1,1.2,.1]);
      for(const x of [-3.2,3.2])box(p,wood,[x,1,4.2],[2.2,.1,.1]);
      cyl(p,wood,[3.5,4.8,0],.055,2.9);box(p,mat('#a890c6'),[4,5.7,0],[1,.6,.05]);
    }
  }
  return p;
}

function threeVisual(host,getData,onLost) {
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-label','Einrichtbares Haus in 3D');canvas.tabIndex=0;
  let renderer;
  const gl=canvas.getContext('webgl2',{alpha:true,antialias:true,powerPreference:'low-power'});
  if(!gl)return null;
  try { renderer=new THREE.WebGLRenderer({canvas,context:gl,alpha:true,antialias:true}); } catch {gl.getExtension('WEBGL_lose_context')?.loseContext();return null;}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.setClearColor('#182536');renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(37,1,.1,100),raycaster=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  scene.add(new THREE.HemisphereLight('#fff0d3','#8295ad',2.2));const sun=new THREE.DirectionalLight('#fff0d9',2.3);sun.position.set(3,8,6);scene.add(sun);
  const world=new THREE.Group(),furniture=new THREE.Group();scene.add(world,furniture);
  let key='',objects=new Map(),helper=null,frame=0,disposed=false,windowTarget=null;
  const draw=()=>{frame=0;if(!disposed&&!document.hidden)renderer.render(scene,camera);};
  const schedule=()=>{if(!frame&&!disposed)frame=requestAnimationFrame(draw);};
  function paint(invalid=false){
    const data=getData(),l=homeLocationFor(data.locationId),nextKey=`${l.id}:${data.mode}`;
    if(nextKey!==key){
      for(const child of [...world.children])disposeTree(child);
      windowTarget?.dispose();windowTarget=null;
      world.add(roomModel(l,data.mode==='outside'));
      if(data.mode!=='outside'){
        // Render the distant landscape only inside the window opening.
        const viewScene=new THREE.Scene(),landscape=new THREE.Group();panorama(landscape,l);viewScene.add(landscape);
        viewScene.add(new THREE.HemisphereLight('#fff0d3','#8295ad',2.2));
        const viewSun=new THREE.DirectionalLight('#fff0d9',2.3);viewSun.position.set(3,8,6);viewScene.add(viewSun);
        const viewCamera=new THREE.OrthographicCamera(-4.4,4.4,4.5,-.2,.1,30);viewCamera.position.set(0,0,5);viewCamera.lookAt(0,0,-5);
        windowTarget=new THREE.WebGLRenderTarget(768,512);windowTarget.texture.colorSpace=THREE.SRGBColorSpace;
        renderer.setRenderTarget(windowTarget);renderer.setClearColor(l.sky);renderer.render(viewScene,viewCamera);renderer.setRenderTarget(null);renderer.setClearColor('#182536');
        const viewMaterial=new THREE.MeshBasicMaterial({map:windowTarget.texture});mesh(world,new THREE.PlaneGeometry(3.2,2.1),viewMaterial,[0,2.05,-3.08]);
        disposeTree(viewScene);
      }
      key=nextKey;
    }
    furniture.visible=data.mode!=='outside';
    const current=new Set(data.placements.map(p=>p.id));
    for(const [id,obj]of objects)if(!current.has(id)){disposeTree(obj);objects.delete(id);}
    for(const p of data.placements){let obj=objects.get(p.id);if(!obj){obj=furnitureModel(furnitureFor(p.itemId));obj.userData.placementId=p.id;furniture.add(obj);objects.set(p.id,obj);}obj.position.set(p.x,0,p.z);obj.rotation.y=-p.rotation*Math.PI/180;obj.updateMatrixWorld(true);}
    if(helper){disposeTree(helper);helper=null;}
    const selected=objects.get(data.selectedId);
    if(selected&&data.mode!=='outside'){helper=new THREE.BoxHelper(selected,invalid?'#ef977f':'#80ead5');scene.add(helper);}
    schedule();
  }
  function resize(){const data=getData(),width=Math.max(1,host.clientWidth),height=Math.max(280,host.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;const fit=Math.max(1,1.45/camera.aspect);if(data.mode==='top'){camera.position.set(0,12*fit,.01);camera.lookAt(0,0,0);}else{const distance=fit*(data.mode==='outside'?1.15:1);camera.position.set(8.7*distance,8.4*distance,10.8*distance);camera.lookAt(0,data.mode==='outside'?1.6:1,0);}camera.updateProjectionMatrix();schedule();}
  function ray(event){const r=canvas.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1),camera);}
  const point=event=>{ray(event);const p=new THREE.Vector3();return raycaster.ray.intersectPlane(plane,p)?{x:p.x,z:p.z}:null;};
  const hit=event=>{ray(event);const intersection=raycaster.intersectObjects(furniture.children,true)[0];let node=intersection?.object;while(node&&!node.userData.placementId)node=node.parent;return node?.userData.placementId||null;};
  const lost=event=>{event.preventDefault();onLost();};canvas.addEventListener('webglcontextlost',lost);
  const visibility=()=>{if(!document.hidden)schedule();};document.addEventListener('visibilitychange',visibility);
  const observer=new ResizeObserver(resize);observer.observe(host);host.append(canvas);resize();paint();host.dataset.renderState='ready';
  return {surface:canvas,point,hit,paint,resize,dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener('visibilitychange',visibility);canvas.removeEventListener('webglcontextlost',lost);disposeTree(scene);windowTarget?.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();}};
}

function planVisual(host,getData){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 1000 760');svg.setAttribute('aria-label','Verschiebbarer Grundriss deines Hauses');svg.tabIndex=0;host.append(svg);host.dataset.renderState='plan';
  function paint(invalid=false){const d=getData(),l=homeLocationFor(d.locationId);if(d.mode==='outside'){svg.innerHTML=`<svg x="50" y="70" width="900" height="580">${locationIllustration(l)}</svg>`;return;}
    svg.innerHTML=`<rect x="100" y="80" width="800" height="600" rx="6" fill="${l.floor}" stroke="${l.trim}" stroke-width="10"/><rect x="350" y="20" width="300" height="50" rx="10" fill="${l.sky}" stroke="${l.trim}" stroke-width="5"/><text x="500" y="53" text-anchor="middle" fill="#223b46" font-size="17">${esc(l.view)}</text>${[...d.placements].sort((a,b)=>Number(furnitureFor(b.itemId).layer==='rug')-Number(furnitureFor(a.itemId).layer==='rug')).map(p=>{const i=furnitureFor(p.itemId),selected=p.id===d.selectedId;return `<g data-home-placement="${p.id}" transform="translate(${500+p.x*100} ${380+p.z*100}) rotate(${p.rotation})"><rect x="${-i.width*50}" y="${-i.depth*50}" width="${i.width*100}" height="${i.depth*100}" rx="${i.kind==='plant'?20:5}" fill="${i.color}" stroke="${selected?invalid?'#ef977f':'#b3ffec':'#574c43'}" stroke-width="${selected?6:2}" ${i.layer==='rug'?'opacity=".65"':''}/><text text-anchor="middle" y="5" fill="#172c37" font-size="13" pointer-events="none">${esc(i.kind==='trophy'?i.trophyName:i.name)}</text></g>`;}).join('')}`;
  }
  const point=event=>{const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const matrix=svg.getScreenCTM();if(!matrix)return null;const local=p.matrixTransform(matrix.inverse());return{x:(local.x-500)/100,z:(local.y-380)/100};};
  paint();return{surface:svg,point,hit:event=>event.target.closest('[data-home-placement]')?.dataset.homePlacement||null,paint,resize(){},dispose(){svg.remove();}};
}

/** A single editor owns its GPU resources and pointer/keyboard listeners. */
export function mountHousing3D(host,options){
  let data={...options,placements:clone(options.placements),selectedId:options.selectedId||null,mode:options.mode||'room'},visual=null,cleanup=null,disposed=false,drag=null;
  const getData=()=>data;
  const notify=()=>options.onChange?.(clone(data.placements));
  const select=id=>{data.selectedId=id;visual.paint();options.onSelect?.(id);};
  function move(id,changes,notifyChange=true){const original=data.placements.find(p=>p.id===id);if(!original)return false;const candidate={...original,...changes};candidate.x=round(candidate.x);candidate.z=round(candidate.z);candidate.rotation=((candidate.rotation%360)+360)%360;
    const next=data.placements.map(p=>p.id===id?candidate:p),issue=layoutIssue(next,options.owned);
    if(issue){options.onIssue?.(issue);return false;}data.placements=next;visual.paint();if(notifyChange)notify();return true;}
  function attach(){const surface=visual.surface;
    const down=event=>{if(event.button!==0||data.mode==='outside')return;let id=visual.hit(event);const point=visual.point(event);if(id&&data.selectedId&&furnitureFor(data.placements.find(p=>p.id===id)?.itemId)?.layer==='rug'&&furnitureFor(data.placements.find(p=>p.id===data.selectedId)?.itemId)?.layer!=='rug')id=null;if(id)select(id);if(!data.selectedId||!point)return;
      const item=data.placements.find(p=>p.id===data.selectedId);if(!item)return;drag={pointerId:event.pointerId,id:item.id,start:{x:event.clientX,y:event.clientY},offset:id?{x:point.x-item.x,z:point.z-item.z}:{x:0,z:0},empty:!id,moved:false};surface.setPointerCapture?.(event.pointerId);options.onDragState?.(true);};
    const motion=event=>{if(!drag||drag.pointerId!==event.pointerId)return;if(Math.abs(event.clientX-drag.start.x)+Math.abs(event.clientY-drag.start.y)<4&&!drag.moved)return;drag.moved=true;const p=visual.point(event);if(p)move(drag.id,{x:p.x-drag.offset.x,z:p.z-drag.offset.z},false);event.preventDefault();};
    const up=event=>{if(!drag||drag.pointerId!==event.pointerId)return;const finished=drag;if(finished.empty&&!finished.moved&&event.type!=='pointercancel'){const p=visual.point(event);if(p)move(finished.id,{x:p.x,z:p.z},false);}drag=null;if(surface.hasPointerCapture?.(event.pointerId))surface.releasePointerCapture(event.pointerId);options.onDragState?.(false);if(finished.moved||finished.empty)notify();};
    const key=event=>{if(event.key==='Escape'){select(null);return;}const item=data.placements.find(p=>p.id===data.selectedId);if(!item||data.mode==='outside')return;const step=event.shiftKey?.5:.1,delta={ArrowLeft:{x:item.x-step},ArrowRight:{x:item.x+step},ArrowUp:{z:item.z-step},ArrowDown:{z:item.z+step},r:{rotation:item.rotation+15},R:{rotation:item.rotation+15}}[event.key];if(delta){event.preventDefault();move(item.id,delta);}};
    surface.addEventListener('pointerdown',down);surface.addEventListener('pointermove',motion);surface.addEventListener('pointerup',up);surface.addEventListener('pointercancel',up);surface.addEventListener('keydown',key);
    return()=>{surface.removeEventListener('pointerdown',down);surface.removeEventListener('pointermove',motion);surface.removeEventListener('pointerup',up);surface.removeEventListener('pointercancel',up);surface.removeEventListener('keydown',key);if(drag)options.onDragState?.(false);drag=null;};
  }
  const fallback=()=>{if(disposed)return;cleanup?.();visual?.dispose();visual=planVisual(host,getData);cleanup=attach();options.onIssue?.('Du richtest dein Haus im Grundriss ein. Verschieben und Speichern bleiben verfügbar.');};
  try{visual=threeVisual(host,getData,fallback);}catch{visual=null;}
  if(!visual)visual=planVisual(host,getData);cleanup=attach();
  return{supported:host.dataset.renderState==='ready',select,move,
    update(next){data={...data,...next,placements:next.placements?clone(next.placements):data.placements};visual.paint();visual.resize();},
    dispose(){if(disposed)return;disposed=true;cleanup?.();visual?.dispose();delete host.dataset.renderState;},
  };
}
