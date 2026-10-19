/**
 * The read-only form of the invoice's sideways line table (docs/STYLE_GUIDE.md 13.7, owner decision 2026-10-19), for the
 * opened lots of Invoice -> Line items. It is the table of "Step 2 of 3 - Items" -> "Show dispatch details" without the
 * editing: the same columns (Dispatch pinned | Date | Months | Days | Qty | Charge | Labour | Tax | Amount; Labour is left out
 * of a one-time lot), headings, formats, widths (`itemsLayout`, sized to the widest text of ALL the invoice's lots, so the
 * columns line up from lot to lot, `space.lg` before each column), alignment, heading row (`HeadingRow`), shared sideways
 * offset (`SidewaysViewport`, one `TableScroll` per lot), edge cues and the hint. Every figure is plain text; the pinned
 * Dispatch cell is a link that opens the dispatch.
 *
 * Structure (lighter than one viewport per row; a lot of 300 lines is two viewports, not 300): the rows are not
 * virtualized (they are drawn inside a `DataTable` detail panel) and each has ONE fixed height, so the pinned column and
 * the scrolling cells line up exactly. The body is one `SidewaysViewport`: `pinned` is a column of all the Dispatch cells,
 * its child one column `content` wide holding every row's cells, with one fade per edge for the full height and one
 * glyph. The heading is the other viewport, on the same `TableScroll`.
 *
 * Long lots are drawn in steps (`FIRST_ROWS`, then `ROWS_PER_STEP` a frame), the dividers are row borders.
 *
 * Screen reader: one element per line. The cells are hidden from it (heading too) and N transparent accessible Views, one
 * row high each, lie over the body at `index * rowHeight`; each reads the whole line and opens the dispatch (a Pressable, as the
 * pinned link does, since Android gives no hover events to a view that ignores touches; with no screen reader they do not exist,
 * so the sideways pan and the touches work as usual).
 */
import React, { startTransition, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useScreenReader } from '@/hooks/useScreenReader';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { formatIdentifier, localizeDigits, t as tr } from '@/i18n';
import { rowWidth, TABLE_OUTLINE, makeTableStyles, useTableLayout, type TableLayout } from '@/components/common/DetailTable';
import { useAppTable } from '@/components/table/appTable';
import { space, touchTarget, typography } from '@/theme/tokens';
import { formatCount, toDate } from '@/utils/formatters';
import { formatInvoiceAmount } from '@/utils/invoiceCalculations';
import type { InvoiceItemData } from '@/types/invoice.types';
import { itemsLayout, type ItemsLayout } from './itemsLayout';
import { columnInset, lineColumnDefs, lineColumnsOf, type LineColumn } from './lineColumns';
import { countText, dateText, monthsText, tableDateText } from './lineText';
import { fieldHeading, rateText } from './itemsModel';
import { makeItemsStyles } from './itemsStyles';
import { makeTableScroll, SidewaysViewport } from './SidewaysViewport';
import { HeadingRow } from './TableParts';

/** One saved dispatch line, as the table shows it. */
export interface ReadOnlyLine {
  id: string;
  dispatchNo?: string;
  dispatchId?: string;
  /** The stored dispatch date; empty or invalid shows a dash. */
  dispatchDate?: string;
  qty: number;
  days: number;
  /** The saved duration in months. */
  months: number;
  charge: number;
  labour: number;
  /** The tax RATE in percent. */
  taxRate: number;
  /** The line's amount with tax. */
  amount: number;
}

/** The lines of one lot and whether the lot is priced one-time. */
export interface ReadOnlyLot {
  lines: readonly ReadOnlyLine[];
  oneTime: boolean;
}

interface Props {
  /** Keys the shared scroll and the test ids (the lot). */
  groupKey: string;
  lines: readonly ReadOnlyLine[];
  oneTime: boolean;
  /** The geometry for ALL the invoice's lots (`readOnlyLayout`), so the columns line up from lot to lot. */
  layout: ItemsLayout;
  onViewDispatch?: (dispatchId: string) => void;
}

const NO_LINES: InvoiceItemData[] = [];

/** The rows drawn at once, and the rows added with each following frame. */
const FIRST_ROWS = 40;
const ROWS_PER_STEP = 80;

const dateOf = (line: ReadOnlyLine): string => (line.dispatchDate ? tableDateText(line.dispatchDate) : '—');
const distinct = (values: string[]): string[] => Array.from(new Set(values));

/**
 * The table geometry over every line of every lot (as Step 2 sizes its table over the whole step). Labour is sized
 * from the lots that show it; the Months texts include "One-time" when a lot is priced that way.
 */
export function readOnlyLayout(screen: TableLayout, lots: readonly ReadOnlyLot[]): ItemsLayout {
  const all = lots.flatMap((lot) => lot.lines.map((line) => ({ line, oneTime: lot.oneTime })));
  const texts = (pick: (entry: { line: ReadOnlyLine; oneTime: boolean }) => string, skip?: (entry: { oneTime: boolean }) => boolean) =>
    distinct((skip ? all.filter((entry) => !skip(entry)) : all).map(pick));
  return itemsLayout(
    screen,
    {
      dispatch: texts(({ line }) => line.dispatchNo || '—'),
      date: texts(({ line }) => dateOf(line)),
      duration: texts(({ line, oneTime }) => monthsText(line.months, oneTime)),
      days: texts(({ line }) => countText(line.days)),
      qty: texts(({ line }) => countText(line.qty)),
      charge: texts(({ line }) => localizeDigits(rateText('charge', line.charge))),
      labour: texts(({ line }) => localizeDigits(rateText('labour_rate', line.labour)), ({ oneTime }) => oneTime),
      tax: texts(({ line }) => localizeDigits(rateText('tax', line.taxRate))),
      amount: texts(({ line }) => formatInvoiceAmount(line.amount)),
    },
    {
      dispatch: tr('common.dispatch'),
      date: tr('common.date'),
      duration: tr('invoice.items.colMonths'),
      days: tr('invoice.items.colDays'),
      qty: tr('invoice.items.colQty'),
      charge: fieldHeading('charge'),
      labour: fieldHeading('labour_rate'),
      tax: fieldHeading('tax'),
      amount: tr('invoice.items.colAmount'),
    },
    false
  );
}

export const ReadOnlyLineTable = React.memo(function ReadOnlyLineTable({ groupKey, lines, oneTime, layout, onViewDispatch }: Props) {
  const t = useTokens();
  const styles = useThemedStyles(makeItemsStyles);
  const detail = useThemedStyles(makeTableStyles);
  const screenReader = useScreenReader();
  const screen = useTableLayout();
  // The lot's own shared sideways position, for as long as the lot stays open.
  const scroll = useMemo(makeTableScroll, []);

  const defs = useMemo(() => lineColumnDefs(layout.lines.widths, oneTime), [layout.lines.widths, oneTime]);
  const model = useAppTable({ data: NO_LINES, columns: defs });
  const table = useMemo(() => lineColumnsOf(model), [defs]);

  // The scrolling part is narrower here than in the step: the panel's padding and the nested card's outline are in the way.
  const viewport = rowWidth(screen) - 2 * TABLE_OUTLINE - space.md - layout.lines.pinned;
  const sideways = table.content > viewport;

  // One height for every row, in both parts, so the pinned cells and the scrolling cells line up (a cell is one line).
  const rowHeight = Math.max(touchTarget + 2 * space.xs, Math.ceil((typography.subhead.lineHeight ?? 20) * screen.scale) + 2 * space.xs);
  const pinnedWidth = table.pinned.width + space.md;

  // A long lot is drawn in steps (the first rows at once, the rest a frame at a time as low-priority updates), so opening
  // a lot of 300 lines does not mount 6,000 views in one go. The rows have a fixed height, so nothing moves while they come.
  const [drawn, setDrawn] = useState(FIRST_ROWS);
  const total = lines.length;
  useEffect(() => {
    if (drawn >= total) return undefined;
    const frame = requestAnimationFrame(() => startTransition(() => setDrawn((count) => count + ROWS_PER_STEP)));
    return () => cancelAnimationFrame(frame);
  }, [drawn, total]);
  const shown = useMemo(() => (drawn >= total ? lines : lines.slice(0, drawn)), [lines, drawn, total]);
  // The last drawn row has no divider under it only when it is the last line.
  const lastIndex = total - 1;
  const rowBorder = (index: number) =>
    index < lastIndex ? { borderBottomWidth: 1, borderBottomColor: t.table.divider } : null;

  const cellText = (line: ReadOnlyLine, column: LineColumn): string => {
    switch (column.id) {
      case 'date':
        return dateOf(line);
      case 'duration':
        return monthsText(line.months, oneTime);
      case 'days':
        return countText(line.days);
      case 'qty':
        return countText(line.qty);
      case 'charge':
        return localizeDigits(rateText('charge', line.charge));
      case 'labour_rate':
        return localizeDigits(rateText('labour_rate', line.labour));
      case 'tax':
        return localizeDigits(rateText('tax', line.taxRate));
      case 'amount':
        return formatInvoiceAmount(line.amount);
      default:
        return '';
    }
  };

  // Date and one-time Months are text (centred); the other centred columns are figures (tabular), as in Step 2.
  const cellStyle = (column: LineColumn) => {
    if (column.id === 'amount') return styles.numberStrong;
    if (column.id === 'date' || (column.id === 'duration' && oneTime)) return styles.columnCentre;
    return column.align === 'center' ? styles.numberCentre : styles.number;
  };

  const spoken = (line: ReadOnlyLine): string => {
    const args = {
      number: formatIdentifier(line.dispatchNo || '—'),
      date: line.dispatchDate && toDate(line.dispatchDate) ? dateText(line.dispatchDate) : '—',
      months: oneTime ? tr('invoice.items.oneTime') : formatCount(Math.round(line.months * 10) / 10, 'month'),
      days: formatCount(line.days, 'day'),
      bags: formatCount(line.qty, 'bag'),
      charge: formatInvoiceAmount(line.charge),
      labour: formatInvoiceAmount(line.labour),
      tax: localizeDigits(rateText('tax', line.taxRate)),
      amount: formatInvoiceAmount(line.amount),
    };
    return tr(oneTime ? 'invoice.detailsTable.lineSpokenOneTime' : 'invoice.detailsTable.lineSpoken', args);
  };

  const hidden = screenReader ? ({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const) : null;

  return (
    <View style={detail.nested} testID={`readonly-lines-${groupKey}`}>
      <View
        accessibilityElementsHidden={screenReader}
        importantForAccessibility={screenReader ? 'no-hide-descendants' : 'auto'}
      >
        <HeadingRow groupKey={groupKey} table={table} scroll={scroll} styles={styles} />
      </View>
      {sideways && !screenReader ? <Text style={styles.hint}>{tr('invoice.items.swipeHint')}</Text> : null}
      <View testID={`invoice-lines-${groupKey}`}>
        <SidewaysViewport
          key={groupKey}
          scroll={scroll}
          content={table.content}
          fill={t.surface.card}
          rowStyle={bodyRow}
          pinned={
            <View style={[styles.pinnedBox, { width: pinnedWidth, paddingRight: 0 }]} {...hidden}>
              {shown.map((line, index) => {
                const canOpen = !!(line.dispatchId && onViewDispatch);
                return (
                  <Pressable
                    key={line.id}
                    onPress={() => {
                      if (line.dispatchId) onViewDispatch?.(line.dispatchId);
                    }}
                    disabled={!canOpen}
                    style={({ pressed }) => [{ height: rowHeight, justifyContent: 'center', paddingLeft: space.md, paddingRight: space.sm }, rowBorder(index), pressed && detail.rowPressed]}
                    accessibilityRole={canOpen ? 'link' : undefined}
                    accessibilityHint={canOpen ? tr('invoice.lineItem.opensDispatchHint') : undefined}
                    testID={`invoice-line-link-${line.id}`}
                  >
                    <Text style={canOpen ? detail.link : styles.primaryStrong} numberOfLines={1}>{line.dispatchNo || '—'}</Text>
                  </Pressable>
                );
              })}
            </View>
          }
        >
          <View style={{ width: Math.max(table.content, viewport) }} {...hidden}>
            {shown.map((line, index) => (
              <View key={line.id} style={[{ flexDirection: 'row', height: rowHeight }, rowBorder(index)]} testID={`invoice-line-${line.id}`}>
                {table.scrolling.map((column) => (
                  <View key={column.id} style={[styles.columnBox, { width: column.width }]}>
                    <Text style={[cellStyle(column), styles.figureText, { paddingRight: columnInset(column.id) }]} numberOfLines={1}>
                      {cellText(line, column)}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </SidewaysViewport>
        {/* The rows not drawn yet keep their height (every row has one), so a lot that mounts again does not move what is below it. */}
        {shown.length < total ? (
          <View style={{ height: (total - shown.length) * rowHeight }} testID={`invoice-lines-spacer-${groupKey}`} {...hidden} />
        ) : null}
        {screenReader
          ? shown.map((line, index) => {
              const canOpen = !!(line.dispatchId && onViewDispatch);
              const open = () => {
                if (line.dispatchId) onViewDispatch?.(line.dispatchId);
              };
              // A view that ignores touches gets no hover events on Android, so explore-by-touch would find nothing here:
              // while a screen reader is on the overlay is a Pressable that does what the pinned link does (style guide 13.7).
              if (!canOpen) {
                // No link, no "disabled": a plain accessible view with the line's label, still found by explore-by-touch.
                return (
                  <View
                    key={line.id}
                    style={[overlay, { top: index * rowHeight, height: rowHeight }]}
                    accessible
                    accessibilityLabel={spoken(line)}
                    testID={`invoice-line-overlay-${line.id}`}
                  />
                );
              }
              return (
                <Pressable
                  key={line.id}
                  onPress={open}
                  style={[overlay, { top: index * rowHeight, height: rowHeight }]}
                  accessible
                  accessibilityRole="link"
                  accessibilityLabel={spoken(line)}
                  accessibilityHint={tr('invoice.lineItem.opensDispatchHint')}
                  accessibilityActions={[{ name: 'activate' }]}
                  onAccessibilityAction={open}
                  testID={`invoice-line-overlay-${line.id}`}
                />
              );
            })
          : null}
      </View>
    </View>
  );
});

const bodyRow = { flexDirection: 'row' as const, alignItems: 'stretch' as const };
const overlay = { position: 'absolute' as const, left: 0, right: 0 };
