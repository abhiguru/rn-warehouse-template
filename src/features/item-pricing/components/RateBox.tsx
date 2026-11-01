/**
 * The rate box: one rate of one scope (a default rate or one customer's own) of one price type, edited in place, laid
 * out as the GRN Change rate screen is (owner, 2026-10-20). Top to bottom: the unit of the rate, the "From <date>" line
 * (RateStartLine: the rate's own start at rest, the day the new rate starts once the box is changed), the strip of a
 * refused save, then for every weight band its band line, From and Up to, and Rent, Labour and Tax with + and − under
 * each (RateBandFields); below them the way to copy the bands of another item (a new rate). The "From <date>" line is
 * the same height at rest and while edited, and nothing else appears above the bands on the first edit, so the first
 * tap on a + or − moves nothing under it. The change summary and Save live in the page's RateSaveBar (ScopeSaveBar),
 * not here. A `locked` box shows its figures and the note that the other box must be saved or discarded first (one box
 * is edited at a time); a `readOnly` box only shows them.
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/RadioButton';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { useThemedStyles } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { layout, space, typography, type ThemeTokens } from '@/theme/tokens';
import type { PriceType } from '@/types/item-pricing.types';
import type { TierTag } from '../standardRate';
import { unitText } from '../rateText';
import type { UseRateEditor } from '../useRateEditor';
import { priceTypeLabel } from '../utils/priceLabels';
import { CopyTiersSheet, confirmReplaceBands } from './CopyTiersSheet';
import { EditorStrip } from './EditorStrip';
import type { FieldRegistry } from './fieldLink';
import { RateBandFields } from './RateBandFields';
import { RateStartLine } from './RateStartLine';

export interface RateBoxProps {
  editor: UseRateEditor;
  fields?: FieldRegistry;
  /** The text of the "From <date>" line while nothing is changed: since when the rate is in force. */
  caption?: string;
  /** Changes when the page's Save bar asks for the start day choice: the "From <date>" line opens it. */
  startSignal?: number;
  /** Whether the rate is a one-time rate until the editor's draft says so (the draft decides once it is open). */
  oneTime?: boolean;
  /** One tag per band ('Standard' or 'This item'), shown while nothing in the box is changed. */
  tags?: TierTag[] | null;
  /** The other box is being edited: show the figures, say why they cannot be typed in. */
  locked?: boolean;
  readOnly?: boolean;
  /** The item's packaging (Bag, Box, Crate), for "per box" in the unit line and the field labels. */
  packaging?: string | null;
  /**
   * Draw the unit line ("per bag, per month") above the table (default: yes). The customer's page passes false when the
   * "Default rate: ₹3.00–₹6.00 per bag, per month" line is right above the box: the unit would be said twice in a row.
   * (The table's rent fields still say "₹/month", and a screen reader hears the full unit on each field.)
   */
  showUnit?: boolean;
  testID: string;
}

const makeStyles = (th: ThemeTokens) => ({
  box: { marginHorizontal: layout.marginCompact, gap: space.sm },
  unit: { ...typography.subhead, color: th.text.secondary },
  note: { ...typography.footnote, color: th.text.secondary },
});

export function RateBox({ editor, fields, caption, startSignal, oneTime, tags, locked = false, readOnly = false, showUnit = true, packaging, testID }: RateBoxProps) {
  const styles = useThemedStyles(makeStyles);
  const offline = useIsOffline();
  const [copyOpen, setCopyOpen] = useState(false);
  const { draft, ctx, errors, strip, copiedFrom } = editor;
  if (!editor.ready || !draft || !ctx) return null;

  const priceType: PriceType = draft.priceType ?? (oneTime ? 'one_time' : 'monthly');
  const adding = ctx.mode === 'add' || ctx.mode === 'addCustomer';
  const disabled = locked || readOnly;
  // The day of the new rate can be chosen once something in the box is changed, or the box is a new rate; at rest the
  // "From <date>" line is a fact.
  const editing = !disabled && (editor.dirty || adding);
  // A refused save that is about the bands is shown under them; the strip would say it twice.
  const stripText = strip && strip !== errors.bands ? strip : null;

  return (
    <View style={styles.box} testID={testID}>
      {adding && ctx.priceTypeChoosable ? (
        <SegmentedControl
          label={t('pricing.edit.type')}
          stacked
          value={priceType}
          onValueChange={value => editor.switchType(value as PriceType)}
          options={[
            { value: 'monthly', label: priceTypeLabel('monthly') },
            { value: 'one_time', label: priceTypeLabel('one_time') },
          ]}
        />
      ) : null}
      {showUnit ? <Text style={styles.unit}>{unitText(priceType, packaging)}</Text> : null}
      <RateStartLine
        day={draft.startsOn}
        choice={draft.startsOnChoice}
        today={ctx.today}
        earliest={ctx.earliestStart}
        canStartInPast={ctx.canStartInPast}
        fixed={draft.startsOnChoice === 'fixed'}
        editing={editing}
        caption={caption}
        error={errors.startsOn}
        onChange={editor.setStartsOn}
        fields={fields}
        openSignal={startSignal}
        testID={`${testID}-starts`}
      />
      {stripText ? <EditorStrip variant="critical" message={stripText} testID="editor-error" /> : null}
      {editor.rowsChanged ? <EditorStrip variant="warning" message={t('pricing.edit.rowsChanged')} testID="rows-changed" /> : null}
      {copiedFrom ? (
        <Text style={styles.note} testID="copied-from-item">{t('pricing.edit.copiedFromItem', { item: copiedFrom })}</Text>
      ) : adding && ctx.copied ? (
        <Text style={styles.note}>{t('pricing.edit.copied')}</Text>
      ) : null}
      {draft.firstBandZeroed ? <Text style={styles.note}>{t('pricing.edit.firstBandZeroed')}</Text> : null}
      {locked ? <Text style={styles.note} testID={`${testID}-locked`}>{t('pricing.box.locked')}</Text> : null}

      <RateBandFields
        draft={draft}
        ctx={ctx}
        errors={errors}
        onChange={editor.setDraft}
        order={editor.order}
        fields={fields}
        tags={editor.dirty ? null : tags}
        readOnly={disabled}
        packaging={packaging}
        testID={`${testID}-table`}
      />

      {adding && !disabled ? (
        <Button type="tertiary" leftIcon="content-copy" onPress={() => setCopyOpen(true)} disabled={offline} testID="copy-tiers">
          {t('pricing.edit.copyTiers')}
        </Button>
      ) : null}
      {copyOpen ? (
        <CopyTiersSheet
          visible
          onClose={() => setCopyOpen(false)}
          itemId={ctx.itemId}
          priceType={draft.priceType}
          today={ctx.today}
          onPick={(item, rows) => {
            setCopyOpen(false);
            // Typed figures are not replaced without asking.
            if (!editor.dirty) editor.copyFrom(item, rows);
            else void confirmReplaceBands(item.name).then(yes => { if (yes) editor.copyFrom(item, rows); });
          }}
        />
      ) : null}
    </View>
  );
}

export default RateBox;
