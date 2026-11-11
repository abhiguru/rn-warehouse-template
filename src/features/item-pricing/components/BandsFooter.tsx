/**
 * What closes a list of weight bands: the note on removing a band, the error that belongs to the bands
 * as a whole (a gap or an overlap the server found), Add band with the reason it is off, and the note on
 * the weights outside a customer's bands. Shared by the card-per-band editor and the editable table.
 */
import React, { type ReactNode } from 'react';
import { Text } from 'react-native';
import { Button } from '@/components/ui/Button';
import { useThemedStyles } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { typography, type ThemeTokens } from '@/theme/tokens';
import { packNounCapital } from '@/utils/packagingWord';
import { localizeDigits } from '@/i18n';
import { appendBandBlock, appendEmptyBand, COVER_TOP_KG, topUpTo, type Draft, type EditorContext } from '../editModel';

interface Props {
  draft: Draft;
  /** Only its `customerId` is read (the note on weights outside the customer's bands). */
  ctx: Pick<EditorContext, 'customerId'>;
  /** The errors of the form; only `bands` is shown here. */
  errors: Record<string, string>;
  onChange: (next: Draft) => void;
  /** The item's packaging, for the word in the note; unknown (the standard rate) keeps "bags". */
  packaging?: string | null;
  /** Standard rate: Add band asks where the new band starts (this runs instead of adding at the end). */
  onAddPress?: () => void;
  /** Standard rate: the panel that asks for the start, drawn in place of the Add band button while it is open. */
  addPanel?: ReactNode;
  /** The item's own rate form draws Add band and its reasons itself, above the bands: leave them out here. */
  hideAdd?: boolean;
  /** The item's own rate form: say that weights above the last band have no rate (WH-66). */
  heavierNote?: boolean;
}

const makeStyles = (t: ThemeTokens) => ({
  note: { ...typography.footnote, color: t.text.secondary },
  error: { ...typography.footnote, color: t.status.negative.text },
});

export function BandsFooter({ draft, ctx, errors, onChange, packaging, onAddPress, addPanel, hideAdd, heavierNote }: Props) {
  const styles = useThemedStyles(makeStyles);
  const topKg = heavierNote && !ctx.customerId ? topUpTo(draft) : null;
  const addBlock = appendBandBlock(draft);
  return (
    <>
      {draft.bands.length >= 2 ? <Text style={styles.note} testID="remove-band-note">{t('pricing.edit.removeBandNote')}</Text> : null}
      {errors.bands ? <Text style={styles.error} accessibilityRole="alert">{errors.bands}</Text> : null}
      {hideAdd ? null : addBlock === 'max' ? (
        <Text style={styles.note}>{t('pricing.edit.bandsFull')}</Text>
      ) : addPanel ? (
        addPanel
      ) : (
        <>
          <Button type="tertiary" leftIcon="plus" disabled={addBlock !== null} onPress={() => (onAddPress ? onAddPress() : onChange(appendEmptyBand(draft)))} testID="add-band">
            {t('pricing.edit.addBand')}
          </Button>
          {addBlock === 'upTo' ? <Text style={styles.note}>{t('pricing.edit.addBandNeedsUpTo')}</Text> : null}
        </>
      )}
      {topKg !== null && topKg < COVER_TOP_KG ? (
        <Text style={styles.note} testID="heavier-no-rate">{t('pricing.edit.heavierNoRate', { things: packNounCapital(packaging), kg: localizeDigits(String(topKg)) })}</Text>
      ) : null}
      {ctx.customerId ? <Text style={styles.note}>{packaging === undefined ? t('pricing.edit.outsidePay') : t('pricing.edit.outsidePayFor', { things: packNounCapital(packaging) })}</Text> : null}
    </>
  );
}

export default BandsFooter;
