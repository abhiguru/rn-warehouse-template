/**
 * A vehicle number as it is saved: no spaces at either end and one space where a run of spaces was typed
 * ("  T31   X18 " becomes "T31 X18"); a field of spaces only is empty. Applied when the field is left and before the
 * number is checked and sent; while typing the field keeps what was typed, so the keyboard's space does not fight the cursor.
 */
export function normalizeVehicle(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
