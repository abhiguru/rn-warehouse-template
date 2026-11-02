/**
 * AddItemSheet - "Add item" from the GRN Items step (WH-42)
 *
 * A quick sheet over the form: item name (filled with what was typed in the search) and packaging with the words
 * used before. Nothing else is asked: no description, rate or active switch. The server decides the rate by role
 * (staff: none; administrators and supervisors: the standard rate when there is one). On save the sheet closes
 * and hands the new item back; the GRN form behind it is not touched.
 *
 * @module features/grn/components/AddItemSheet
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { SheetFrame } from '@/features/filters/components/SheetFrame';
import { ChoiceChips } from '@/features/filters/components/ChoiceChips';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { markItemRatesStale } from '@/features/item-pricing/useItemRates';
import { matchingPackaging, normalizePackaging, usePackagingWords } from '@/features/items/packagingSuggestions';
import { itemService } from '@/services/item-service';
import { useIsOffline } from '@/hooks/useNetworkStatus';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { isNetworkError, isStatementTimeout, isTimeoutError, serverText } from '@/utils/serverText';
import { space } from '@/theme/tokens';
import { t as tr } from '@/i18n';
import type { TextInputRef } from '@/types/nativeRefs';

export interface AddedItem {
  id: string;
  name: string;
  packaging: string;
}

interface AddItemSheetProps {
  visible: boolean;
  /** The text typed in the item search: it fills the name each time the sheet opens. */
  initialName: string;
  onClose: () => void;
  /** The item was created: the step selects it. */
  onAdded: (item: AddedItem) => void;
}

export const AddItemSheet: React.FC<AddItemSheetProps> = ({ visible, initialName, onClose, onAdded }) => {
  const [name, setName] = useState('');
  const [packaging, setPackaging] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [packagingError, setPackagingError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const offline = useIsOffline();
  const { groups, suggestions } = usePackagingWords();
  const nameRef = useRef<TextInputRef>(null);
  const packagingRef = useRef<TextInputRef>(null);

  // Each opening starts from the typed text with empty packaging and no messages.
  useEffect(() => {
    if (visible) {
      setName(initialName);
      setPackaging('');
      setNameError(undefined);
      setPackagingError(undefined);
      setSaving(false);
    }
  }, [visible, initialName]);

  const close = useCallback(() => {
    // Closing while the save runs would hide its answer; the sheet waits for it.
    if (!saving) onClose();
  }, [saving, onClose]);

  const validate = useCallback((): boolean => {
    const trimmedName = name.trim();
    const trimmedPackaging = packaging.trim();
    let nextName: string | undefined;
    let nextPackaging: string | undefined;
    if (!trimmedName) nextName = tr('items.form.nameRequired');
    else if (name.length > 80) nextName = tr('items.form.maxLength', { max: 80 });
    if (!trimmedPackaging) nextPackaging = tr('items.form.packagingRequired');
    else if (packaging.length > 40) nextPackaging = tr('items.form.maxLength', { max: 40 });
    setNameError(nextName);
    setPackagingError(nextPackaging);
    if (nextName) nameRef.current?.focus();
    else if (nextPackaging) packagingRef.current?.focus();
    return !nextName && !nextPackaging;
  }, [name, packaging]);

  const save = useCallback(async () => {
    // Taken first: a second tap while the first is sending does nothing.
    if (saving) return;
    if (!validate()) return;
    if (offline) {
      showAlert(tr('items.form.couldNotAddTitle'), tr('items.offline.connectToSave'));
      return;
    }
    const itemName = name.trim();
    const word = normalizePackaging(packaging, groups);
    setSaving(true);
    try {
      const result = await itemService.createItem({ p_name: itemName, p_packaging: word, p_active: true });
      if (result.success && result.data?.id) {
        markItemRatesStale();
        const source = result.data.rate_source;
        showToast(
          source === 'standard'
            ? tr('items.form.addedStandardToast', { name: itemName })
            : source === 'none'
              ? tr('items.form.addedNoRateToast', { name: itemName })
              : tr('items.form.addedToast', { name: itemName }),
        );
        onAdded({ id: result.data.id, name: itemName, packaging: word });
      } else if (result.code === 'DUPLICATE_NAME') {
        // An item with this name and word exists (also a deactivated one): the sheet stays open with the input kept.
        setNameError(tr('items.form.duplicateName'));
        nameRef.current?.focus();
      } else if (result.lostAnswer || (isTimeoutError(result) && !isStatementTimeout(result)) || isNetworkError(result)) {
        // No answer in time or a dropped connection: the item may have been saved. Nothing is sent again by itself.
        showAlert(tr('items.form.notConfirmedTitle'), tr('items.form.notConfirmedMessage', { name: itemName }));
        onClose();
      } else {
        showAlert(tr('items.form.couldNotAddTitle'), serverText(result, tr('items.list.tryAgainInAMoment'), { write: true, form: true }));
      }
    } catch (err) {
      console.error('[AddItemSheet] Save error:', err);
      if ((isTimeoutError(err) && !isStatementTimeout(err)) || isNetworkError(err)) {
        showAlert(tr('items.form.notConfirmedTitle'), tr('items.form.notConfirmedMessage', { name: itemName }));
        onClose();
      } else {
        showAlert(tr('items.form.couldNotAddTitle'), serverText(err, tr('common.checkConnection'), { write: true, form: true }));
      }
    } finally {
      setSaving(false);
    }
  }, [saving, validate, offline, name, packaging, groups, onAdded, onClose]);

  return (
    <SheetFrame
      visible={visible}
      title={tr('items.form.addTitle')}
      onClose={close}
      footer={
        <Button size="fullWidth" onPress={save} loading={saving} disabled={saving}>
          {tr('items.form.saveItem')}
        </Button>
      }
    >
      <View style={{ gap: space.md }}>
        <Input
          ref={nameRef}
          label={tr('items.form.itemName')}
          required
          value={name}
          onChangeText={(text) => {
            setName(text);
            if (nameError) setNameError(undefined);
          }}
          placeholder={tr('items.form.itemNamePlaceholder')}
          maxLength={80}
          showCharacterCount
          error={nameError}
          autoCapitalize="words"
          returnKeyType="next"
          onSubmitEditing={() => packagingRef.current?.focus()}
        />
        <Input
          ref={packagingRef}
          label={tr('common.packaging')}
          required
          value={packaging}
          onChangeText={(text) => {
            setPackaging(text);
            if (packagingError) setPackagingError(undefined);
          }}
          placeholder={tr('items.form.packagingPlaceholder')}
          maxLength={40}
          showCharacterCount
          error={packagingError}
          returnKeyType="done"
          onSubmitEditing={save}
        />
        {suggestions.length > 0 && (
          <ChoiceChips
            options={suggestions.map((word) => ({ value: word, label: word }))}
            value={matchingPackaging(packaging, groups)}
            onChange={(word) => {
              setPackaging(word);
              setPackagingError(undefined);
            }}
            accessibilityLabel={tr('items.form.packagingSuggestions')}
          />
        )}
      </View>
    </SheetFrame>
  );
};

export default AddItemSheet;
