/**
 * A list left in its load error loads again by itself when the identity gate opens (WH-298): after an offline start its
 * request was refused while the gate was shut, and nothing else asks again while the list stays on screen.
 */
import { useEffect, useRef, useState } from 'react';
import { operatorResumeGate } from '@/config/operatorResume';

/**
 * @param failed Whether the list is showing its load error.
 * @param reload What the error's Try again does.
 */
export function useReloadWhenVerified(failed: boolean, reload: () => void): void {
  const latest = useRef({ failed, reload });
  // Declared before the effect that reads it, so within one commit it is up to date when that effect runs.
  useEffect(() => {
    latest.current = { failed, reload };
  });

  // The opening is looked at after the next render, not inside the gate's callback: an error the list set just before
  // the gate opened is not on screen yet at that point, and is applied in the same render as this count.
  const [openings, setOpenings] = useState(0);
  useEffect(() => operatorResumeGate.onVerified(() => setOpenings(count => count + 1)), []);
  useEffect(() => {
    if (openings > 0 && latest.current.failed) latest.current.reload();
  }, [openings]);
}
