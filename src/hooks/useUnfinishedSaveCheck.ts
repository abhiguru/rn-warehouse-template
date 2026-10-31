/**
 * At app start, once the facility session is ready (a profile in the store: see useAuthGuard), asks the server what
 * became of a GRN or dispatch whose save was in flight when the app last closed, and tells the person
 * (src/services/unfinishedSaveCheck.ts). It runs again for a new session (another sign-in, another facility): the
 * entries are kept per facility and per person, so each session sees only its own.
 */
import { useEffect } from 'react';
import { router, type Href } from 'expo-router';
import { useAppSelector } from '@/store/hooks';
import { checkUnfinishedSaves } from '@/services/unfinishedSaveCheck';
import type { UnfinishedSaveKind } from '@/services/unfinishedSaves';

type AuthState = { auth: { userProfile?: { id?: string } | null } };

/** The details page of the saved document. */
const detailsRoute = (kind: UnfinishedSaveKind, id: string): Href =>
  (kind === 'grn' ? `/grn-details/${id}` : kind === 'invoice' ? `/invoice-details/${id}` : `/dispatch-details/${id}`) as Href;

export function useUnfinishedSaveCheck(): void {
  const profileId = useAppSelector((state: AuthState) => state.auth.userProfile?.id);

  useEffect(() => {
    if (!profileId) return;
    void checkUnfinishedSaves({ open: (kind, id) => router.push(detailsRoute(kind, id)) });
  }, [profileId]);
}
