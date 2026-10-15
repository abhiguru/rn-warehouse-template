/**
 * Two 32-bit FNV-1a lanes (the second over the text backwards) as 16 hex digits: enough to
 * recognise one refresh token again, and nothing a reader of a sign-out marker could use.
 * Shared by the association session and the facility session.
 */
export function digestOf(text: string): string {
  let forward = 0x811c9dc5;
  let backward = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    forward = Math.imul(forward ^ text.charCodeAt(i), 0x01000193);
    backward = Math.imul(backward ^ text.charCodeAt(text.length - 1 - i), 0x01000193);
  }
  return (forward >>> 0).toString(16).padStart(8, '0') + (backward >>> 0).toString(16).padStart(8, '0');
}
