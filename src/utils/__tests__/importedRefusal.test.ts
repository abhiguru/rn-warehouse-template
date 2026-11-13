/** WH-180: the sentence for the server's IMPORTED_READ_ONLY refusal, in English and Gujarati, and where it is used. */
import { importedReadOnlyText } from '../importedRefusal';
import { cancelRefusalMessage } from '@/services/invoice-service';
import { paymentRefusalOf } from '@/services/paymentsService';
import { backendHasFeature, resetFacilityRelease, setFacilityRelease } from '@/config/backendFeatures';
import { setLanguage } from '@/i18n';

const mockActive = { origin: 'https://one.example.test', instanceId: 'instance-0001' };
jest.mock('@/config/operatorServer', () => ({ getActiveOperatorServer: () => mockActive }));

const refused = (document?: string) => ({ success: false, reason: 'IMPORTED_READ_ONLY', fields: document ? { document } : {} });
afterEach(() => { setLanguage('en'); resetFacilityRelease(); });

it.each([
  ['grn', "This GRN was imported from the previous system and can't be changed."],
  ['dispatch', "This dispatch was imported from the previous system and can't be changed."],
  ['invoice', "This invoice was imported from the previous system and can't be changed."],
  ['payment', "This payment was imported from the previous system and can't be changed."],
])('names the %s in the sentence', (document, sentence) => {
  expect(importedReadOnlyText(refused(document))).toBe(sentence);
});

it('names an invoice when the server names no document or one the app does not know', () => {
  expect(importedReadOnlyText(refused())).toContain('invoice');
  expect(importedReadOnlyText(refused('spaceship'))).toContain('invoice');
});

it('is silent for every other answer', () => {
  expect(importedReadOnlyText({ success: false, reason: 'STALE_RECORD', fields: {} })).toBeUndefined();
  expect(importedReadOnlyText({ success: true })).toBeUndefined();
  expect(importedReadOnlyText(null)).toBeUndefined();
  expect(importedReadOnlyText('IMPORTED_READ_ONLY')).toBeUndefined();
});

it('speaks Gujarati with the Gujarati word for the document', () => {
  setLanguage('gu');
  expect(importedReadOnlyText(refused('grn'))).toBe('આ આવક પાવતી જૂની સિસ્ટમમાંથી ઇમ્પોર્ટ કરેલ છે અને બદલી શકાતું નથી.');
});

it('is the message of a refused cancel and of a refused payment change', () => {
  expect(cancelRefusalMessage('IMPORTED_READ_ONLY', { document: 'invoice' })).toBe("This invoice was imported from the previous system and can't be changed.");
  expect(paymentRefusalOf('IMPORTED_READ_ONLY', { document: 'payment' })).toMatchObject({ message: "This payment was imported from the previous system and can't be changed." });
});

it('the importedDocuments feature starts with migration 191 and is off for an older or silent server', () => {
  expect(backendHasFeature('importedDocuments')).toBe(false);
  setFacilityRelease(mockActive, { schemaHead: '00000000000190_x' });
  expect(backendHasFeature('importedDocuments')).toBe(false);
  setFacilityRelease(mockActive, { schemaHead: '00000000000191_imported_documents' });
  expect(backendHasFeature('importedDocuments')).toBe(true);
});
