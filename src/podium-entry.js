import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import fontData from 'three/examples/fonts/helvetiker_regular.typeface.json';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Standalone physical scene. All named parts can be independently configured.
const host = document.querySelector('.robot-scene');
const frame = document.querySelector('#mira-frame');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const parts = {};
try {
  const scene = new THREE.Scene();
  const foreground = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-2,2,2.7,-2.7,.1,50);
  camera.position.set(0,3.45,9); camera.lookAt(0,1.9,0);
  function renderer(front = false) {
    const r = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:'low-power' });
    r.setPixelRatio(Math.min(devicePixelRatio,1.25)); r.setClearColor(0x000000,0);
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure=1.15;
    r.shadowMap.enabled=!front; r.shadowMap.type=THREE.VSMShadowMap;r.shadowMap.autoUpdate=false;
    r.domElement.className=front?'podium-3d-front':'podium-3d-back'; host.append(r.domElement); return r;
  }
  const back=renderer();
  const pmrem=new THREE.PMREMGenerator(back);
  const environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;
  scene.environment=environment; foreground.environment=environment;
  // Dark studio: no light in front (so no hot spot behind the lettering), tall softboxes at the sides give the metal its sheen.
  function studio(){
    const s=new THREE.Scene();
    s.add(new THREE.Mesh(new THREE.BoxGeometry(40,26,40),new THREE.MeshBasicMaterial({color:'#030507',side:THREE.BackSide})));
    const box=(w,h,pos,k,col)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(col).multiplyScalar(k),side:THREE.DoubleSide}));m.position.set(...pos);m.lookAt(0,1,0);s.add(m);};
    box(3.2,16,[-9.5,4,5],STUDIO.side,'#e3f6fb');box(3.2,16,[9.5,4,5],STUDIO.side,'#e3f6fb');
    box(1,14,[-6,3,-9],STUDIO.rim,'#7fe3f2');box(1,14,[6,3,-9],STUDIO.rim,'#7fe3f2');
    box(14,2.5,[0,12,2],STUDIO.top,'#cfeaf1');
    return s;
  }
  const STUDIO={side:8,rim:3.5,top:1};
  const studioEnv=pmrem.fromScene(studio(),.02).texture;
  const black=new THREE.MeshPhysicalMaterial({color:'#05080b',metalness:1,roughness:.3,clearcoat:.5,clearcoatRoughness:.2,envMap:studioEnv,envMapIntensity:1.15});
  const sheenTime={value:0};
  const topMetal=new THREE.MeshPhysicalMaterial({color:'#12181d',metalness:.95,roughness:.18,clearcoat:.65,envMap:studioEnv});
  const chrome=new THREE.MeshPhysicalMaterial({color:'#C8D3DC',metalness:1,roughness:.14,envMap:studioEnv,envMapIntensity:1.1});
  const cyan=new THREE.MeshStandardMaterial({color:'#20DDF5',emissive:'#18BFD4',emissiveIntensity:1.35,metalness:.35,roughness:.22});
  const glass=new THREE.MeshPhysicalMaterial({color:'#bceff6',metalness:0,roughness:.065,transmission:.97,thickness:.3,ior:1.46,transparent:true,opacity:1,clearcoat:1,attenuationColor:new THREE.Color('#2AAFC7'),attenuationDistance:4,side:THREE.DoubleSide});
  function mesh(name,geometry,material,x=0,y=0,z=0,target=scene) {
    const object=new THREE.Mesh(geometry,material);object.name=name;object.position.set(x,y,z);object.castShadow=true;object.receiveShadow=true;target.add(object);parts[name]=object;return object;
  }
  // Lathed profile gives genuinely rounded edges to the truncated cone.
  const profile=[new THREE.Vector2(0,0),new THREE.Vector2(1.27,0),new THREE.Vector2(1.32,.035),new THREE.Vector2(1.33,.07),new THREE.Vector2(1.31,.12),new THREE.Vector2(.99,.92),new THREE.Vector2(.965,.96),new THREE.Vector2(.92,.98),new THREE.Vector2(0,.98)];
  mesh('MainBase',new THREE.LatheGeometry(profile,128),black,0,.08);
  mesh('LowerChromeRim',new THREE.CylinderGeometry(1.32,1.34,.075,128),chrome,0,.115);
  mesh('UpperPlatform',new THREE.CylinderGeometry(.975,.975,.09,128),topMetal,0,1.095);
  const torus=(radius,tube)=>new THREE.TorusGeometry(radius,tube,16,128);
  const upper=mesh('PlatformChromeTrim',torus(.973,.025),chrome,0,1.13);upper.rotation.x=Math.PI/2;
  const upperLight=mesh('UpperLightStrip',torus(.967,.009),cyan,0,1.145);upperLight.rotation.x=Math.PI/2;
  const spark=mesh('OrbitingRimSpark',new THREE.SphereGeometry(.021,12,8),new THREE.MeshBasicMaterial({color:'#8AF3FF'}));
  const haloMaterial=new THREE.SpriteMaterial({map:glowTexture(),color:'#20DDF5',transparent:true,opacity:.55,depthTest:true,blending:THREE.AdditiveBlending});
  const sparkHalo=new THREE.Sprite(haloMaterial);sparkHalo.scale.set(.16,.16,1);scene.add(sparkHalo);parts.SparkGlow=sparkHalo;
  // Numeral is a thick bevelled extrusion behind the existing 2D character.
  const font=new FontLoader().parse(fontData);
  const oneGeometry=new TextGeometry('1',{font,size:3.22,height:.25,curveSegments:12,bevelEnabled:true,bevelThickness:.035,bevelSize:.025,bevelSegments:4});
  oneGeometry.computeBoundingBox();oneGeometry.translate(-(oneGeometry.boundingBox.max.x+oneGeometry.boundingBox.min.x)/2,0,0);
  const one=mesh('GlassNumeral1',oneGeometry,glass,0,1.18,-.52);
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(oneGeometry,28),new THREE.LineBasicMaterial({color:'#69E8F8',transparent:true,opacity:.25}));edges.position.copy(one.position);scene.add(edges);parts.NumeralEdgeLight=edges;
  one.visible=false;edges.visible=false;
  // Front-face inlays: no other markings on the platform or base.
  function text(name,value,size,y,z,material) {
    const geometry=new TextGeometry(value,{font,size,height:.012,curveSegments:8,bevelEnabled:true,bevelThickness:.002,bevelSize:.001,bevelSegments:2});
    geometry.computeBoundingBox();geometry.translate(-(geometry.boundingBox.max.x+geometry.boundingBox.min.x)/2,0,0);
    const object=mesh(name,geometry,material,0,y,z);object.rotation.x=-.38;return object;
  }
  text('MiraInlay','Mira',.23,.54,1.22,new THREE.MeshStandardMaterial({color:'#F5FBFF',metalness:.6,roughness:.22}));
  text('AssistantInlay','AI ASSISTANT',.066,.38,1.265,new THREE.MeshStandardMaterial({color:'#C8D7E0',metalness:.65,roughness:.3}));
  // One elliptical glass ring, split only for compositing behind/in front of Canvas Mira.
  const ringGroup=new THREE.Group(), frontRingGroup=new THREE.Group();scene.add(ringGroup);foreground.add(frontRingGroup);
  const ringMaterial=glass.clone();ringMaterial.transmission=.7;ringMaterial.thickness=.14;ringMaterial.opacity=.75;
  function ringHalf(name,start,target) {
    const points=[];for(let i=0;i<=80;i++){const a=start+i/80*Math.PI;points.push(new THREE.Vector3(1.82*Math.cos(a),1.42+.14*Math.cos(a),.91*Math.sin(a)));}
    const curve=new THREE.CatmullRomCurve3(points);
    const object=new THREE.Mesh(new THREE.TubeGeometry(curve,100,.045,12,false),ringMaterial);object.name=name;target.add(object);parts[name]=object;
    const highlight=new THREE.Mesh(new THREE.TubeGeometry(curve,100,.006,6,false),new THREE.MeshBasicMaterial({color:'#69E8F8',transparent:true,opacity:.35}));target.add(highlight);
  }
  ringHalf('OrbitalRingBack',Math.PI,ringGroup);ringHalf('OrbitalRingFront',0,frontRingGroup);
  ringGroup.visible=false;frontRingGroup.visible=false;
  const floor=mesh('ContactShadowFloor',new THREE.PlaneGeometry(14,14),new THREE.ShadowMaterial({color:'#29434d',opacity:.10,transparent:true,depthWrite:false}),0,-.01);floor.rotation.x=-Math.PI/2;floor.castShadow=false;
  const ambient=new THREE.HemisphereLight('#eefaff','#778793',2);scene.add(ambient);foreground.add(ambient.clone());
  function light(target,color,intensity,position){const l=new THREE.DirectionalLight(color,intensity);l.position.set(...position);target.add(l);return l;}
  const key=light(scene,'#EEF5FA',4,[-3,7,5]);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.radius=6;key.shadow.camera.left=-4;key.shadow.camera.right=4;key.shadow.camera.top=6;key.shadow.camera.bottom=-2;key.shadow.bias=-.0008;key.shadow.normalBias=.035;
  light(scene,'#ffffff',.35,[2,3,6]);light(scene,'#8AF3FF',1.2,[0,4,-4]);light(foreground,'#EEF5FA',3,[-3,7,5]);
  function glowTexture(){const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d');const g=ctx.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'#ffffff');g.addColorStop(.2,'#ffffffa0');g.addColorStop(1,'#ffffff00');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);}
  function project(x,y,z,w,h){const v=new THREE.Vector3(x,y,z).project(camera);return [(v.x*.5+.5)*w,(-v.y*.5+.5)*h];}
  function resize(){
    if(document.body.classList.contains('site-ready'))return;
    const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
    const aspect=w/h,halfHeight=Math.max(1.8,1.43/aspect);camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;camera.top=halfHeight;camera.bottom=-halfHeight-.62;camera.updateProjectionMatrix();
    back.setSize(w,h);back.shadowMap.needsUpdate=true;
    const foot=project(0,1.15,.05,w,h), head=project(0,3.65,.05,w,h);
    const canvasHeight=(foot[1]-head[1])/.71;
    Object.assign(frame.style,{height:`${canvasHeight}px`,width:`${canvasHeight*2/3}px`,top:`${head[1]-canvasHeight*.18}px`,left:'50%',transform:'translateX(-50%)',maxWidth:'none'});
  }
  document.body.classList.add('physical-podium');
  window.addEventListener('mira-launch',()=>frame.removeAttribute('style'));
  new ResizeObserver(resize).observe(host);resize();
  let last=0;
  function render(now){
    if(!document.body.classList.contains('site-ready')&&!document.hidden&&now-last>40){
      last=now;const a=(reduced?0:now/12000)*Math.PI*2;
      sheenTime.value=reduced?4.5:now/1000;
      spark.position.set(1.338*Math.cos(a),.085,1.338*Math.sin(a));sparkHalo.position.copy(spark.position);
      // True depth-tested geometry makes the spark disappear behind the base.
      ringGroup.rotation.z=frontRingGroup.rotation.z=reduced?0:Math.sin(now/3500)*.045;
      back.render(scene,camera);
    }
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
  window.MiraPodium={scene,camera,parts,resize,renderer:back,sheenTime,renderAt(seconds){sheenTime.value=seconds;back.render(scene,camera);}};
} catch(error) {
  console.error('Mira podium could not initialize:',error);
  const note=document.createElement('p');note.className='podium-error';note.textContent='Для 3D-подиума включите аппаратное ускорение WebGL в браузере.';host.append(note);
}
