/**
 * WH-205 (contract section 3, Texts): the new and changed texts have a Gujarati draft at the same key, and the removed keys
 * are gone from both languages. Key presence only, not wording.
 */
import { en } from '../locales/en';
import { gu } from '../locales/gu';

const at = (tree: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), tree);

const NEW_KEYS = ['gst.billsBlocked.title', 'gst.billsBlocked.admin', 'gst.billsBlocked.other', 'gst.billsBlocked.open', 'gst.strip.text', 'gst.settings.gstinRequired'];

describe('new GST texts', () => {
  it.each(NEW_KEYS)('%s exists in English and in Gujarati, and the Gujarati is not the English', (key) => {
    const english = at(en, key);
    const gujarati = at(gu, key);
    expect(typeof english).toBe('string');
    expect(typeof gujarati).toBe('string');
    expect((gujarati as string).trim()).not.toBe('');
    expect(gujarati).not.toBe(english);
  });

  it('has the settled English words', () => {
    expect(at(en, 'gst.billsBlocked.title')).toBe('No bills yet');
    expect(at(en, 'gst.billsBlocked.admin')).toBe("Save your GST details first. Bills can't be made until then.");
    expect(at(en, 'gst.billsBlocked.other')).toBe("Ask an administrator to save the GST details. Bills can't be made until then.");
    expect(at(en, 'gst.billsBlocked.open')).toBe('Open GST details');
    expect(at(en, 'gst.strip.text')).toBe("Add your GST details. Bills can't be made until then.");
    expect(at(en, 'gst.settings.gstinRequired')).toBe('Enter the GSTIN.');
  });

  it.each(['gst.settings.registered', 'gst.settings.registeredHelp'])('%s is removed from both languages', (key) => {
    expect(at(en, key)).toBeUndefined();
    expect(at(gu, key)).toBeUndefined();
  });
});
