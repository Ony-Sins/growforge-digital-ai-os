import assert from 'node:assert/strict';
import { DEFAULT_SHELL_VISIBILITY, changeShellVisibility, readShellVisibility, shellPanels } from '../src/lib/shellVisibility';

assert.deepEqual(readShellVisibility(null), DEFAULT_SHELL_VISIBILITY);
assert.deepEqual(readShellVisibility('invalid'), DEFAULT_SHELL_VISIBILITY);
assert.deepEqual(readShellVisibility('{"nora":"false","index":null}'), DEFAULT_SHELL_VISIBILITY);
const saved=readShellVisibility('{"nora":false,"index":true,"focus":true}');
assert.deepEqual(saved,{nora:false,index:true,focus:false});
for(const nora of [true,false])for(const index of [true,false]){
  const before={nora,index,focus:false};
  const focused={...before,focus:true};
  assert.deepEqual(shellPanels(focused),{nora:false,index:false});
  assert.deepEqual(shellPanels({...focused,focus:false}),{nora,index});
  assert.deepEqual(changeShellVisibility(focused,'nora',true),{nora:true,index,focus:false});
  assert.deepEqual(changeShellVisibility(focused,'index',true),{nora,index:true,focus:false});
  assert.deepEqual(before,{nora,index,focus:false});
}
console.log('PASS normal/hidden combinations, Focus restoration, independent panel preferences, safe parsing, and device-local persistence excluding transient Focus state.');
