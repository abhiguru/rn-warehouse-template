/** G-54: the Profile and Change name wording that lives in users.ts. */
import { en } from '../locales/en';
import { gu } from '../locales/gu';

describe('Profile and Change name texts (users.ts)', () => {
  it('reads Change name, not Edit profile', () => {
    expect(en.users.profile.edit).toBe('Change name');
    expect(en.users.profile.editSubtitle).toBe('The name this facility shows for you.');
    expect(en.users.profile.editHint).toBe('Opens the name to change');
    expect(en.users.selfEdit.savedTitle).toBe('Name saved.');
    expect(en.users.selfEdit.saveLabel).toBe('Save name');
  });

  it('has Gujarati values that differ from the English', () => {
    const keys = [
      ['profile', 'edit'],
      ['profile', 'editSubtitle'],
      ['profile', 'editHint'],
      ['selfEdit', 'savedTitle'],
      ['selfEdit', 'saveLabel'],
    ] as const;
    for (const [group, key] of keys) {
      const english = (en.users[group] as Record<string, string>)[key];
      const gujarati = (gu.users[group] as Record<string, string>)[key];
      expect(gujarati.length).toBeGreaterThan(0);
      expect(gujarati).not.toBe(english);
    }
  });
});
