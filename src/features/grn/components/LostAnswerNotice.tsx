/**
 * The strip a GRN screen shows while it waits to learn whether a save or a delete reached the server (owner rule
 * D22): the sentence for what is being checked, and "Waiting for the connection…" under it while the phone is
 * offline. Full width, status.neutral background, as the offline banner (docs/STYLE_GUIDE.md §13.9). Read out by
 * screen readers when it appears or changes.
 */
import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useIsDisconnected } from '@/utils/lostAnswer';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { layout, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';

interface LostAnswerNoticeProps {
  /** What is being checked: `errors.lostAnswer.checking` (a save) or `errors.lostAnswer.checkingDelete`. */
  message: string;
}

export const LostAnswerNotice: React.FC<LostAnswerNoticeProps> = ({ message }) => {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  // The same online test the wait uses (`waitForServer`): the phone says it has no network at all.
  const offline = useIsDisconnected();

  return (
    <View style={styles.container} accessibilityLiveRegion="polite" testID="lost-answer-notice">
      <ActivityIndicator size="small" color={t.brand.tint} />
      <View style={styles.texts}>
        <Text style={styles.text}>{message}</Text>
        {offline ? <Text style={styles.text}>{tr('errors.lostAnswer.waiting')}</Text> : null}
      </View>
    </View>
  );
};

const makeStyles = (t: ThemeTokens) => ({
  container: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: layout.marginCompact,
    backgroundColor: t.status.neutral.background,
    borderBottomWidth: 1,
    borderBottomColor: t.border.divider,
  },
  texts: { flex: 1, gap: space.xxs },
  text: { ...typography.footnote, color: t.text.primary },
});

export default LostAnswerNotice;
