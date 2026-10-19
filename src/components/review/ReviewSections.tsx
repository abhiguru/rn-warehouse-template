/**
 * The Review step's shared folding card (style guide §14.3): one outlined card whose rows are sections, one open at a
 * time. A closed section shows a one-line summary under its heading; its body stays mounted, only hidden (a costly
 * body may be drawn a moment after the screen shows: `deferBody`). Lifted from the GRN Review step, which draws
 * exactly this. The parts read nothing from the store.
 */
import React, { startTransition, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, touchTarget, typography, trackedText } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { TABLE_OUTLINE, makeTableStyles, useTableLayout } from '@/components/common/DetailTable';
import { StatusTag } from '@/components/ui';
import { animateExpand } from '@/utils/layoutMotion';
import { formatNumber } from '@/utils/formatters';
import { t as tr } from '@/i18n';

/** The step's one table card; each section is a row of it. */
export function ReviewCard({ testID, onLayout, children }: { testID?: string; onLayout?: ViewProps['onLayout']; children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.card} onLayout={onLayout} testID={testID}>
      {children}
    </View>
  );
}

export interface ReviewSectionProps {
  id: string;
  /** Test ids are `${testIDPrefix}-section-${id}` (the toggle), `-line`, `-edit` and `${testIDPrefix}-body-${id}`. */
  testIDPrefix: string;
  title: string;
  count?: number;
  /** A critical StatusTag beside the title; it wraps. */
  tag?: string;
  /** Shown under the heading while the section is closed. */
  closedLine?: string | null;
  /** Draws the icon-only pencil beside the chevron, as its own target. */
  onEdit?: () => void;
  editLabel?: string;
  open: boolean;
  onToggle: (id: string) => void;
  first?: boolean;
  /** Test id and layout callback of the section's whole block. */
  blockTestID?: string;
  onLayout?: ViewProps['onLayout'];
  bodyStyle?: StyleProp<ViewStyle>;
  /**
   * Draw the body a moment after the section first appears (after the first frame, as a low-priority update), so
   * the screen shows first. Once drawn it stays mounted, closed or open, as always. For a closed section whose
   * body is costly to draw (the invoice Review's Items). An open section draws it at once.
   */
  deferBody?: boolean;
  /** Called once, when a deferred body has been drawn (timing probe). */
  children: ReactNode;
}

/** A section: its heading opens and closes it; the body is kept mounted (uploads and typed values keep their state). */
export function ReviewSection({
  id,
  testIDPrefix,
  title,
  count,
  tag,
  closedLine,
  onEdit,
  editLabel,
  open,
  onToggle,
  first = false,
  blockTestID,
  onLayout,
  bodyStyle,
  deferBody = false,
  children,
}: ReviewSectionProps) {
  const [ready, setReady] = useState(!deferBody);
  useEffect(() => {
    if (!deferBody) return undefined;
    const frame = requestAnimationFrame(() => startTransition(() => setReady(true)));
    return () => cancelAnimationFrame(frame);
  }, [deferBody]);
  const styles = useThemedStyles(makeStyles);
  const table = useThemedStyles(makeTableStyles);
  const t = useTokens();
  const heading = `${title.toUpperCase()}${count !== undefined ? ` (${formatNumber(count)})` : ''}`;
  const line = !open && closedLine ? closedLine : null;
  const prefix = `${testIDPrefix}-section-${id}`;
  // The whole heading opens and closes the section; the Edit pencil (icon only, the chevron's size, beside it)
  // sits on top of it as its own target (owner, 2026-10-17). The texts and the chevron let touches through to
  // the toggle under them and are not read on their own (the toggle's label carries them).
  return (
    <View
      style={[styles.section, !first && styles.sectionDivider, open && styles.sectionOpen]}
      onLayout={onLayout}
      testID={blockTestID}
    >
      <View style={styles.sectionHeader}>
        <Pressable
          onPress={() => onToggle(id)}
          style={({ pressed }) => [StyleSheet.absoluteFill, pressed && styles.sectionTogglePressed]}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={[title, count !== undefined ? formatNumber(count) : null, tag, line].filter(Boolean).join(', ')}
          testID={prefix}
        />
        <View style={styles.sectionTitleBlock} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionHeaderText}>{heading}</Text>
            {tag ? <StatusTag wrap status="critical" label={tag} /> : null}
          </View>
          {line ? (
            <Text style={styles.sectionClosedLine} numberOfLines={1} testID={`${prefix}-line`}>
              {line}
            </Text>
          ) : null}
        </View>
        {onEdit ? (
          <Pressable
            onPress={onEdit}
            style={({ pressed }) => [styles.editIcon, pressed && styles.editIconPressed]}
            accessibilityRole="button"
            accessibilityLabel={editLabel ?? tr('common.edit')}
            testID={`${prefix}-edit`}
          >
            <Icon name="pencil-outline" size={iconSize.md} color={t.brand.tint} />
          </Pressable>
        ) : null}
        <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={iconSize.md} color={t.icon.secondary} />
        </View>
      </View>
      <View style={[table.details, bodyStyle, open ? undefined : styles.sectionHidden]} testID={`${testIDPrefix}-body-${id}`}>
        {ready || open ? children : null}
      </View>
    </View>
  );
}

/**
 * Which section is open: one at a time, or none. `toggle` opens or closes one; `show` opens one. Both animate the
 * change as an expanding section (200 ms) unless Reduce Motion is on.
 */
export function useReviewSections<S extends string>(initial: S | null): { open: S | null; toggle: (id: S) => void; show: (id: S) => void } {
  const [open, setOpen] = useState<S | null>(initial);
  const reduceMotion = useReducedMotion();
  const toggle = useCallback(
    (id: S) => {
      animateExpand(reduceMotion);
      setOpen((current) => (current === id ? null : id));
    },
    [reduceMotion],
  );
  const show = useCallback(
    (id: S) => {
      animateExpand(reduceMotion);
      setOpen(id);
    },
    [reduceMotion],
  );
  return { open, toggle, show };
}

/** The rows of a section's key-value table (the nested table). */
export function ReviewKeyValues({ children }: { children: ReactNode }) {
  const table = useThemedStyles(makeTableStyles);
  return <View style={table.nested}>{children}</View>;
}

/** A label and its value: side by side, or label over value from font scale 1.5 (§11.4). */
export function ReviewKeyValue({ label, value, emphasized = false, first = false }: { label: string; value: ReactNode; emphasized?: boolean; first?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const table = useThemedStyles(makeTableStyles);
  const { stacked } = useTableLayout();
  return (
    <View
      style={[styles.keyValueRow, stacked && styles.keyValueRowStacked, !first && table.nestedDivider]}
      accessible
      accessibilityLabel={typeof value === 'string' ? `${label}, ${value}` : undefined}
    >
      <Text style={styles.keyValueLabel}>{label}</Text>
      {typeof value === 'string' ? (
        <Text style={[styles.keyValueValue, stacked && styles.keyValueValueStacked, emphasized && styles.keyValueValueEmphasized]}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

/** A long text (notes, an address): label above, value below, left-aligned, at any font scale (as GRN Review's notes). */
export function ReviewKeyBlock({ label, value, first = false }: { label: string; value: string; first?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const table = useThemedStyles(makeTableStyles);
  return (
    <View style={[styles.keyBlock, !first && table.nestedDivider]} accessible accessibilityLabel={`${label}, ${value}`}>
      <Text style={styles.keyValueLabel}>{label}</Text>
      <Text style={styles.keyBlockValue}>{value}</Text>
    </View>
  );
}

const makeStyles = (t: ThemeTokens) => ({
  card: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    borderWidth: TABLE_OUTLINE,
    borderColor: t.table.outline,
    overflow: 'hidden' as const,
    ...t.shadow[2],
  },
  section: { backgroundColor: t.surface.card },
  sectionDivider: { borderTopWidth: 1, borderTopColor: t.table.separator },
  sectionOpen: { backgroundColor: t.table.insetFill },
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minHeight: touchTarget + space.sm,
    paddingVertical: space.sm,
    paddingLeft: space.md + space.xxs,
    paddingRight: space.sm,
  },
  sectionTogglePressed: { backgroundColor: t.brand.subtle },
  sectionTitleBlock: { flex: 1, gap: space.xxs },
  sectionTitleRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, gap: space.sm },
  sectionHeaderText: {
    ...typography.footnote,
    fontWeight: fontWeight.semibold,
    letterSpacing: trackedText(0.5),
    color: t.text.primary,
    flexShrink: 1,
  },
  sectionClosedLine: { ...typography.subhead, color: t.text.secondary },
  sectionHidden: { display: 'none' as const },
  editIcon: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.pill,
  },
  editIconPressed: { backgroundColor: t.brand.subtle },

  keyValueRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    columnGap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    minHeight: touchTarget - space.xs,
  },
  keyValueRowStacked: { flexDirection: 'column' as const, flexWrap: 'nowrap' as const, alignItems: 'flex-start' as const },
  keyValueLabel: { ...typography.subhead, color: t.text.secondary },
  keyValueValue: { ...typography.body, color: t.text.primary, textAlign: 'right' as const, flexShrink: 1 },
  keyValueValueStacked: { textAlign: 'left' as const },
  keyBlock: { paddingVertical: space.sm, paddingHorizontal: space.sm, gap: space.xs },
  keyBlockValue: { ...typography.body, color: t.text.primary, textAlign: 'left' as const },
  keyValueValueEmphasized: { fontWeight: fontWeight.semibold },
});
