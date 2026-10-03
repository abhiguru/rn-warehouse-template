import assert from 'node:assert/strict';
import {openSync,readSync,closeSync,fstatSync,lstatSync,realpathSync,constants} from 'node:fs';
import {resolve} from 'node:path';
import {privateJSON,assertReleased} from './fixture-session-guards.mjs';
import {lateDiscoveryConfig,lateDiscoveryEvents,lateDiscoveryOrdering} from './fixture-late-discovery-controls.mjs';
process.umask(0o077);
try {
  const [path,phase,offset,left]=process.argv.slice(2),c=lateDiscoveryConfig(privateJSON(path));assertReleased(c);
  assert.ok(['guard','events','ordering'].includes(phase));
  const log=resolve(c.discoveryLog),st=lstatSync(log);
  assert.equal(realpathSync(log),log);assert.ok(st.isFile()&&st.uid===process.getuid()&&(st.mode&0o077)===0);
  if(phase==='guard')console.log(JSON.stringify({status:'PASS',bytes:st.size}));
  else {
    const start=Number(offset);assert.ok(Number.isSafeInteger(start)&&start>=0&&st.size>=start&&st.size-start<=65536);
    const fd=openSync(log,constants.O_RDONLY|constants.O_NOFOLLOW);let text;
    try {
      const current=fstatSync(fd);assert.equal(current.ino,st.ino);assert.equal(current.dev,st.dev);
      assert.ok(current.size>=start&&current.size-start<=65536);
      const buffer=Buffer.alloc(current.size-start);assert.equal(readSync(fd,buffer,0,buffer.length,start),buffer.length);
      text=buffer.toString('utf8');assert.ok(!text||text.endsWith('\n'),'Complete helper records required');
    }finally{closeSync(fd);}
    const events=lateDiscoveryEvents(text);
    console.log(JSON.stringify(phase==='ordering'?lateDiscoveryOrdering(events,left):{status:'PASS',events}));
  }
}catch{console.error('{"status":"FAIL","category":"LATE_DISCOVERY_OBSERVATION_REFUSED"}');process.exitCode=1;}
