import {privateJSON,assertReleased} from './fixture-session-guards.mjs';
import {revocationConfig} from './fixture-revocation-controls.mjs';
try {
 const c=revocationConfig(privateJSON(process.argv[2]));assertReleased(c);
 console.log('{"status":"PASS","scope":"revocation-release-and-reserved-account-guard"}');
}catch{console.error('{"status":"FAIL","category":"REVOCATION_PREFLIGHT_REFUSED"}');process.exitCode=1;}
