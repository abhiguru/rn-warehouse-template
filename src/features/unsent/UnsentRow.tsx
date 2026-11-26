/**
 * One row of "Unsent items" (WH-301, Design 4.2 item 5 and 4.5): what it is, the customer, when, and its state at the right.
 * An unsent row swipes to Delete (also an accessibility action); a row whose record exists opens it.
 */
import React, { memo, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { StatusTag, type StatusKind } from '@/components/ui/StatusTag';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { formatIdentifier, t as tr } from '@/i18n';
import { fontWeight, iconSize, layout, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { formatLoadedAt } from '@/utils/formatters';
import type { UnsentListRow } from './unsentList';

const makeStyles = (t: ThemeTokens) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    minHeight: layout.objectCellMinHeight,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.md,
    backgroundColor: t.surface.card,
  },
  pressed: { backgroundColor: t.surface.cardPressed },
  divider: { height: 1, marginLeft: space.lg, backgroundColor: t.border.divider },
  main: { flex: 1, gap: space.xxs },
  title: { ...typography.headline, color: t.text.primary },
  subtitle: { ...typography.subhead, color: t.text.secondary },
  footnote: { ...typography.footnote, color: t.text.secondary },
  stack: { alignItems: 'flex-end' as const, gap: space.xs, flexShrink: 1, maxWidth: '45%' as const },
  chevron: { alignSelf: 'center' as const },
  swipe: {
    width: 72,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    backgroundColor: t.destructive.fill,
  },
  swipeText: { ...typography.caption1, fontWeight: fontWeight.semibold, color: t.destructive.onFill },
});

const TAG_STATUS: Record<UnsentListRow['tag'], StatusKind> = {
  saved: 'informative',
  sending: 'informative',
  sent: 'positive',
  waiting: 'neutral',
  held: 'critical',
};

const TAG_TEXT: Record<UnsentListRow['tag'], 'stateSaved' | 'stateSending' | 'stateSent' | 'stateWaiting' | 'stateHeld'> = {
  saved: 'stateSaved',
  sending: 'stateSending',
  sent: 'stateSent',
  waiting: 'stateWaiting',
  held: 'stateHeld',
};

export interface UnsentRowProps {
  row: UnsentListRow;
  divider: boolean;
  onOpen: (row: UnsentListRow) => void;
  onDelete: (row: UnsentListRow) => void;
}

export const UnsentRow = memo(function UnsentRow({ row, divider, onOpen, onDelete }: UnsentRowProps) {
  const styles = useThemedStyles(makeStyles);
  const tokens = useTokens();
  const swipeable = useRef<SwipeableMethods>(null);
  const opens = row.target.grnId !== undefined || row.target.dispatchId !== undefined;
  const deletable = row.section === 'unsent';
  const tagText = tr(`offline.unsent.${TAG_TEXT[row.tag]}`);
  // "Sent · GRN 312": the number is an identifier, so it keeps 0-9.
  const tagLabel = row.sentNumber === null ? tagText : `${tagText} · ${formatIdentifier(row.sentNumber)}`;
  const recorded = tr('offline.unsent.recordedAt', { time: formatLoadedAt(row.recordedAt) });
  const label = [row.title, row.customer, recorded, tagLabel, row.reason].filter(Boolean).join(', ');

  const content = (
    <Pressable
      testID={`unsent-row-${row.id}`}
      disabled={!opens}
      onPress={() => onOpen(row)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole={opens ? 'button' : undefined}
      accessibilityLabel={label}
      accessibilityActions={deletable ? [{ name: 'delete', label: tr('offline.delete.confirm') }] : undefined}
      onAccessibilityAction={event => {
        if (event.nativeEvent.actionName === 'delete') onDelete(row);
      }}
    >
      <View style={styles.main}>
        <Text style={styles.title}>{row.title}</Text>
        {row.customer ? <Text style={styles.subtitle}>{row.customer}</Text> : null}
        <Text style={styles.footnote}>{recorded}</Text>
        {row.reason ? (
          <Text testID={`unsent-row-reason-${row.id}`} style={styles.footnote}>
            {row.reason}
          </Text>
        ) : null}
        {row.photoMissing ? (
          <Text testID={`unsent-row-photo-missing-${row.id}`} style={styles.footnote}>
            {tr('offline.unsent.photoMissing')}
          </Text>
        ) : null}
      </View>
      <View style={styles.stack}>
        <StatusTag testID={`unsent-row-tag-${row.id}`} status={TAG_STATUS[row.tag]} label={tagLabel} wrap />
      </View>
      {opens ? <Icon name="chevron-right" size={iconSize.md} color={tokens.icon.secondary} style={styles.chevron} importantForAccessibility="no" /> : null}
    </Pressable>
  );

  return (
    <View>
      {deletable ? (
        <ReanimatedSwipeable
          ref={swipeable}
          renderRightActions={() => (
            <Pressable
              testID={`unsent-row-delete-${row.id}`}
              style={styles.swipe}
              onPress={() => {
                swipeable.current?.close();
                onDelete(row);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${tr('offline.delete.confirm')}, ${row.title}`}
            >
              <Icon name="trash-can-outline" size={iconSize.lg} color={tokens.destructive.onFill} />
              <Text style={styles.swipeText} maxFontSizeMultiplier={1.6}>
                {tr('offline.delete.confirm')}
              </Text>
            </Pressable>
          )}
          overshootRight={false}
          friction={2}
          rightThreshold={40}
        >
          {content}
        </ReanimatedSwipeable>
      ) : (
        content
      )}
      {divider ? <View style={styles.divider} /> : null}
    </View>
  );
});
