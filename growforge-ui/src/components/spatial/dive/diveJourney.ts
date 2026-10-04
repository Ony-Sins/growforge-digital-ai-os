/** One reversible Explore -> CORE interior path. No runtime or scene objects. */
export const DIVE_JOURNEY_MS = 1600;
export function advanceDive(progress:number,target:0|1,elapsedMs:number,reduced=false){
  if(reduced)return target;
  const step=Math.max(0,elapsedMs)/DIVE_JOURNEY_MS;
  return target===1?Math.min(1,progress+step):Math.max(0,progress-step);
}
export function diveDistance(progress:number,start:number,radius:number,end=8){
  const p=Math.max(0,Math.min(1,progress));
  const xs=[0,.2,.55,.8,.9,1];
  const ys=[start,Math.min(start*.8,radius*5),radius*1.4,radius*.92,Math.max(end,radius*.35),end];
  for(let i=1;i<ys.length;i++)ys[i]=Math.min(ys[i-1],Math.max(end,ys[i]));
  const slopes=xs.slice(0,-1).map((x,i)=>(ys[i+1]-ys[i])/(xs[i+1]-x));
  const ms=xs.map((_,i)=>i===0||i===xs.length-1?0:slopes[i-1]*slopes[i]<=0?0:2/(1/slopes[i-1]+1/slopes[i]));
  const i=Math.min(4,xs.findIndex((x,j)=>j>0&&p<=x)-1);
  const h=xs[i+1]-xs[i],t=(p-xs[i])/h;
  return (2*t**3-3*t*t+1)*ys[i]+(t**3-2*t*t+t)*h*ms[i]+(-2*t**3+3*t*t)*ys[i+1]+(t**3-t*t)*h*ms[i+1];
}
const resolve=(p:number,start:number,end:number)=>{const t=Math.max(0,Math.min(1,(p-start)/(end-start)));return t*t*(3-2*t)};
export const diveLandingOpacity=(p:number)=>resolve(p,.55,.88);
export const diveContentOpacity=(p:number)=>resolve(p,.84,1);
/** Light reaches the peripheral membrane, then settles into the approved dark interior. */
export const diveMembraneLight=(p:number)=>.025+.19*Math.sin(Math.PI*resolve(p,.55,1));
