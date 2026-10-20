/**
 * The strip over a screen that is locked while the server is asked what became of a create, save or delete that got no
 * answer (owner rule D22): "No answer from the server. Checking whether it was saved…" (or "deleted"), and, while the
 * phone is offline, that it is waiting for the connection.
 */
import React from 'react';
import { View } from 'react-native';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { space } from '@/theme/tokens';
import { t as tr } from '@/i18n';

interface LostAnswerStripProps {
  /** What the request was: a create or save ("saved") or a delete ("deleted"). */
  kind: 'save' | 'delete';
  testID?: string;
}

export function LostAnswerStrip({ kind, testID }: LostAnswerStripProps) {
  const offline = useIsOffline();
  const message = [
    tr(kind === 'delete' ? 'errors.lostAnswer.checkingDelete' : 'errors.lostAnswer.checking'),
    offline ? tr('errors.lostAnswer.waiting') : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <View style={{ marginHorizontal: space.lg, marginTop: space.sm }} accessibilityLiveRegion="polite" testID={testID}>
      <InlineValidation variant="warning" message={message} />
    </View>
  );
}
