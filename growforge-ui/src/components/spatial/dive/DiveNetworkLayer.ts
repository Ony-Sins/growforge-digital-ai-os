import * as THREE from "three";
import type { GraphNode, GraphLink } from "@/lib/spatial/obsidianReader";
import { createRecordKnot } from "../brain/recordKnot";

/** Close-scale presentation of the same records. Cords express structure, never invented traffic. */
export class DiveNetworkLayer {
  readonly group=new THREE.Group();
  private records=new Map<string,{node:GraphNode;world:THREE.Vector3;knot:ReturnType<typeof createRecordKnot>;pick:THREE.Mesh;label:THREE.Sprite}>();
  private cords:{ids:[string,string];mesh:THREE.Mesh<THREE.TubeGeometry,THREE.MeshBasicMaterial>}[]=[];
  private selected:string|null=null;
  private hovered:string|null=null;
  private paused=false;
  private lastTime:number|null=null;
  constructor(){this.group.name="DIVE_REAL_NETWORK";this.group.visible=false;}
  setGraph(nodes:GraphNode[],links:GraphLink[],resolve:(id:string)=>THREE.Vector3|null){
    this.clear();
    nodes.forEach((node,index)=>{
      const world=resolve(node.id)?.multiplyScalar(.58);
      // Deterministic fallback only for a record not assigned by Explore yet.
      const a=index*2.3999632297,y=1-2*(index+.5)/Math.max(1,nodes.length);
      const position=world && world.lengthSq()>1 ? world : new THREE.Vector3(Math.cos(a)*Math.sqrt(1-y*y),y,Math.sin(a)*Math.sqrt(1-y*y)).multiplyScalar(55);
      const knot=createRecordKnot(index*.731,node.degree,node.degree>3?7:5,node.title);
      const pick=new THREE.Mesh(new THREE.SphereGeometry(node.degree>3?3.85:2.75,20,16),new THREE.MeshBasicMaterial({visible:false}));
      pick.position.copy(position);pick.userData={nodeId:node.id,node,diveRecord:true};
      const raycast=pick.raycast.bind(pick);pick.raycast=(ray,hits)=>{if(this.group.visible)raycast(ray,hits);};
      const canvas=document.createElement("canvas");canvas.width=512;canvas.height=64;
      const ctx=canvas.getContext("2d")!;ctx.fillStyle="#bcefff";ctx.font="24px Arial";ctx.fillText(node.title.slice(0,36),8,39);
      const label=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,opacity:.48,depthWrite:false}));
      label.position.copy(position).add(new THREE.Vector3(12,4,0));label.scale.set(22,2.75,1);label.raycast=()=>{};
      this.records.set(node.id,{node,world:position,knot,pick,label});this.group.add(knot.group,pick,label);
    });
    const seen=new Set<string>();
    for(const link of links){
      const key=[link.source,link.target].sort().join("|");if(seen.has(key))continue;
      const a=this.records.get(link.source),b=this.records.get(link.target);if(!a||!b)continue;seen.add(key);
      const direction=b.world.clone().sub(a.world).normalize();
      const start=a.world.clone().addScaledVector(direction,a.node.degree>3?3.85:2.75);
      const end=b.world.clone().addScaledVector(direction,-(b.node.degree>3?3.85:2.75));
      const mid=start.clone().lerp(end,.5);mid.addScaledVector(mid.clone().normalize(),5);
      const geo=new THREE.TubeGeometry(new THREE.CatmullRomCurve3([start,mid,end]),48,.10,5,false);
      const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:0x348cae,transparent:true,opacity:.16,depthWrite:false}));mesh.raycast=()=>{};
      this.cords.push({ids:[link.source,link.target],mesh});this.group.add(mesh);
    }
  }
  setFocus(selected:string|null,hovered:string|null){this.selected=selected;this.hovered=hovered;}
  setHovered(hovered:string|null){this.hovered=hovered;}
  setPaused(paused:boolean){this.paused=paused;}
  update(time:number,reduced:boolean){
    const dt=this.lastTime===null?0:Math.min(.05,Math.max(0,time-this.lastTime));this.lastTime=time;
    if(!this.group.visible)return;
    const focus=this.selected??this.hovered;
    if(!reduced&&!this.paused&&!focus)this.group.rotation.y+=dt*.012;
    const neighbors=new Set<string>();for(const cord of this.cords)if(focus&&cord.ids.includes(focus))cord.ids.forEach(id=>neighbors.add(id));
    for(const [id,record] of this.records){
      const gain=!focus ? .65 : id===focus ? 1 : neighbors.has(id) ? .7 : .22;
      record.knot.update(record.world,time,gain,id===focus?1:0,reduced);
      record.label.material.opacity=id===focus ? 1 : neighbors.has(id) ? .7 : .42;
      const directions:THREE.Vector3[]=[];
      for(const cord of this.cords)if(cord.ids.includes(id)&&(!focus||cord.ids.includes(focus))){const other=this.records.get(cord.ids.find(x=>x!==id)!);if(other)directions.push(other.world.clone().sub(record.world));}
      record.knot.setContacts(directions);
    }
    for(const cord of this.cords){const target=!focus ? .16 : cord.ids.includes(focus) ? .5 : .025;cord.mesh.material.opacity+=(target-cord.mesh.material.opacity)*.12;}
  }
  debug(){return{visible:this.group.visible,records:this.records.size,relationships:this.cords.length,selected:this.selected};}
  private clear(){for(const r of this.records.values()){r.knot.dispose();r.pick.geometry.dispose();(r.pick.material as THREE.Material).dispose();r.label.material.map?.dispose();r.label.material.dispose();}for(const c of this.cords){c.mesh.geometry.dispose();c.mesh.material.dispose();}this.records.clear();this.cords=[];this.group.clear();}
  dispose(){this.clear();}
}
