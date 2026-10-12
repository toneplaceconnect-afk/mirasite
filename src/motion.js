/* Original Mira fluid-light shader. No external libraries; works from file://. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const background = document.querySelector('.ambient-background');
  const canvas = document.createElement('canvas'); canvas.className = 'fluid-light'; background.prepend(canvas);
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'low-power' });
  if (gl) {
    const vertex = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
    const fragment = `precision mediump float;uniform vec2 size;uniform vec2 mouse;uniform float time;
      void main(){vec2 uv=gl_FragCoord.xy/size;vec2 p=(uv-.5)*vec2(size.x/size.y,1.);float t=time*.14;
      vec2 m=(mouse-.5)*vec2(size.x/size.y,1.);p+=m*.16;
      float bend=sin(p.x*2.6+t)*.23+sin(p.x*4.1-t*.7)*.10;
      float ribbon=exp(-pow((p.y-bend-sin(t*.6)*.18)*3.7,2.));
      float fold=sin(p.x*3.3+p.y*2.1+t)*.5+.5;
      float silk=exp(-pow((p.y-bend-.12)*9.,2.))*.22;
      float pool=exp(-length(p-m*.5)*2.4)*.23;
      vec3 white=vec3(.975,.992,.996);vec3 cyan=vec3(.17,.76,.83);vec3 ice=vec3(.61,.91,.94);
      vec3 colour=mix(white,mix(ice,cyan,fold*.65),ribbon*.38+pool);colour+=silk*.12;
      gl_FragColor=vec4(colour,1.);}`;
    function shader(type, source) { const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }
    const vs = shader(gl.VERTEX_SHADER, vertex), fs = shader(gl.FRAGMENT_SHADER, fragment);
    if (vs && fs) {
      const program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
      if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
        gl.useProgram(program); const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
        const a = gl.getAttribLocation(program, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
        const size = gl.getUniformLocation(program, 'size'), mouse = gl.getUniformLocation(program, 'mouse'), time = gl.getUniformLocation(program, 'time');
        let target = [.5,.5], point = [.5,.5], last = 0;
        window.addEventListener('pointermove', e => { target = [e.clientX / innerWidth, 1-e.clientY / innerHeight]; }, { passive: true });
        function resize() { canvas.width = Math.round(innerWidth*.65); canvas.height = Math.round(innerHeight*.65); gl.viewport(0,0,canvas.width,canvas.height); }
        resize(); window.addEventListener('resize', resize, { passive: true });
        function render(now) { if (!document.hidden && now-last>32) { last=now; point=point.map((v,i)=>v+(target[i]-v)*.035); gl.uniform2f(size,canvas.width,canvas.height); gl.uniform2f(mouse,point[0],point[1]); gl.uniform1f(time,reduced?0:now/1000); gl.drawArrays(gl.TRIANGLES,0,6); } if (!reduced) requestAnimationFrame(render); }
        render(100); background.classList.add('has-fluid');
      }
    }
  }
  const scene = document.querySelector('.robot-scene');
  const heroDock = document.createElement('div'); heroDock.className = 'hero-dock'; scene.before(heroDock); heroDock.append(scene);
  const flow = document.querySelector('.flow-layout');
  const theatre = document.createElement('div'); theatre.className = 'conversation-theatre';
  theatre.innerHTML = `<div class="flow-dock scene-dock"></div>`;
  flow.prepend(theatre);
  const integration = document.querySelector('.integration-grid');
  const integrationDock = document.createElement('div'); integrationDock.className = 'integration-dock scene-dock'; integration.prepend(integrationDock);
  const featureGrid = document.querySelector('.feature-grid');
  featureGrid.querySelectorAll('.feature').forEach((card, i) => card.style.setProperty('--k', i));
  const perches = [0, 1, 2].map((i) => { const perch = document.createElement('div'); perch.className = 'perch scene-dock'; perch.style.setProperty('--k', i); featureGrid.append(perch); return perch; });
  const tour = document.createElement('div'); tour.className = 'demo-tour';
  tour.innerHTML = `<span class="mono">Попробуйте спросить</span><button data-tour="Что ты умеешь и как помогаешь посетителям сайта?">Что умеет Mira</button><button data-tour="У меня сайт услуг. Чем ты можешь быть полезна?">Помощь сайту услуг</button><button data-tour="Что будет, если ты не знаешь ответа на вопрос посетителя?">Если ответа нет</button>`;
  document.querySelector('.about').append(tour);
  tour.querySelectorAll('button').forEach(button => button.onclick = () => { document.querySelector('#chat').scrollIntoView({behavior:reduced?'instant':'smooth',block:'center'}); talk(button.dataset.tour); });
  let dock = heroDock;
  const flowDock = theatre.querySelector('.flow-dock');
  let scheduled = false;
  const stages = [...document.querySelectorAll('.flow-steps article')];
  const features = [...document.querySelectorAll('.feature')];
  features.forEach((feature,i) => { feature.style.setProperty('--feature-delay',`${i*110}ms`); feature.addEventListener('pointermove',e=>{ if(reduced)return; const r=feature.getBoundingClientRect(); feature.style.setProperty('--rx',`${-(e.clientY-r.top-r.height/2)/40}deg`);feature.style.setProperty('--ry',`${(e.clientX-r.left-r.width/2)/40}deg`); });feature.addEventListener('pointerleave',()=>{feature.style.setProperty('--rx','0deg');feature.style.setProperty('--ry','0deg');}); });
  function update() {
    scheduled=false;
    const fr=document.querySelector('#flow').getBoundingClientRect(), ir=document.querySelector('#connect').getBoundingClientRect();
    const gr=featureGrid.getBoundingClientRect(), ar=document.querySelector('#about').getBoundingClientRect();
    // Robot route, in page order: hero -> perch above card 01 -> 02 -> 03 (block 02) -> flow (block 03) -> integration (block 04).
    const path=[heroDock,...perches.filter((perch)=>perch.offsetParent!==null),flowDock,integrationDock];
    const perchCount=path.length-3;
    let target=0;
    if(ir.top<innerHeight*.55&&ir.bottom>innerHeight*.2) target=path.length-1;
    else if(fr.top<innerHeight*.55&&fr.bottom>innerHeight*.2) target=path.length-2;
    else if(perchCount&&ar.bottom>innerHeight*.2&&gr.top<innerHeight*.8){
      // block 02: the robot visits the cards one after another while the row of cards is actually on screen.
      // progress runs from "row enters the screen" to "row has almost left it", split into equal parts per card.
      const lead=perches.find((perch)=>perch.offsetParent!==null)||perches[0], pr=lead.getBoundingClientRect();
      const q=Math.min(.999,Math.max(0,(innerHeight*.8-pr.top)/(innerHeight*.8+pr.height*.6)));
      target=1+Math.min(perchCount-1,Math.floor(q*perchCount));
    }
    // past the last block the robot stays where it is, it does not fly back to the top of the page
    else if(ir.bottom<=innerHeight*.2) target=path.length-1;
    const current=Math.max(0,path.indexOf(dock));
    if(target!==current && document.body.classList.contains('site-ready') && getComputedStyle(scene).display !== 'none') {
      // always move one stop at a time, so the robot visits every block even when the page is scrolled quickly
      const desired=path[current+Math.sign(target-current)];
      const old=scene.getBoundingClientRect(); desired.append(scene); const next=scene.getBoundingClientRect();
      const dx=old.left-next.left, dy=old.top-next.top, hop=Math.min(110,40+Math.hypot(dx,dy)*.12);
      if(!reduced) scene.animate([{transform:`translate(${dx}px,${dy}px) scale(${old.width/next.width})`,opacity:.8},{transform:`translate(${dx*.45}px,${dy*.45-hop}px) scale(${(1+old.width/next.width)/2})`,opacity:1,offset:.5},{transform:'translate(0,0) scale(1)',opacity:1}],{duration:900,easing:'cubic-bezier(.22,1,.36,1)'});
      dock=desired;
      if(path.indexOf(desired)!==target) setTimeout(update,reduced?0:560);
    }
    const progress=Math.max(0,Math.min(1,(innerHeight*.7-fr.top)/(fr.height*.85)));
    document.querySelector('#flow').style.setProperty('--flow-progress',progress);
    stages.forEach((stage,i)=>stage.classList.toggle('stage-active',progress>i*.22));
    theatre.classList.toggle('question-visible',progress>.08);theatre.classList.toggle('answer-visible',progress>.3);theatre.classList.toggle('handoff-visible',progress>.65);
    if(dock===integrationDock) {const p=Math.max(0,Math.min(1,(innerHeight*.5-ir.top)/Math.max(1,ir.height*.5)));integration.style.setProperty('--journey',p); integration.classList.toggle('program-active',p>.5);}
  }
  window.addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(update);}},{passive:true});window.addEventListener('resize',update);window.addEventListener('mira-launch',update);setTimeout(update,2000);
})();
