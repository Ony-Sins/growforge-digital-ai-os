import * as THREE from "three";

export type SemanticEdge = readonly [string, string];
type Anchor = {world: THREE.Vector3; gain: number};
const STEPS = 64, STRANDS = 2;

/** Sole owner of canonical graph-edge visuals. Route trunks are geometry, not graph nodes. */
export class SemanticBundles {
  readonly group = new THREE.Group();
  private edges: {ids: SemanticEdge; geo: THREE.BufferGeometry; mat: THREE.LineBasicMaterial; mesh: THREE.LineSegments}[] = [];
  private focus: string | null = null;
  setEdges(edges: SemanticEdge[]) {
    this.dispose();
    for (const ids of edges) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(STEPS * STRANDS * 6), 3));
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(STEPS * STRANDS * 6), 3));
      const mat = new THREE.LineBasicMaterial({color: 0x65c5ec, transparent: true, opacity: 0,
        depthWrite: false, vertexColors: true, blending: THREE.NormalBlending});
      const mesh = new THREE.LineSegments(geo, mat);mesh.frustumCulled=false;mesh.raycast=()=>{};
      mesh.name = `SEMANTIC_EDGE:${ids.join('|')}`;
      this.group.add(mesh);this.edges.push({ids,geo,mat,mesh});
    }
  }
  update(resolve: (id: string) => Anchor | undefined, focus: string | null, proximity = 1, coreRadius = 35, camera?: THREE.Camera) {
    void proximity; // Kept for the established caller contract; idle Explore no longer draws edges.
    this.focus=focus;
    for(const edge of this.edges) {
      const a=resolve(edge.ids[0]), b=resolve(edge.ids[1]);
      if(!a || !b){edge.mesh.visible=false;continue;}
      const relevant=!focus || edge.ids.includes(focus);
      const target=relevant && focus ? Math.min(a.gain,b.gain)*.32 : 0;
      edge.mat.opacity+=(target-edge.mat.opacity)*.14;
      edge.mesh.visible=edge.mat.opacity>.003;
      if(!edge.mesh.visible)continue;
      const direction=b.world.clone().sub(a.world), length=direction.length();
      direction.normalize();
      // Edges leaving the same source in a similar direction share a short smooth trunk.
      const trunkDir=direction.clone();let matches=1;let degree=1;
      for(const other of this.edges) {
        if(other===edge || other.ids[0]!==edge.ids[0])continue;
        degree++;
        const anchor=resolve(other.ids[1]);if(!anchor)continue;
        const d=anchor.world.clone().sub(a.world).normalize();
        const weight=THREE.MathUtils.smoothstep(d.dot(direction),.88,.98);
        trunkDir.addScaledVector(d,weight);matches+=weight;
      }
      trunkDir.divideScalar(matches).normalize();
      const trunk=a.world.clone().addScaledVector(trunkDir,Math.min(12,length*.12));
      const approach=b.world.clone().addScaledVector(direction,-Math.min(12,length*.17));
      const curve=new THREE.CatmullRomCurve3([a.world,trunk,approach,b.world],false,'centripetal');
      const side=new THREE.Vector3(0,1,0).cross(direction);
      if(side.lengthSq()<.01)side.set(1,0,0).cross(direction);
      side.normalize();const up=direction.clone().cross(side).normalize();
      const p=edge.geo.attributes.position.array as Float32Array;
      const colors=edge.geo.attributes.color.array as Float32Array;let index=0;
      const clearance=coreRadius+8;
      // Stable world-space detour. The source determines the side, never the camera.
      const detour=a.world.clone().add(b.world).normalize();
      if(detour.lengthSq()<.01)detour.copy(side);
      const projectedCore=camera ? new THREE.Vector3().project(camera) : null;
      const projectedEdge=camera ? new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).multiplyScalar(coreRadius).project(camera) : null;
      const screenRadius=projectedCore && projectedEdge ? projectedCore.distanceTo(projectedEdge) : 0;
      for(let strand=0;strand<STRANDS;strand++)for(let step=0;step<STEPS;step++)for(let k=0;k<2;k++) {
        const t=(step+k)/STEPS, phase=strand/STRANDS*Math.PI*2;
        const point=curve.getPoint(t), width=Math.sin(Math.PI*t)*Math.min(.45,length*.006);
        point.addScaledVector(side,Math.cos(phase)*width).addScaledVector(up,Math.sin(phase)*width);
        const r=point.length();
        // Smooth radial clearance avoids angular elbows at the avoidance boundary.
        if(r>.001){
          const safeRadius=.5*(r+clearance+Math.sqrt((r-clearance)*(r-clearance)+16));
          point.setLength(safeRadius);
        }else point.copy(detour).multiplyScalar(clearance);
        // Exact endpoint identity is retained even for a record beside the core.
        if(t===0)point.copy(a.world);if(t===1)point.copy(b.world);
        let intensity=THREE.MathUtils.lerp(1/Math.sqrt(degree),1,THREE.MathUtils.smoothstep(t,0,.25));
        if(camera){
          const view=point.clone().applyMatrix4(camera.matrixWorldInverse);
          const distance=-view.z;
          intensity*=THREE.MathUtils.smoothstep(distance,35,110)*(1-.75*THREE.MathUtils.smoothstep(distance,280,650));
          if(projectedCore && screenRadius>0){
            const projected=point.clone().project(camera);
            const offset=Math.hypot(projected.x-projectedCore.x,projected.y-projectedCore.y);
            intensity*=.12+.88*THREE.MathUtils.smoothstep(offset,screenRadius*.92,screenRadius*1.16);
          }
        }
        point.toArray(p,index);colors[index]=intensity;colors[index+1]=intensity;colors[index+2]=intensity;index+=3;
      }
      edge.geo.attributes.position.needsUpdate=true;
      edge.geo.attributes.color.needsUpdate=true;
    }
  }
  debug() {
    return {owner:'SemanticBundles',canonical:this.edges.length,drawn:this.edges.filter(e=>e.mesh.visible).length,
      focused:this.focus, incident:this.focus ? this.edges.filter(e=>e.ids.includes(this.focus!)).length : this.edges.length,
      edges:this.edges.map(e=>({ids:e.ids,opacity:e.mat.opacity,visible:e.mesh.visible}))};
  }
  dispose(){for(const e of this.edges){this.group.remove(e.mesh);e.geo.dispose();e.mat.dispose();}this.edges=[];}
}
