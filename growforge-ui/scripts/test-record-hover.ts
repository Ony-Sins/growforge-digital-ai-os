import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {BrainField} from '../src/components/spatial/brain/BrainField';

const geometry=new THREE.SphereGeometry(11,10,8);
const material=new THREE.MeshBasicMaterial({visible:false});
for(const [isHub,source] of [[true,'agent'],[false,'mcp'],[false,'agent']] as const){
  const field={slots:new Map([['record',{def:{isHub,node:{source}}}]])} as unknown as BrainField;
  const radius=BrainField.prototype.getRecordRadius.call(field,'record');
  const pick=new THREE.Mesh(geometry,material);
  pick.scale.setScalar(radius/11);pick.updateMatrixWorld(true);
  // Centre and the visible interior remain directly hittable at near/far camera distances.
  for(const distance of [25,136,272,880]){
    for(const offset of [0,radius*.5,radius*1.2,10]){
      const ray=new THREE.Raycaster(new THREE.Vector3(offset,0,distance),new THREE.Vector3(0,0,-1));
      assert.equal(ray.intersectObject(pick).length>0,offset<radius,`${source}/${distance}/${offset}`);
    }
  }
}
geometry.dispose();material.dispose();
const source=readFileSync('src/components/spatial/brain/BrainField.ts','utf8');
assert.ok(source.includes('slot.pick.scale.setScalar(this.getRecordRadius(id) / 11)'));
console.log('PASS direct visible-body hits at four depths; adjacent empty space no longer hits the oversized invisible hover volume.');
