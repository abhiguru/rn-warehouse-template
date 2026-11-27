/**
 * The strip on a GRN that says a change replaced someone's newer entry (WH-303; product/design/offline-capture.md 6.2): a
 * message strip in the critical status that asks for a look, the title, one line per entry (the first three, then "Show
 * all"), and for administrators "Mark as checked". Staff roles only; a customer account never gets entries.
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { Button } from '@/components/ui/Button';
import { NeedsConnectionLine } from '@/features/phone-copy/components/NeedsConnectionLine';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import type { RpcGrnReplacement } from '@/types/rpc-canonical.types';
import { iconSize, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { needsConnectionLabel } from '@/features/phone-copy/useNeedsConnection';
import { replacedLineText } from './replacedLineText';

/** More than this many entries: the first lines, then "Show all". */
export const REPLACED_LINES_SHOWN = 3;

const makeStyles = (t: ThemeTokens) => ({
  strip: {
    gap: space.xs,
    padding: space.md,
    marginHorizontal: space.lg,
    marginVertical: space.sm,
    borderRadius: radius.button,
    borderWidth: 1,
    backgroundColor: t.status.critical.background,
    borderColor: t.status.critical.border,
  },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  title: { ...typography.footnote, color: t.status.critical.text, flexShrink: 1, fontWeight: '600' as const },
  line: { ...typography.footnote, color: t.status.critical.text },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.sm, alignItems: 'center' as const },
});

interface Props {
  entries: readonly RpcGrnReplacement[];
  /** Administrators only. */
  canMarkChecked: boolean;
  /** The phone has no connection: "Mark as checked" needs the server. */
  needsConnection: boolean;
  onMarkChecked: (ids: string[]) => void;
  /** The mark is being sent. */
  busy?: boolean;
  /** Item ids that appear on more than one lot of this GRN (the lot's mark or rack then tells them apart, DQ11). */
  repeatedItemNames?: ReadonlySet<string>;
}

export function ReplacedStrip({ entries, canMarkChecked, needsConnection, onMarkChecked, busy = false, repeatedItemNames }: Props) {
  const styles = useThemedStyles(makeStyles);
  const tokens = useTokens();
  const [all, setAll] = useState(false);
  if (entries.length === 0) return null;
  const shown = all ? entries : entries.slice(0, REPLACED_LINES_SHOWN);
  const textOf = (entry: RpcGrnReplacement) =>
    replacedLineText(entry, tr, { sameItemLots: entry.lot_item_name ? repeatedItemNames?.has(entry.lot_item_name) === true : false });
  return (
    <View style={styles.strip} testID="grn-details-replaced-strip">
      <View style={styles.titleRow} accessible accessibilityRole="header" testID="grn-details-replaced-strip-title">
        <Icon name="alert-outline" size={iconSize.sm} color={tokens.status.critical.text} importantForAccessibility="no" />
        <Text style={styles.title}>{tr('offline.replaced.title')}</Text>
      </View>
      {shown.map(entry => (
        <Text key={entry.id} style={styles.line} accessibilityLabel={textOf(entry)} testID={`grn-details-replaced-line-${entry.id}`}>
          {textOf(entry)}
        </Text>
      ))}
      <View style={styles.actions}>
        {!all && entries.length > REPLACED_LINES_SHOWN ? (
          <Button type="tertiary" onPress={() => setAll(true)} testID="grn-details-replaced-show-all">
            {tr('offline.replaced.showAll', { count: entries.length })}
          </Button>
        ) : null}
        {canMarkChecked ? (
          <Button
            type="tertiary"
            onPress={() => onMarkChecked(entries.map(entry => entry.id))}
            disabled={needsConnection || busy}
            accessibilityLabel={needsConnection ? needsConnectionLabel(tr('offline.replaced.markChecked')) : undefined}
            testID="grn-details-replaced-mark-checked"
          >
            {tr('offline.replaced.markChecked')}
          </Button>
        ) : null}
      </View>
      {canMarkChecked && needsConnection ? (
        <NeedsConnectionLine testID="grn-details-replaced-mark-checked-needs-connection" text={tr('components.offlineRead.needsConnection')} />
      ) : null}
    </View>
  );
}
