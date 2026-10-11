import { gsap } from 'gsap';

// One pointer implementation, one trail renderer. No competing fade callbacks.
(() => {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const orb=document.createElement('div');orb.className='liquid-cursor';orb.setAttribute('aria-hidden','true');document.body.append(orb);
    const position={x:0,y:0};
  let active=false;
  const moveX=gsap.quickTo(position,'x',{duration:reduced?.01:.22,ease:'power3.out'}),moveY=gsap.quickTo(position,'y',{duration:reduced?.01:.22,ease:'power3.out'});
  function hide(){active=false;orb.classList.remove('visible');document.body.classList.remove('custom-cursor');}
  window.addEventListener('pointermove',e=>{
    if(e.pointerType==='touch'||e.target.closest('dialog')){hide();return;}
    const point={x:e.clientX,y:e.clientY};
    if(!active){gsap.set(position,{x:point.x,y:point.y});active=true;orb.classList.add('visible');}
    document.body.classList.add('custom-cursor');moveX(point.x);moveY(point.y);
    orb.classList.toggle('interactive',!!e.target.closest('a,button,input,textarea'));
  },{passive:true});
  window.addEventListener('blur',hide);document.documentElement.addEventListener('pointerleave',hide);
  gsap.ticker.add(()=>{if(active)orb.style.transform=`translate3d(${position.x}px,${position.y}px,0)`;});
})();
