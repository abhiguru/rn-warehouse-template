/**
 * The rate box: one rate of one scope (a default rate or one customer's own) of one price type, edited in place.
 * The band table is the content; above it the unit of the rate and the strip of a refused save, below it the way to
 * copy the bands of another item (a new rate). The start day, the change summary and Save live in the page's
 * RateSaveBar (ScopeSaveBar), not here. A `locked` box shows its figures and the note that the other box must be
 * saved or discarded first (one box is edited at a time); a `readOnly` box only shows them.
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
import { BandsTable } from './BandsTable';
import { CopyTiersSheet } from './CopyTiersSheet';
import { EditorStrip } from './EditorStrip';
import type { FieldRegistry } from './fieldLink';

export interface RateBoxProps {
  editor: UseRateEditor;
  fields?: FieldRegistry;
  /** Whether the rate is a one-time rate until the editor's draft says so (the draft decides once it is open). */
  oneTime?: boolean;
  /** One tag per band ('Standard' or 'This item'), shown while nothing in the box is changed. */
  tags?: TierTag[] | null;
  /** The other box is being edited: show the figures, say why they cannot be typed in. */
  locked?: boolean;
  readOnly?: boolean;
  testID: string;
}

const makeStyles = (th: ThemeTokens) => ({
  box: { marginHorizontal: layout.marginCompact, gap: space.sm },
  unit: { ...typography.subhead, color: th.text.secondary },
  note: { ...typography.footnote, color: th.text.secondary },
});

export function RateBox({ editor, fields, oneTime, tags, locked = false, readOnly = false, testID }: RateBoxProps) {
  const styles = useThemedStyles(makeStyles);
  const offline = useIsOffline();
  const [copyOpen, setCopyOpen] = useState(false);
  const { draft, ctx, errors, strip, copiedFrom } = editor;
  if (!editor.ready || !draft || !ctx) return null;

  const priceType: PriceType = draft.priceType ?? (oneTime ? 'one_time' : 'monthly');
  const adding = ctx.mode === 'add' || ctx.mode === 'addCustomer';
  const disabled = locked || readOnly;
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
      <Text style={styles.unit}>{unitText(priceType)}</Text>
      {stripText ? <EditorStrip variant="critical" message={stripText} testID="editor-error" /> : null}
      {copiedFrom ? (
        <Text style={styles.note} testID="copied-from-item">{t('pricing.edit.copiedFromItem', { item: copiedFrom })}</Text>
      ) : adding && ctx.copied ? (
        <Text style={styles.note}>{t('pricing.edit.copied')}</Text>
      ) : null}
      {draft.firstBandZeroed ? <Text style={styles.note}>{t('pricing.edit.firstBandZeroed')}</Text> : null}
      {locked ? <Text style={styles.note} testID={`${testID}-locked`}>{t('pricing.box.locked')}</Text> : null}

      <BandsTable
        draft={draft}
        ctx={ctx}
        errors={errors}
        onChange={editor.setDraft}
        fields={fields}
        tags={editor.dirty ? null : tags}
        readOnly={disabled}
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
            editor.copyFrom(item, rows);
          }}
        />
      ) : null}
    </View>
  );
}

export default RateBox;
