import { TABLE_OUTLINE, makeTableStyles } from '@/components/common/DetailTable';
import { fontWeight, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';

/**
 * Styles of the parts one group's card is drawn in. The card is several list rows (head, shared rows,
 * total, toggle and, while open, column headings and lines): `top`, `side` and `bottom` give them one
 * outline; the last part draws `bottom`. No part
 * uses a negative margin, which a list measures wrongly.
 */
export const makeItemsStyles = (t: ThemeTokens) => {
  const table = makeTableStyles(t);
  return {
    top: {
      backgroundColor: t.surface.card,
      borderTopLeftRadius: radius.card,
      borderTopRightRadius: radius.card,
      borderWidth: TABLE_OUTLINE,
      borderBottomWidth: 0,
      borderColor: t.table.outline,
      paddingHorizontal: space.md,
      paddingTop: space.md,
      paddingBottom: space.sm,
    },
    side: {
      backgroundColor: t.surface.card,
      borderLeftWidth: TABLE_OUTLINE,
      borderRightWidth: TABLE_OUTLINE,
      borderColor: t.table.outline,
    },
    bottomGap: { paddingBottom: space.md },
    bottom: {
      backgroundColor: t.surface.card,
      borderBottomLeftRadius: radius.card,
      borderBottomRightRadius: radius.card,
      borderWidth: TABLE_OUTLINE,
      borderTopWidth: 0,
      borderColor: t.table.outline,
      ...t.shadow[0],
    },
    headerRow: { ...table.headerRow, alignItems: 'flex-end' as const },
    headerText: { ...table.headerCell },
    headerNumber: { ...table.headerCell, textAlign: 'right' as const },
    hint: { ...typography.footnote, color: t.text.secondary, paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.xs },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: space.sm,
      minHeight: touchTarget,
      paddingHorizontal: space.md,
      paddingVertical: space.xs,
    },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: t.table.divider },
    grow: { flex: 1, minWidth: 0 },
    primaryStrong: table.primaryStrong,
    secondary: table.secondary,
    number: table.number,
    numberStrong: table.numberStrong,
    label: { ...typography.subhead, color: t.text.primary, flex: 1, minWidth: 0 },
    note: { ...typography.footnote, color: t.text.secondary, paddingHorizontal: space.md, paddingBottom: space.xs },
    error: { ...typography.footnote, color: t.status.negative.text, paddingHorizontal: space.md, paddingBottom: space.xs },
    // Group head
    headRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: space.sm },
    headContent: { flex: 1, minWidth: 0 },
    nameRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const },
    name: { ...typography.headline, color: t.text.primary, flex: 1, minWidth: 0 },
    pencil: {
      width: touchTarget,
      height: touchTarget,
      marginVertical: -space.md,
      marginRight: -space.sm,
      borderRadius: radius.button,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    pencilPressed: { backgroundColor: t.brand.subtle },
    chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: space.xs, paddingTop: space.xs },
    chip: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      backgroundColor: t.status.neutral.background,
      paddingHorizontal: space.sm,
      paddingVertical: space.xxs,
      borderRadius: radius.field,
      gap: space.xs,
      maxWidth: '100%' as const,
      flexShrink: 1,
    },
    chipText: { ...typography.caption1, fontWeight: fontWeight.semibold, color: t.status.neutral.text, flexShrink: 1 },
    dispatched: { ...typography.footnote, color: t.text.secondary, paddingTop: space.xs },
    headTotal: { alignItems: 'flex-end' as const, flexShrink: 0 },
    headTotalUnder: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'baseline' as const, gap: space.sm, paddingTop: space.xs },
    headTotalLabel: { ...typography.caption1, color: t.text.secondary },
    headTotalValue: { ...typography.headline, color: t.text.primary, textAlign: 'right' as const, fontVariant: ['tabular-nums' as const] },
    // Line card
    card: {
      paddingHorizontal: space.md,
      paddingVertical: space.md,
      gap: space.xs,
    },
    cardHead: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'flex-start' as const, gap: space.sm },
    cardTitle: { ...typography.headline, color: t.text.primary, flex: 1, minWidth: 0 },
    block: { paddingHorizontal: space.md, paddingVertical: space.md, gap: space.xs, backgroundColor: t.table.insetFill },
    blockTitle: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.text.primary },
    prefix: { ...typography.body, color: t.text.secondary },
    // Total
    totalRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      gap: space.md,
      minHeight: touchTarget,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      borderTopWidth: 1,
      borderTopColor: t.table.separator,
    },
    // Toggle that opens a group's dispatch lines
    toggleRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: space.sm,
      minHeight: touchTarget,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      borderTopWidth: 1,
      borderTopColor: t.table.separator,
    },
    toggleError: { ...typography.footnote, color: t.status.negative.text, paddingHorizontal: space.md, paddingBottom: space.sm },
    togglePressed: { backgroundColor: t.brand.subtle },
    toggleText: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.text.primary, flex: 1, minWidth: 0 },
    totalLabel: { ...typography.subhead, fontWeight: fontWeight.semibold, color: t.text.primary, flexShrink: 1 },
    totalValue: { ...typography.headline, color: t.text.primary, fontVariant: ['tabular-nums' as const], textAlign: 'right' as const },
    // Page
    empty: { padding: space.giant, alignItems: 'center' as const, gap: space.sm },
    emptyTitle: { ...typography.title3, color: t.text.primary, textAlign: 'center' as const },
    emptyText: { ...typography.subhead, color: t.text.secondary, textAlign: 'center' as const },
    listHeader: { paddingBottom: space.sm, alignItems: 'flex-start' as const },
    loadingRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm, paddingVertical: space.sm },
    loadingText: { ...typography.subhead, color: t.text.secondary },
  };
};
export type ItemsStyles = ReturnType<typeof makeItemsStyles>;
