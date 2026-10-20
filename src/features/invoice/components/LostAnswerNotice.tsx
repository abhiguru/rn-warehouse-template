/**
 * LostAnswerNotice - the message strip a locked invoice screen shows while the server is asked about an answer that
 * was lost (owner rule D22): "No answer from the server. Checking whether it was saved…" (or "…deleted…"), and
 * "Waiting for the connection…" under it while the phone is offline.
 *
 * Style guide §13.9 message strip: status.informative background, 1 px border, radius.button, a spinner and the text in
 * status.informative.text. It sits under the header and pushes the content down. A polite live region announces it.
 */

import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { layout, radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';

interface LostAnswerNoticeProps {
  /** The lost answer was a delete's: "…whether it was deleted…" instead of "…whether it was saved…". */
  deleting?: boolean;
}

const makeStyles = (t: ThemeTokens) => ({
  strip: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
    marginHorizontal: layout.marginCompact,
    marginTop: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderWidth: 1,
    borderRadius: radius.button,
    backgroundColor: t.status.informative.background,
    borderColor: t.status.informative.border,
  },
  text: {
    ...typography.footnote,
    flex: 1,
    color: t.status.informative.text,
  },
});

export function LostAnswerNotice({ deleting = false }: LostAnswerNoticeProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const offline = useIsOffline();
  const checking = tr(deleting ? 'errors.lostAnswer.checkingDelete' : 'errors.lostAnswer.checking');
  const waiting = offline ? tr('errors.lostAnswer.waiting') : null;

  return (
    <View
      style={styles.strip}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={waiting ? `${checking} ${waiting}` : checking}
      testID="invoice-lost-answer"
    >
      <ActivityIndicator size="small" color={t.status.informative.text} />
      <Text style={styles.text}>{waiting ? `${checking}\n${waiting}` : checking}</Text>
    </View>
  );
}

export default LostAnswerNotice;
