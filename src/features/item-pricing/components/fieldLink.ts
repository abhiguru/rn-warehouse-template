/**
 * How the editor's number fields report to the screen: the field registers itself (to be
 * focused by the keyboard's Next key and scrolled above the keyboard), tells when it is
 * focused, and passes the Next key on. Spread onto a ui/Input.
 */

/** What the screen needs from a field: focus it, and where it is on the window. */
export interface FieldNode {
  focus: () => void;
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
}

export interface FieldRegistry {
  register: (key: string, node: FieldNode | null) => void;
  onFocus: (key: string) => void;
  /** The keyboard's Next key on this field. */
  next: (key: string) => void;
}

export const fieldLink = (fields: FieldRegistry | undefined, key: string): object =>
  fields
    ? {
        ref: (node: FieldNode | null) => fields.register(key, node),
        onFocus: () => fields.onFocus(key),
        onSubmitEditing: () => fields.next(key),
        blurOnSubmit: false,
      }
    : {};

/**
 * The same registry with every key under `prefix` ("monthly:band.0.rent"), for a screen that holds more than one
 * form: the keys of two boxes would otherwise collide. The screen's `order` then carries the prefixed keys too.
 */
export const scopeFields = (fields: FieldRegistry | undefined, prefix: string): FieldRegistry | undefined =>
  fields
    ? {
        register: (key, node) => fields.register(`${prefix}:${key}`, node),
        onFocus: key => fields.onFocus(`${prefix}:${key}`),
        next: key => fields.next(`${prefix}:${key}`),
      }
    : undefined;
