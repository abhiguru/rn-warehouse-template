/**
 * Unfinished forms (WH-301, contract section 8): while a GRN, dispatch or Edit GRN form is open, its state is saved to the
 * phone one second after the last change and at once when the app goes to the background or the form closes. It is kept by
 * every close but the person's own "Discard" and a successful save (`endFormDraft`), and offered again when that form is
 * opened. Where the facility has no phone copy the hook does nothing.
 */
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { hasCapability } from '@/config/facilityCapabilities';
import { t } from '@/i18n';
import { useAppStore } from '@/store/hooks';
import { hydrateDraft as hydrateGrn, selectGRNFormChanged, type GRNFormState } from '@/store/slices/grnFormSlice';
import { hydrateDraft as hydrateDispatch } from '@/store/slices/dispatchFormSlice';
import type { DispatchFormState } from '@/types/dispatch.types';
import { askAlert } from '@/utils/alert';
import { formatLoadedAt } from '@/utils/formatters';
import { createLogger } from '@/utils/logger';
import { endFormDraft, formDraftEpoch, isSessionEnding, loadFormDraft, saveFormDraft, type FormKind } from './formDrafts';
import { clearRestoredFormNumberMode, getFormNumberMode, isNumberMode, restoreFormNumberMode } from './formNumberMode';

const logger = createLogger('[form-draft]');

/** How long after the last change the form is saved. */
const SAVE_DELAY_MS = 1000;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isGrnState = (value: unknown): value is GRNFormState => isRecord(value) && isRecord(value.header) && Array.isArray(value.items);
const isDispatchState = (value: unknown): value is DispatchFormState =>
  isRecord(value) && isRecord(value.header) && Array.isArray(value.items) && Array.isArray(value.images);

// "Not finished" opens a form that is to be continued without the question.
let continueNext: { kind: FormKind; grnId: string | null } | null = null;
export function requestContinue(kind: FormKind, grnId: string | null): void {
  continueNext = { kind, grnId };
}
function takeContinue(kind: FormKind, grnId: string | null): boolean {
  const wanted = continueNext?.kind === kind && continueNext.grnId === grnId;
  if (wanted) continueNext = null;
  return wanted;
}

// The open form's flush, for the Save that the 2-hour limit refuses: the form is then kept as it stands.
let flushOpenForm: (() => Promise<void>) | null = null;
export function flushFormDraft(): Promise<void> {
  return flushOpenForm ? flushOpenForm() : Promise.resolve();
}

/** The form has something the person entered (as the first step's own "discard?" question reckons it). */
const filled = (...texts: (string | null | undefined)[]): boolean => texts.some(text => typeof text === 'string' && text !== '');

const dispatchHasData = (state: DispatchFormState): boolean =>
  state.dispNoTyped === true ||
  state.dateChosenByUser === true ||
  filled(state.header.customer_id, state.header.registration, state.header.note) ||
  state.items.length > 0 ||
  state.images.length > 0;

const grnHasData = (state: GRNFormState): boolean =>
  state.grNoTyped ||
  state.dateChosen ||
  filled(state.header.customer_id, state.header.sender_id, state.header.sender_name, state.header.registration, state.header.note) ||
  state.header.gr_images.length > 0 ||
  state.items.length > 0;

const askResume = (kind: FormKind, number: string | null, startedAt: number, customer: string | null): Promise<'continue' | 'new'> => {
  const title =
    kind === 'grn' ? t('offline.resume.grnTitle') : kind === 'dispatch' ? t('offline.resume.dispatchTitle') : t('offline.resume.editTitle', { number: number ?? '' });
  const time = formatLoadedAt(startedAt);
  const message = customer ? t('offline.resume.message', { time, customer }) : t('offline.resume.messageNoCustomer', { time });
  return askAlert<'continue' | 'new'>(
    title,
    message,
    [
      { text: t('offline.resume.continue'), value: 'continue' },
      { text: kind === 'grnEdit' ? t('offline.resume.startAgain') : t('offline.resume.startNew'), value: 'new' },
    ],
    'continue'
  );
};

/** Today's discard question, asked before a kept form goes. */
const confirmDiscard = async (kind: FormKind): Promise<boolean> => {
  const title = kind === 'grn' ? t('components.steps.discardFor.grn') : kind === 'dispatch' ? t('components.steps.discardFor.dispatch') : t('common.discardChangesTitle');
  const message = kind === 'grnEdit' ? t('common.discardChangesMessage') : t('grn.form.discardMessage');
  const answer = await askAlert<'keep' | 'discard'>(
    title,
    message,
    [
      { text: t('common.cancel'), style: 'cancel', value: 'keep' },
      { text: t('common.discard'), style: 'destructive', value: 'discard' },
    ],
    'keep'
  );
  return answer === 'discard';
};

/**
 * `enabled` is true once the form is in its starting state (a new form after its reset; an edit once the GRN is read). The
 * answer's `ready` is true when the question about a kept form has been answered, or when there is nothing to ask.
 */
export function useFormDraft(kind: FormKind, grnId: string | null, enabled: boolean, stillOpen: () => boolean): { ready: boolean } {
  const store = useAppStore();
  const on = hasCapability('sync');
  // The host's answer to "is the form's screen still the route?" is read when a form empties, not when it is made.
  const stillOpenRef = useRef(stillOpen);
  useEffect(() => {
    stillOpenRef.current = stillOpen;
  });
  const [ready, setReady] = useState(!on);

  // Offer a kept form once.
  useEffect(() => {
    if (!on || !enabled || ready) return undefined;
    let live = true;
    const decide = async () => {
      const draft = await loadFormDraft(kind, grnId);
      if (draft === null || !(kind === 'dispatch' ? isDispatchState(draft.state) : isGrnState(draft.state))) {
        if (live) setReady(true);
        return;
      }
      let answer: 'continue' | 'new' = takeContinue(kind, grnId) ? 'continue' : await askResume(kind, grnIdNumber(draft.state), draft.startedAt, draft.customer);
      while (answer === 'new') {
        if (await confirmDiscard(kind)) {
          await endFormDraft(kind, grnId);
          break;
        }
        answer = await askResume(kind, grnIdNumber(draft.state), draft.startedAt, draft.customer);
      }
      if (!live) return;
      if (answer === 'continue') {
        const savedMode = isRecord(draft.state) && isNumberMode(draft.state.numberMode) ? draft.state.numberMode : null;
        if ((kind === 'grn' || kind === 'dispatch') && savedMode !== null) {
          restoreFormNumberMode(kind, savedMode);
        }
        if (isDispatchState(draft.state)) store.dispatch(hydrateDispatch(draft.state));
        else if (isGrnState(draft.state)) store.dispatch(hydrateGrn(draft.state));
      }
      setReady(true);
    };
    void decide().catch(error => {
      logger.warn('The question about a kept form failed', error instanceof Error ? error.message : 'unknown');
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, [on, enabled, ready, kind, grnId, store]);

  // Save as the person types.
  const latest = useRef<{ state: GRNFormState | DispatchFormState; epoch: number } | null>(null);
  useEffect(() => {
    if (!on || !ready || !enabled) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const write = async () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      const kept = latest.current;
      // A form that was ended (discarded, saved) since this state was seen is not written again.
      if (kept?.epoch !== formDraftEpoch()) return;
      const name = kept.state.header.customer_name;
      const customer = name === '' ? null : name;
      // N5 (WH-161): keep the form's number mode with the unfinished form so continuing online still stays pending/typed.
      const stateToSave = kind === 'grn' || kind === 'dispatch' ? { ...kept.state, numberMode: getFormNumberMode(kind) } : kept.state;
      await saveFormDraft({ kind, grnId, state: stateToSave, customer });
    };
    const flush = async () => {
      await write();
    };
    flushOpenForm = flush;
    const look = () => {
      const root = store.getState();
      const state = kind === 'dispatch' ? root.dispatchForm : root.grnForm;
      const saving = kind === 'dispatch' ? root.dispatchForm.is_saving : root.grnForm.isSaving;
      if (saving) return;
      const changed = kind === 'dispatch' ? dispatchHasData(root.dispatchForm) : kind === 'grnEdit' ? selectGRNFormChanged(root) : grnHasData(root.grnForm);
      if (!changed) {
        // Something was entered and now nothing is: the person discarded the form, or it was saved. Not when the session
        // ended (the reset of a sign-out), and not when the form's screen is already left (a layout empties its form as it
        // closes): the form is then kept as it was last saved.
        if (latest.current !== null && !isSessionEnding() && stillOpenRef.current()) {
          latest.current = null;
          void endFormDraft(kind, grnId);
        }
        return;
      }
      if (latest.current?.state === state) return;
      latest.current = { state, epoch: formDraftEpoch() };
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => void write(), SAVE_DELAY_MS);
    };
    look();
    const unsubscribe = store.subscribe(look);
    const appState = AppState.addEventListener('change', next => {
      if (next !== 'active') void write();
    });
    return () => {
      unsubscribe();
      appState.remove();
      if (flushOpenForm === flush) flushOpenForm = null;
      void write();
      if (kind === 'grn' || kind === 'dispatch') clearRestoredFormNumberMode(kind);
    };
  }, [on, ready, enabled, kind, grnId, store]);

  return { ready };
}

function grnIdNumber(state: unknown): string | null {
  return isRecord(state) && isRecord(state.header) && typeof state.header.gr_no === 'string' ? state.header.gr_no : null;
}
