import {privateJSON,assertReleased} from './fixture-session-guards.mjs';
import {realtimeConfig} from './fixture-realtime-controls.mjs';
const c=privateJSON(process.argv[2]);realtimeConfig(c);assertReleased(c);
console.log('{"status":"PASS","scope":"realtime-release-guard"}');
