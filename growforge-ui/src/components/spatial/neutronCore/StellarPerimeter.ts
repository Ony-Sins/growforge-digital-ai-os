import * as THREE from "three";

/** Decorative stellar surroundings. Never records, transfers, or hit targets. */
export class StellarPerimeter {
  readonly group = new THREE.Group();
  private materials: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];
  private planets: THREE.Mesh[] = [];
  private orbiters: { object: THREE.Object3D; start: THREE.Vector3; speed: number }[] = [];
  private orbitTime = 0;

  constructor() {
    this.group.name = "STELLAR_PERIMETER";
    const canvas = document.createElement("canvas");
    canvas.width = 512; canvas.height = 1024;
    const context = canvas.getContext("2d");
    if (context) {
      const pixels = context.createImageData(512, 1024);
      for (let y = 0; y < 1024; y++) for (let x = 0; x < 512; x++) {
        const px = (x - 256) / 256, py = (y - 512) / 512;
        const curl = Math.sin(py * 13) * 0.10 + Math.sin(py * 29) * 0.035;
        const width = 0.12 + 0.10 * Math.exp(-py * py * 4);
        const plume = Math.exp(-Math.pow((px - curl) / width, 2)) * Math.pow(1 - Math.abs(py), 1.6);
        const folds = 0.5 + 0.25 * Math.sin(px * 75 + Math.sin(py * 23) * 4) +
                      0.15 * Math.sin(px * 137 - py * 53);
        const disk = Math.sqrt(px * px * 4 + py * py * 16);
        const outside = THREE.MathUtils.smoothstep(disk, 0.85, 1.2);
        const alpha = plume * folds * outside * 0.40;
        const k = (y * 512 + x) * 4;
        pixels.data[k] = 42; pixels.data[k + 1] = 135; pixels.data[k + 2] = 195;
        pixels.data[k + 3] = Math.round(alpha * 255);
      }
      context.putImageData(pixels, 0, 0);
    }
    const gas = this.sprite(canvas, 180, 360);
    gas.position.z = -18;
    // Vertical plumes rejected in visual review; keep resources disposable, not visible.

    const planetVertex = `varying vec3 vN; varying vec3 vP;
      void main(){vN=normal;vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
    const planetFragment = `uniform vec3 uLight; uniform float uOpacity;
      varying vec3 vN; varying vec3 vP;
      void main(){float light=max(0.,dot(normalize(vN),normalize(uLight)));
      float grain=.7+.3*sin(vP.x*4.+sin(vP.y*6.))*sin(vP.z*7.);
      vec3 col=mix(vec3(.001,.003,.005),vec3(.13,.24,.28),pow(light,5.)*grain);
      gl_FragColor=vec4(col,uOpacity);}`;
    for (const [x, y, z, radius] of [[-27,-61,28,9],[45,-33,32,3.1]]) {
      const material = new THREE.ShaderMaterial({
        vertexShader: planetVertex, fragmentShader: planetFragment,
        uniforms: {uLight:{value:new THREE.Vector3(-x,-y,-z)},uOpacity:{value:1}},
        transparent:true,depthWrite:false,
      });
      this.materials.push(material);
      const planet = new THREE.Mesh(new THREE.SphereGeometry(radius,32,24),material);
      planet.position.set(x,y,z); planet.raycast = () => {}; planet.renderOrder=3;
      this.planets.push(planet); this.group.add(planet);
      this.orbiters.push({object:planet,start:planet.position.clone(),speed:0.13+this.planets.length*.025});
    }

    const rockGeometry = new THREE.IcosahedronGeometry(1,0);
    const rockMaterial = new THREE.MeshBasicMaterial({color:0x03070c,transparent:true});
    this.materials.push(rockMaterial);
    const rocks = new THREE.InstancedMesh(rockGeometry,rockMaterial,72);
    const dummy = new THREE.Object3D();
    for(let i=0;i<72;i++) {
      const t=i/71, side=i<44?1:-1;
      dummy.position.set(Math.sin(i*7.13)*(3+t*8),side*(42+t*80),22+Math.sin(i)*5);
      const size=.12+Math.pow((Math.sin(i*13.7)+1)*.5,5)*.7;
      dummy.scale.set(size,size*.75,size);dummy.rotation.set(i,i*.7,i*.3);dummy.updateMatrix();
      rocks.setMatrixAt(i,dummy.matrix);
    }
    // Decorative ejecta was rejected as noise; it does not enter the scene.
    rockGeometry.dispose();

    const cometCanvas=document.createElement("canvas");cometCanvas.width=256;cometCanvas.height=128;
    const cometContext=cometCanvas.getContext("2d");
    if(cometContext){
      const head=cometContext.createRadialGradient(35,91,0,35,91,13);
      head.addColorStop(0,"rgba(245,255,255,.95)");head.addColorStop(.25,"rgba(120,230,255,.65)");head.addColorStop(1,"rgba(40,140,220,0)");
      cometContext.fillStyle=head;cometContext.fillRect(0,0,256,128);
      for(let i=0;i<10;i++){
        cometContext.beginPath();cometContext.moveTo(35,91);
        cometContext.bezierCurveTo(65,50+i,125,35+i*2,238,25+i*4);
        cometContext.strokeStyle=`rgba(65,165,215,${.07-i*.005})`;
        cometContext.lineWidth=1;cometContext.stroke();
      }
    }
    // Both decorative comet sprites were explicitly rejected as marked noise.
    // Orbiting dark bodies remain; named graph records are separate.
  }

  private sprite(canvas:HTMLCanvasElement,width:number,height:number) {
    const texture=new THREE.CanvasTexture(canvas);this.textures.push(texture);
    const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
    this.materials.push(material);
    const sprite=new THREE.Sprite(material);sprite.scale.set(width,height,1);sprite.raycast=()=>{};
    return sprite;
  }

  update(scale:number, links:number, missionCalm:number, deltaSec:number, reducedMotion:boolean) {
    this.group.scale.setScalar(scale);
    if(!reducedMotion)this.orbitTime+=deltaSec;
    for(const {object,start,speed} of this.orbiters){
      const angle=this.orbitTime*speed;
      const c=Math.cos(angle),s=Math.sin(angle);
      object.position.set(start.x*c+start.z*s,start.y+Math.sin(angle*.7)*4,-start.x*s+start.z*c);
      if(object instanceof THREE.Mesh && object.material instanceof THREE.ShaderMaterial){
        object.material.uniforms.uLight.value.copy(object.position).negate();
        if(!reducedMotion)object.rotation.y+=deltaSec*.07;
      }
      if(object instanceof THREE.Sprite)object.material.rotation=Math.sin(angle)*.3;
    }
    // Travelling into BRAIN must not erase celestial bodies at a navigation threshold.
    const opacity=1-missionCalm;
    this.group.visible=opacity>.001;
    for(const material of this.materials) {
      if(material instanceof THREE.ShaderMaterial) material.uniforms.uOpacity.value=opacity;
      else material.opacity=opacity * (material.userData.baseOpacity ?? 1);
    }
  }

  dispose() {
    this.group.traverse(object=>{if(object instanceof THREE.Mesh)object.geometry.dispose();});
    for(const material of this.materials)material.dispose();
    for(const texture of this.textures)texture.dispose();
    this.group.removeFromParent();
  }
}
