import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isMain} from './is-main.mjs';

export function auditPickerCompile(commands) {
 assert.ok(Array.isArray(commands));
 const picker=commands.filter(entry=>typeof entry.file==='string' && entry.file.includes('/@react-native-picker/picker/'));
 assert.ok(picker.length>0,'Picker translation units required');
 for(const entry of picker) {
  const command=Array.isArray(entry.arguments)?entry.arguments.join(' '):entry.command;
  assert.equal(typeof command,'string');
  assert.match(command,/(?:^|\s)-DRN_SERIALIZABLE_STATE(?:=1)?(?:\s|$)/,'Picker React Native ABI compile option missing');
 }
 return {status:'PASS',pickerTranslationUnits:picker.length,missingRNSerializableState:0};
}
if(isMain(import.meta.url)) {
 try {assert.equal(process.argv.length,3);console.log(JSON.stringify(auditPickerCompile(JSON.parse(readFileSync(process.argv[2],'utf8')))));}
 catch {console.error('Picker native compile audit failed');process.exitCode=1;}
}
