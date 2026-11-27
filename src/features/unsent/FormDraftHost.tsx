/**
 * Keeps the open GRN, dispatch or Edit GRN form as an unfinished form (WH-301, contract section 8). It watches the route:
 * while one of the three forms is open it runs `useFormDraft` for it. It renders nothing. Mounted once beside the phone
 * copy's lifecycle, so the three form layouts are left as they are.
 */
import { useLayoutEffect } from 'react';
import { usePathname } from 'expo-router';
import { useAppSelector } from '@/store/hooks';
import { heldIdOfRoute } from '@/features/holding/heldForm';
import type { FormKind } from './formDrafts';
import { useFormDraft } from './useFormDraft';

interface OpenForm {
  kind: FormKind;
  grnId: string | null;
}

/** Which form the route is, or null. */
export function formOfPath(path: string): OpenForm | null {
  if (path === '/grn-form' || path.startsWith('/grn-form/')) return { kind: 'grn', grnId: null };
  if (path === '/dispatch-form' || path.startsWith('/dispatch-form/')) return { kind: 'dispatch', grnId: null };
  const edit = /^\/grn-edit\/([^/]+)/.exec(path);
  // A held GRN being corrected (WH-304) is never kept as an unfinished form: its Save is the supervisor's decision.
  return edit?.[1] && heldIdOfRoute(decodeURIComponent(edit[1])) === null ? { kind: 'grnEdit', grnId: decodeURIComponent(edit[1]) } : null;
}

// The route as it is now. Written in a layout effect, which runs before any cleanup of the screens the route leaves: a form
// that is emptied as its screen closes is then seen as closed, and kept.
let routePath = '';

function OpenFormDraft({ kind, grnId }: OpenForm) {
  // An edit is offered again only once the GRN is read into the form: what is read would replace it.
  const loaded = useAppSelector(state => state.grnForm.grnId === grnId && state.grnForm.loadedSignature !== null);
  const stillOpen = () => {
    const now = formOfPath(routePath);
    return now?.kind === kind && now.grnId === grnId;
  };
  useFormDraft(kind, grnId, kind === 'grnEdit' ? loaded : true, stillOpen);
  return null;
}

export function FormDraftHost() {
  const path = usePathname();
  useLayoutEffect(() => {
    routePath = path;
  }, [path]);
  const open = formOfPath(path);
  return open ? <OpenFormDraft key={`${open.kind}:${open.grnId ?? ''}`} kind={open.kind} grnId={open.grnId} /> : null;
}
