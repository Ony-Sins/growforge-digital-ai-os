import * as THREE from "three";
import { entityBrandAsset } from "@/lib/spatial/entityPresentation";

function recordIcon(title: string) {
  const canvas=document.createElement("canvas");canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext("2d")!;
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const glyph=title.replace(/Department|Systems|Google|Local/g,"").trim().split(/\s+/).filter(word=>/[a-z]/i.test(word)).slice(0,2).map(w=>w[0]).join("").toUpperCase() || "•";
  ctx.fillStyle="#bcefff";ctx.font="500 112px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(glyph,128,136);
  const brand=entityBrandAsset(title);
  const img=new Image();let disposed=false;
  if(brand){
    img.onload=()=>{if(disposed)return;ctx.clearRect(0,0,256,256);const aspect=img.naturalWidth/img.naturalHeight || 1;
      const width=aspect>=1 ? 176 : 176*aspect, height=aspect>=1 ? 176/aspect : 176;
      ctx.drawImage(img,(256-width)/2,(256-height)/2,width,height);texture.needsUpdate=true;};
    img.src=brand;
  }
  return {texture,dispose(){disposed=true;img.onload=null;img.onerror=null;texture.dispose();}};
}

/** Physical optical junction for a real record. No extra records or traffic. */
export function createRecordKnot(seed: number, degree: number, radius: number, title: string) {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(radius * 0.55, 48, 32);
  const icon=recordIcon(title);
  const uniforms = {uGain: {value: 0}, uTime: {value: 0}, uFocus: {value: 0}, uSeed: {value: seed},
    uContacts:{value:Array.from({length:12},()=>new THREE.Vector3())},uContactCount:{value:0}};
  const mat = new THREE.ShaderMaterial({uniforms, transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vV;
      void main(){vP=position; vec4 p=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-p.xyz); gl_Position=projectionMatrix*p;}`,
    fragmentShader: `uniform float uGain,uTime,uFocus,uSeed; uniform vec3 uContacts[12];uniform int uContactCount;varying vec3 vN,vP,vV;
      float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1)),f.x),f.y),f.z);}
      void main(){
        float facing=abs(dot(normalize(vN),normalize(vV)));
        float rim=pow(1.-facing,4.);
        vec3 p=normalize(vP);
        float flow=.5+.5*sin(p.x*8.+sin(p.y*6.+uTime*.12)+uSeed)*sin(p.z*7.-uTime*.09);
        float inner=.5+.5*sin(p.y*11.+p.z*5.+sin(p.x*4.-uTime*.08));
        // Aperiodic microstructure replaces the previous latitude-like wire grid.
        float grain=noise(p*48.+uSeed);
        float ridge=abs(noise(p*19.+noise(p*7.)*2.)-.5);
        float etch=(1.-smoothstep(.018,.065+fwidth(ridge),ridge))*smoothstep(.35,.72,grain);
        float junction=smoothstep(.77,.94,grain);
        float detailFade=1.-smoothstep(.18,.5,length(fwidth(p)));
        vec3 c=vec3(.012,.05,.11)+flow*vec3(.015,.04,.075);
        c+=detailFade*(etch*vec3(.10,.40,.57)+junction*vec3(.22,.58,.72))*(.7+.5*uFocus);
        float edge=pow(1.-facing,7.);
        float rimVariation=.7+.6*noise(p*9.+uSeed);
        c+=rim*vec3(.14,.43,.63)*rimVariation+edge*vec3(.25,.62,.80)*(1.+uFocus*.35);
        float contact=0.;for(int i=0;i<12;i++){if(i<uContactCount)contact+=pow(max(dot(p,uContacts[i]),0.),90.);}
        c+=min(contact,1.)*vec3(.30,.66,.8);
        float alpha=pow(clamp(uGain,0.,1.),.7)*(.18+.47*rim+.22*etch*detailFade+.18*min(contact,1.));
        gl_FragColor=vec4(c*(1.+uFocus*.25),alpha);
      }`});
  const sphere = new THREE.Mesh(geo, mat);
  sphere.renderOrder=3;
  group.add(sphere);
  // A smaller physical back surface gives the central light an enclosed depth layer.
  const innerMat=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:THREE.BackSide,
    vertexShader:mat.vertexShader,
    fragmentShader:`uniform float uGain,uTime,uFocus,uSeed;varying vec3 vN,vP,vV;
      void main(){vec3 p=normalize(vP);float facing=abs(dot(normalize(vN),normalize(vV)));
        float cloud=.5+.5*sin(p.x*5.+sin(p.y*8.+uTime*.09)+uSeed)*sin(p.z*6.-uTime*.07);
        float layer=pow(cloud,3.);float centre=pow(facing,3.);
        vec3 c=vec3(.007,.025,.065)+layer*vec3(.025,.09,.17);
        c+=centre*vec3(.065,.30,.48)*(.7+.5*uFocus);
        gl_FragColor=vec4(c,pow(clamp(uGain,0.,1.),.7)*(.48+.18*layer));}`});
  const volume=new THREE.Mesh(geo,innerMat);volume.scale.setScalar(.82);volume.renderOrder=1;
  group.add(volume);
  // A camera-facing light pattern suspended at the sphere's centre, enclosed by its shell.
  const iconGeo=new THREE.PlaneGeometry(radius*.60,radius*.60);
  const iconMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{...uniforms,uIcon:{value:icon.texture}},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform sampler2D uIcon;uniform float uGain,uFocus,uTime;varying vec2 vUv;
      void main(){vec2 offset=vUv-.5;
        vec2 uv=vUv+offset*sin(length(offset)*9.-uTime*.12)*.009;
        vec4 ink=texture2D(uIcon,uv);
        vec4 haze=vec4(0.);vec4 scatter=vec4(0.);
        for(int i=0;i<8;i++){float a=float(i)*.7854;vec2 d=vec2(cos(a),sin(a));
          vec4 tap=texture2D(uIcon,uv+d*.022);haze+=vec4(tap.rgb*tap.a,tap.a);
          vec4 farTap=texture2D(uIcon,uv+d*.12);scatter+=vec4(farTap.rgb*farTap.a,farTap.a);}
        // Premultiplied taps preserve brand hues in the small internal optical glow.
        vec3 color=(ink.rgb*ink.a+haze.rgb*.10+scatter.rgb*.025)/max(ink.a+haze.a*.10+scatter.a*.025,.0001);
        float strength=.86+.14*uFocus;
        // Bright strokes, restrained body; preserve hue rather than whitening the whole orb.
        color*=2.1+.5*uFocus;
        // A narrow internal scattered-light veil follows the logo's own color and silhouette.
        float enclosure=1.-smoothstep(.38,.5,length(offset));
        gl_FragColor=vec4(color,pow(clamp(uGain,0.,1.),.4)*strength*(ink.a+haze.a*.12+scatter.a*.075)*enclosure);}`});
  const light=new THREE.Mesh(iconGeo,iconMat);light.name="EMBEDDED_RECORD_ICON";
  light.renderOrder=2;
  light.onBeforeRender=(_renderer,_scene,camera)=>{light.quaternion.copy(camera.quaternion);};
  group.add(light);
  return {
    group,
    setContacts(directions: THREE.Vector3[]) {
      const inverse=sphere.quaternion.clone().invert();uniforms.uContactCount.value=Math.min(12,directions.length);
      directions.slice(0,12).forEach((direction,i)=>uniforms.uContacts.value[i].copy(direction).normalize().applyQuaternion(inverse));
    },
    update(world: THREE.Vector3, time: number, gain: number, focus: number, reducedMotion: boolean) {
      group.position.copy(world);group.visible=gain>.01;
      // Rotate the body only: connection geometry remains in the canonical world frame.
      if(!reducedMotion){sphere.rotation.y=time*.08;volume.rotation.y=-time*.045;uniforms.uTime.value=time;}
      uniforms.uGain.value+=(gain-uniforms.uGain.value)*.14;uniforms.uFocus.value+=(focus-uniforms.uFocus.value)*.14;
    },
    dispose(){geo.dispose();mat.dispose();innerMat.dispose();iconGeo.dispose();iconMat.dispose();icon.dispose();},
  };
}

