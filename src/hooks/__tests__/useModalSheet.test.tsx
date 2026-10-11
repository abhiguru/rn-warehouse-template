/**
 * useModalSheet keeps dismiss() away from a BottomSheetModal that is not on screen.
 *
 * The stand-in below follows the one rule of @gorhom/bottom-sheet 5.2 that matters here
 * (BottomSheetModal.tsx: handleDismiss, handlePortalRender): dismiss() on a modal that was
 * never presented leaves it "dismissing", and a modal in that state does not render when
 * it is presented. On a phone that showed as a picker that never opened.
 */
import React, { useEffect, useRef } from 'react';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import renderer, { act } from 'react-test-renderer';
import { useModalSheet } from '../useModalSheet';

class LibraryModal {
  status: 'initial' | 'presented' | 'dismissing' | 'dismissed' = 'initial';
  rendered = false;
  onDismiss: () => void = () => {};

  present() {
    // handlePortalRender: a dismissing modal is not rendered
    if (this.status === 'dismissing') return;
    this.rendered = true;
    this.status = 'presented';
  }

  dismiss() {
    if (this.status === 'presented') {
      this.rendered = false;
      this.status = 'dismissed';
      this.onDismiss();
      return;
    }
    // never presented, or dismissed already: nothing closes, so nothing ends this state
    this.status = 'dismissing';
  }
}

/** A sheet shown by a flag, written the way the app's sheets are. */
function FlagSheet({ modal, isVisible, guarded }: { modal: LibraryModal; isVisible: boolean; guarded: boolean }) {
  const ref = useRef(modal as never);
  const sheet = useModalSheet(ref);
  modal.onDismiss = guarded ? sheet.onDismissed : () => {};
  useEffect(() => {
    if (guarded) {
      if (isVisible) sheet.present();
      else sheet.dismiss();
    } else if (isVisible) modal.present();
    else modal.dismiss();
  }, [isVisible, guarded, modal, sheet]);
  return null;
}

const show = (modal: LibraryModal, guarded: boolean, flags: boolean[]) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<FlagSheet modal={modal} isVisible={flags[0]} guarded={guarded} />);
  });
  for (const flag of flags.slice(1)) {
    act(() => tree.update(<FlagSheet modal={modal} isVisible={flag} guarded={guarded} />));
  }
};

describe('a sheet shown by a flag', () => {
  it('never opens when it dismisses the modal on its first render (the defect)', () => {
    const modal = new LibraryModal();
    show(modal, false, [false, true]);
    expect(modal.rendered).toBe(false);
  });

  it('opens the first time it is asked to', () => {
    const modal = new LibraryModal();
    show(modal, true, [false, true]);
    expect(modal.rendered).toBe(true);
  });

  it('opens, closes and opens again', () => {
    const modal = new LibraryModal();
    show(modal, true, [false, true, false]);
    expect(modal.rendered).toBe(false);
    show(modal, true, [false, true]);
    expect(modal.rendered).toBe(true);
  });

  it('opens again after the modal closed itself (swipe down, backdrop, its own X)', () => {
    const modal = new LibraryModal();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<FlagSheet modal={modal} isVisible guarded />);
    });
    expect(modal.rendered).toBe(true);
    // the library closes the modal and reports it; the screen then clears its flag
    act(() => modal.dismiss());
    act(() => tree.update(<FlagSheet modal={modal} isVisible={false} guarded />));
    expect(modal.status).toBe('dismissed');
    act(() => tree.update(<FlagSheet modal={modal} isVisible guarded />));
    expect(modal.rendered).toBe(true);
  });
});

describe('every BottomSheetModal in the app', () => {
  const root = join(__dirname, '..', '..', '..');
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap(name => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : sources(path);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });

  it('is dismissed through useModalSheet, not through its ref', () => {
    // The pricing form presents and dismisses its two modals from press handlers only,
    // so a dismiss there always follows a present.
    const pressHandlersOnly = ['app/item-pricing-form.tsx'];
    const offenders = [...sources(join(root, 'src')), ...sources(join(root, 'app'))]
      .map(path => ({ file: relative(root, path), text: readFileSync(path, 'utf8') }))
      .filter(({ file }) => !pressHandlersOnly.includes(file) && file !== 'src/hooks/useModalSheet.ts')
      .filter(({ text }) => /\bBottomSheetModal\b/.test(text) && /Ref\.current\?\.dismiss\(\)/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});
