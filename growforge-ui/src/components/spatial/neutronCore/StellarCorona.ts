import * as THREE from "three";

/** Separate limb light and living flares; never an opaque image or a graph hit target. */
export function createStellarCorona() {
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uGain: { value: 1 } },
    vertexShader: `varying vec2 vUv;
      void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float uTime; uniform float uGain; varying vec2 vUv;
      void main(){
        vec2 p=(vUv-.5)*2.8;
        float r=length(p);
        float angle=atan(p.y,p.x);
        float heat=.5+.5*sin(angle*13.+sin(angle*7.-uTime*.65)*1.5+uTime*.8);
        float detail=.5+.5*sin(angle*47.+sin(angle*19.+uTime*.7));
        float edge=1.+.008*sin(angle*23.+uTime*.6)+.006*sin(angle*41.-uTime*.9);
        float limb=exp(-pow((r-edge)/.055,2.));
        float hot=pow(heat,5.);
        float extension=.035+.16*hot;
        float flare=exp(-pow((r-edge-.035)/extension,2.))*hot*detail;
        flare*=smoothstep(.99,1.035,r)*(1.-smoothstep(1.20,1.36,r));
        float loopPhase=sin(angle*31.+(r-1.)*49.-uTime*.75);
        float loops=pow(max(0.,loopPhase),12.)*flare;
        float alpha=(limb*1.15+flare*.36+loops*.32)*uGain;
        alpha*=smoothstep(.945,.985,r);
        if(alpha<.002)discard;
        vec3 col=mix(vec3(.12,.55,.83),vec3(.88,.97,1.),clamp(limb+loops,0.,1.));
        gl_FragColor=vec4(col,alpha);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1,1), material);
  mesh.name = "LIVING_STELLAR_CORONA";
  mesh.raycast = () => {};
  mesh.onBeforeRender = (_renderer,_scene,camera) => { mesh.quaternion.copy(camera.quaternion); };
  return mesh;
}
