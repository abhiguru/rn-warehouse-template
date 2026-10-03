import {bRejectionConfig} from './fixture-b-rejection-controls.mjs';
import {bApprovalSnapshot,bApprovalSnapshotSQL} from './fixture-b-approval-snapshot.mjs';
export function bRejectionSnapshotSQL(c){bRejectionConfig(c);return bApprovalSnapshotSQL({...c,scope:'isolated-fictional-b-approval'});}
export function bRejectionSnapshot(c,env,execute){bRejectionConfig(c);return bApprovalSnapshot({...c,scope:'isolated-fictional-b-approval'},env,execute);}
