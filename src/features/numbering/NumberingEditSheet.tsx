/**
 * The sheet that edits one document type's numbering rule (Settings > Document numbers; docs/STYLE_GUIDE.md §13.9).
 *
 * Step 1 (edit): the schemes the backend allows for the type, the fields of the chosen scheme, an example of the first number,
 * and the switch for refusing numbers outside the rule. Step 2 (confirm), in the same sheet so that no second modal opens over
 * it: what changes, and that existing documents keep their numbers. Save calls `set_document_numbering`; a refusal is
 * worded under the buttons and nothing is closed.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { InlineValidation } from '@/components/fiori';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { RadioGroup } from '@/components/ui/RadioButton';
import { Switch } from '@/components/ui/Switch';
import { SheetFrame } from '@/features/filters/components/SheetFrame';
import { useThemedStyles } from '@/hooks/useTheme';
import { formatIdentifier, t as tr, type TranslationKey } from '@/i18n';
import { setDocumentNumbering, type DocumentType, type NumberingRule, type NumberingScheme, type SetNumberingResult } from '@/services/documentNumberingService';
import { radius, space, typography, type ThemeTokens } from '@/theme/tokens';
import { showAlert } from '@/utils/alert';
import { transportText } from '@/utils/serverText';
import {
  SCHEMES_BY_TYPE,
  draftChanged,
  draftErrors,
  draftFor,
  exampleNumber,
  fieldsOf,
  hasCheck,
  ruleInputOf,
  type NumberingDraft,
} from './numberingModel';

const TITLE: Record<DocumentType, TranslationKey> = {
  grn: 'numbering.edit.titleGrn',
  dispatch: 'numbering.edit.titleDispatch',
  invoice: 'numbering.edit.titleInvoice',
};

const SCHEME_LABEL = (type: DocumentType, scheme: NumberingScheme): TranslationKey => {
  if (type === 'invoice') return scheme === 'sequence' ? 'numbering.edit.schemeInvoiceSequence' : 'numbering.edit.schemeInvoiceYear';
  switch (scheme) {
    case 'letters':
      return 'numbering.edit.schemeLetters';
    case 'year':
      return 'numbering.edit.schemeYear';
    case 'sequence':
      return 'numbering.edit.schemeSequence';
    case 'free':
      return 'numbering.edit.schemeFree';
  }
};

export interface NumberingEditSheetProps {
  /** The rule being edited; null keeps the sheet closed. */
  rule: NumberingRule | null;
  onClose: () => void;
  /** The rule was saved (or was already as chosen); the screen reads the rules again. */
  onSaved: (result: SetNumberingResult) => void;
}

const makeStyles = (t: ThemeTokens) => ({
  scroll: { flex: 1 },
  body: { paddingBottom: space.lg, gap: space.md },
  preview: {
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: t.border.divider,
    backgroundColor: t.surface.card,
    gap: space.xs,
  },
  previewLabel: { ...typography.footnote, color: t.text.secondary },
  previewValue: { ...typography.headline, color: t.text.primary },
  previewNote: { ...typography.footnote, color: t.text.secondary },
  confirmText: { ...typography.body, color: t.text.primary },
  footer: { gap: space.sm, paddingBottom: space.xs },
});

export function NumberingEditSheet({ rule, onClose, onSaved }: NumberingEditSheetProps) {
  const styles = useThemedStyles(makeStyles);
  // The sheet is remounted for each rule (key), so the draft starts from the rule it was opened on.
  return rule ? <Editor key={`${rule.document_type}-${rule.updated_at ?? ''}`} rule={rule} onClose={onClose} onSaved={onSaved} styles={styles} /> : null;
}

type Styles = ReturnType<typeof makeStyles>;

function Editor({ rule, onClose, onSaved, styles }: { rule: NumberingRule; onClose: () => void; onSaved: NumberingEditSheetProps['onSaved']; styles: Styles }) {
  const type = rule.document_type;
  const [draft, setDraft] = useState<NumberingDraft>(() => draftFor(rule));
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Errors are shown from the first press of Save, not while a field is half typed (§13.2).
  const [showErrors, setShowErrors] = useState(false);

  const errors = useMemo(() => draftErrors(type, draft), [type, draft]);
  const invalid = Object.keys(errors).length > 0;
  const changed = draftChanged(rule, draft);
  const example = useMemo(() => exampleNumber(type, draft), [type, draft]);
  const fields = fieldsOf(type, draft.scheme);

  const update = useCallback((patch: Partial<NumberingDraft>) => {
    setFailure(null);
    setDraft(current => ({ ...current, ...patch }));
  }, []);

  const chooseScheme = (scheme: string) => update({ ...draftFor(rule, scheme as NumberingScheme) });

  const fieldError = (name: keyof typeof errors) => (showErrors && errors[name] ? tr(errors[name]!) : undefined);

  const toConfirm = () => {
    setShowErrors(true);
    if (invalid || !changed) return;
    setStep('confirm');
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setFailure(null);
    try {
      const result = await setDocumentNumbering(type, ruleInputOf(type, draft));
      onSaved(result);
    } catch (error) {
      // A refusal is the server's sentence (English) or the app's own; no connection says so.
      setFailure(transportText(error, { write: true, form: true }) ?? (error instanceof Error && error.message ? error.message : tr('numbering.edit.saveFailed')));
      setSaving(false);
    }
  };

  // Closing the edit step with a change not yet saved asks once (style guide §13.9 and §14.4). The sheet is a modal, not a
  // route, so useLeaveGuard does not apply: the Cancel button, the scrim and Android Back all come here.
  const requestClose = () => {
    if (!changed) {
      onClose();
      return;
    }
    showAlert(
      tr('common.discardChangesTitle'),
      tr('common.discardChangesMessage'),
      [
        { text: tr('common.keepEditing'), style: 'cancel' },
        { text: tr('common.discard'), style: 'destructive', onPress: onClose },
      ],
      { cancelable: true },
    );
  };

  const title = tr(TITLE[type]);
  const schemeOptions = SCHEMES_BY_TYPE[type].map(scheme => ({ value: scheme, label: tr(SCHEME_LABEL(type, scheme)) }));
  const turnsCheckOn = hasCheck(type, draft.scheme) && draft.check && !rule.check && draft.scheme === rule.scheme;

  if (step === 'confirm') {
    return (
      <SheetFrame
        visible
        title={title}
        onClose={saving ? () => undefined : () => setStep('edit')}
        closeLabel={tr('common.back')}
        footer={
          <View style={styles.footer}>
            <Button type="primary" onPress={save} loading={saving} disabled={saving} testID="numbering-confirm">
              {tr('numbering.edit.confirmAction')}
            </Button>
          </View>
        }
      >
        <View style={styles.body}>
          <Text style={styles.confirmText} accessibilityRole="header">{tr('numbering.edit.confirmTitle')}</Text>
          <Text style={styles.confirmText}>
            {example ? tr('numbering.edit.confirmExample', { example: formatIdentifier(example) }) : tr('numbering.edit.confirmFree')}
          </Text>
          {example && rule.existing_documents > 0 ? <Text style={styles.confirmText}>{tr('numbering.edit.previewNote')}</Text> : null}
          <Text style={styles.confirmText}>{tr('numbering.edit.confirmExisting', { count: rule.existing_documents })}</Text>
          {turnsCheckOn && rule.not_following > 0 ? (
            <Text style={styles.confirmText}>{tr('numbering.edit.confirmNotFollowing', { count: rule.not_following })}</Text>
          ) : null}
          {failure ? <InlineValidation variant="error" message={failure} /> : null}
        </View>
      </SheetFrame>
    );
  }

  return (
    <SheetFrame
      visible
      tall
      title={title}
      onClose={requestClose}
      footer={
        <View style={styles.footer}>
          <Button type="primary" onPress={toConfirm} disabled={!changed} testID="numbering-save">
            {tr('numbering.edit.save')}
          </Button>
        </View>
      }
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <RadioGroup
          label={tr('numbering.edit.schemeLabel')}
          options={schemeOptions}
          selectedValue={draft.scheme}
          onValueChange={chooseScheme}
        />

        {fields.includes('firstLetter') ? (
          <Input
            label={tr('numbering.edit.firstLetter')}
            value={draft.firstLetter}
            onChangeText={text => update({ firstLetter: text.toUpperCase().slice(0, 1) })}
            helperText={tr('numbering.edit.firstLetterHelp')}
            error={fieldError('firstLetter')}
            identifier
            autoCapitalize="characters"
            maxLength={1}
            testID="numbering-field-firstLetter"
          />
        ) : null}
        {fields.includes('prefix') ? (
          <Input
            label={tr('numbering.edit.prefix')}
            value={draft.prefix}
            onChangeText={text => update({ prefix: text.toUpperCase() })}
            helperText={tr('numbering.edit.prefixHelp')}
            error={fieldError('prefix')}
            identifier
            autoCapitalize="characters"
            autoCorrect={false}
            testID="numbering-field-prefix"
          />
        ) : null}
        {fields.includes('width') ? (
          <Input
            label={tr('numbering.edit.width')}
            value={draft.width}
            onChangeText={text => update({ width: text })}
            helperText={tr('numbering.edit.widthHelp')}
            error={fieldError('width')}
            numeric
            keyboardType="number-pad"
            maxLength={2}
            testID="numbering-field-width"
          />
        ) : null}
        {fields.includes('perLetter') ? (
          <Input
            label={tr('numbering.edit.perLetter')}
            value={draft.perLetter}
            onChangeText={text => update({ perLetter: text })}
            helperText={tr('numbering.edit.perLetterHelp')}
            error={fieldError('perLetter')}
            numeric
            keyboardType="number-pad"
            maxLength={7}
            testID="numbering-field-perLetter"
          />
        ) : null}
        {fields.includes('start') ? (
          <Input
            label={tr('numbering.edit.start')}
            value={draft.start}
            onChangeText={text => update({ start: text })}
            helperText={tr(draft.scheme === 'year' ? 'numbering.edit.startHelpYear' : 'numbering.edit.startHelp')}
            error={fieldError('start')}
            numeric
            keyboardType="number-pad"
            maxLength={7}
            testID="numbering-field-start"
          />
        ) : null}

        {hasCheck(type, draft.scheme) ? (
          <Switch
            label={tr('numbering.edit.check')}
            helperText={tr(draft.check ? 'numbering.edit.checkHelpOn' : 'numbering.edit.checkHelpOff')}
            value={draft.check}
            onValueChange={check => update({ check })}
          />
        ) : null}

        <View style={styles.preview} testID="numbering-preview" accessible accessibilityLabel={previewText(example, invalid)}>
          <Text style={styles.previewLabel}>{tr('numbering.edit.previewLabel')}</Text>
          <Text style={styles.previewValue}>{previewText(example, invalid)}</Text>
          {example ? <Text style={styles.previewNote}>{tr('numbering.edit.previewNote')}</Text> : null}
        </View>
      </ScrollView>
    </SheetFrame>
  );
}

function previewText(example: string | null, invalid: boolean): string {
  if (invalid) return tr('numbering.edit.previewInvalid');
  if (example === null) return tr('numbering.edit.previewFree');
  return tr('numbering.edit.previewExample', { example: formatIdentifier(example) });
}
