/**
 * Which preference sheet of Settings was open when the language changed.
 *
 * A new language rebuilds the navigation tree (docs/I18N.md, "The language
 * switch and screen state"), so Settings is drawn again from the start and its
 * open sheet would close under the person's finger. The sheet is noted here
 * (memory only) just before such a change and taken once by the new Settings.
 */
export type PreferenceSheetId = 'appearance' | 'language' | 'brand';

let reopen: PreferenceSheetId | null = null;

/** Note the sheet to show again after the rebuild that is about to happen. */
export function rememberSheetAcrossRebuild(sheet: PreferenceSheetId): void {
  reopen = sheet;
}

/** The sheet to show on a new Settings screen, once. */
export function takeRememberedSheet(): PreferenceSheetId | null {
  const sheet = reopen;
  reopen = null;
  return sheet;
}
