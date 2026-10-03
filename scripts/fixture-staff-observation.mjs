import { staffFixtureArtifact } from './fixture-current-candidate.mjs';
import assert from 'node:assert/strict';
export {supervisorHTTP as staffHTTP} from './fixture-supervisor-observation.mjs';
export function staffReadCase(c){assert.equal(c.case,'staff-reads');assert.equal(c.kind,'native-staff-read');assert.equal(c.currentStaffControls,true);assert.equal(c.noAutomaticRetry,true);assert.ok([1,2,3].includes(c.nativeAttempt));assert.equal(c.profileId,'947136fa-997b-4a83-819d-1b8bd3ecba68');assert.equal(c.profileName,'New customer');assert.equal(c.origin,'https://backend-core.example.test');assert.equal(c.instanceId,'b0ec3933-5258-4bd5-87f4-d57b13a78971');staffFixtureArtifact(c);return c;}
