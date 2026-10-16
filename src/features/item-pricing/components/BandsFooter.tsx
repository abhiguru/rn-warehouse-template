/**
 * What closes a list of weight bands: the note on removing a band, the error that belongs to the bands
 * as a whole (a gap or an overlap the server found), Add band with the reason it is off, and the note on
 * the weights outside a customer's bands. Shared by the card-per-band editor and the editable table.
 */
import React from 'react';
import { Text } from 'react-native';
import { Button } from '@/components/ui/Button';
import { useThemedStyles } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { typography, type ThemeTokens } from '@/theme/tokens';
import { appendBandBlock, appendEmptyBand, type Draft, type EditorContext } from '../editModel';

interface Props {
  draft: Draft;
  /** Only its `customerId` is read (the note on weights outside the customer's bands). */
  ctx: Pick<EditorContext, 'customerId'>;
  /** The errors of the form; only `bands` is shown here. */
  errors: Record<string, string>;
  onChange: (next: Draft) => void;
}

const makeStyles = (t: ThemeTokens) => ({
  note: { ...typography.footnote, color: t.text.secondary },
  error: { ...typography.footnote, color: t.status.negative.text },
});

export function BandsFooter({ draft, ctx, errors, onChange }: Props) {
  const styles = useThemedStyles(makeStyles);
  const addBlock = appendBandBlock(draft);
  return (
    <>
      {draft.bands.length >= 2 ? <Text style={styles.note} testID="remove-band-note">{t('pricing.edit.removeBandNote')}</Text> : null}
      {errors.bands ? <Text style={styles.error} accessibilityRole="alert">{errors.bands}</Text> : null}
      {addBlock === 'max' ? (
        <Text style={styles.note}>{t('pricing.edit.bandsFull')}</Text>
      ) : (
        <>
          <Button type="tertiary" leftIcon="plus" disabled={addBlock !== null} onPress={() => onChange(appendEmptyBand(draft))} testID="add-band">
            {t('pricing.edit.addBand')}
          </Button>
          {addBlock === 'upTo' ? <Text style={styles.note}>{t('pricing.edit.addBandNeedsUpTo')}</Text> : null}
        </>
      )}
      {ctx.customerId ? <Text style={styles.note}>{t('pricing.edit.outsidePay')}</Text> : null}
    </>
  );
}

export default BandsFooter;
