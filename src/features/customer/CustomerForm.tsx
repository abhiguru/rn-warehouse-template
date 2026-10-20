/**
 * The customer form: one page for Add customer (app/customer-form.tsx) and Edit
 * customer (app/customer-edit/[id].tsx). Style guide §14.4.
 *
 * Column: header (Back, centred title) / one scrolling form in four sections
 * (Basic information, Address, Tax details, Contact person) / save bar. The bar
 * is an ordinary child below the scroll area, so the keyboard never hides a
 * field behind it. The values live in useCustomerEditor, loaded by the
 * customer's id, never in Redux (G-02).
 *
 * Leaving: useLeaveGuard asks once, and only when something changed, for the
 * header Back, the phone's Back key and the swipe; while a save runs, Back waits and
 * nothing is asked. Edit sends only the fields that were changed (never an unchanged
 * mobile number) with the `updated_at` it read, so a customer changed meanwhile is
 * refused (STALE_CUSTOMER) instead of overwritten. A save goes back to the
 * customer page (edit) or replaces the form with the new customer's page
 * (add), so the Customers list is never on the stack twice (G-16).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Button } from '@/components/ui/Button';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SkeletonBox } from '@/components/skeletons/SkeletonBox';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';
import { customerService } from '@/services/customer-service';
import type { CreateCustomerParams, CustomerServiceResponse, CustomerValidationErrors, UpdateCustomerParams } from '@/types/customer.types';
import { iconSize, layout, radius, space, touchTarget, typography, type ThemeTokens } from '@/theme/tokens';
import { normalizeDigits, t as tr } from '@/i18n';
import { formatMobile as formatMobileDisplay, nationalMobileDigits } from '@/utils/formatters';
import { groupMobileDigits } from '@/utils/mobileGrouping';
import { showAlert } from '@/utils/alert';
import { showToast } from '@/utils/toast';
import { isStatementTimeout, isTimeoutError, serverText, transportText } from '@/utils/serverText';
import {
  formatGST,
  formatMobile,
  formatPAN,
  validateBasicInfo,
  validateDetails,
  type CustomerFormFields,
} from '@/features/customer/schemas/customerValidation';
import { useCustomerEditor } from '@/features/customer/useCustomerEditor';

/** Top to bottom: the order errors are scrolled to. */
const FIELD_ORDER: (keyof CustomerFormFields)[] = [
  'name',
  'mobile',
  'email',
  'city',
  'state',
  'pincode',
  'address',
  'gst',
  'pan',
  'contact_name',
  'contact_mobile',
  'contact_email',
];

/** Lower case with spaces collapsed, to tell "Acme  Foods" from "acme foods" no more. */
const fold = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

export function CustomerForm({ customerId }: { customerId?: string }) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const editor = useCustomerEditor(customerId);
  const { fields, setField, isCreate } = editor;
  const [errors, setErrors] = useState<CustomerValidationErrors>({});
  const [saving, setSaving] = useState(false);
  // From the Save tap to the end of the save, validation and the duplicate search included: Back waits for it.
  const [working, setWorking] = useState(false);
  const [keyboardShown, setKeyboardShown] = useState(false);
  const busy = useRef(false);
  const inputs = useRef<Partial<Record<keyof CustomerFormFields, TextInput | null>>>({});

  const { leaveWithoutAsking } = useLeaveGuard({
    hasChanges: editor.hasChanges,
    ...(isCreate ? { title: tr('customers.form.discardNewTitle') } : {}),
    message: tr('customers.form.discardMessage'),
    blocked: working || saving,
  });

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardShown(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // A different customer is a different form: nothing of the last one's errors stays.
  useEffect(() => {
    setErrors({});
  }, [customerId]);

  const change = useCallback(
    (field: keyof CustomerFormFields, value: string) => {
      setField(field, value);
      setErrors(previous => (previous[field] ? { ...previous, [field]: undefined } : previous));
    },
    [setField]
  );

  /** Put a refusal under its field and move the cursor there. */
  const refuseField = useCallback((field: 'name' | 'mobile', message: string) => {
    setErrors(previous => ({ ...previous, [field]: message }));
    inputs.current[field]?.focus();
    AccessibilityInfo.announceForAccessibility(message);
  }, []);

  /** A deactivated customer already has this name: open it (to activate it again) or use a different name. */
  const showDeactivatedName = useCallback((id: string | undefined, name: string) => {
    showAlert(tr('customers.form.deactivatedTitle', { name }), tr('customers.form.deactivatedNameMessage'), [
      { text: tr('common.cancel'), style: 'cancel' },
      ...(id ? [{ text: tr('customers.form.openExisting'), onPress: () => router.replace({ pathname: '/customer/[id]', params: { id } }) }] : []),
      { text: tr('customers.form.useDifferentName'), onPress: () => inputs.current.name?.focus() },
    ]);
  }, []);

  /** The last Edit save ended in a timeout (it may have been saved): a following STALE_CUSTOMER is then probably our own save. */
  const lastSaveTimedOut = useRef(false);

  /** Say why a save was refused: under the field when the server names one, else in a dialog. */
  const showRefusal = useCallback(
    (result: CustomerServiceResponse, afterTimeout = false) => {
      if (result.code === 'DUPLICATE_MOBILE') {
        const name = result.details?.name;
        refuseField('mobile', name ? tr('customers.save.duplicateMobileNamed', { name }) : tr('customers.save.duplicateMobile'));
        return;
      }
      if (result.code === 'DUPLICATE_NAME') {
        if (result.details?.active === false && result.details.name) {
          showDeactivatedName(result.details.customer_id, result.details.name);
          return;
        }
        refuseField('name', tr('customers.save.duplicateName'));
        return;
      }
      if (result.code === 'VALIDATION_FAILED' && (result.field === 'name' || result.field === 'mobile')) {
        refuseField(result.field, serverText(result, tr('customers.save.saveFailed'), { code: result.code }));
        return;
      }
      if (result.code === 'CUSTOMER_NOT_FOUND') {
        showAlert(tr('customers.save.errorTitle'), tr('errors.customer.notFound'));
        return;
      }
      if (result.code === 'STALE_CUSTOMER') {
        // A save that timed out may have gone through: the retry then meets its own change, not someone else's.
        showAlert(tr('customers.save.staleTitle'), tr(afterTimeout ? 'customers.save.staleAfterTimeout' : 'customers.save.staleMessage'), [
          { text: tr('common.cancel'), style: 'cancel' },
          {
            text: tr('customers.save.reload'),
            onPress: () => {
              setErrors({});
              editor.retry();
            },
          },
        ]);
        return;
      }
      showAlert(
        tr('customers.save.errorTitle'),
        serverText(result, tr('customers.save.saveFailed'), { write: true, form: true, code: result.code })
      );
    },
    [editor.retry, refuseField, showDeactivatedName]
  );

  const submit = useCallback(
    async () => {
      setSaving(true);
      try {
        const trimmed = Object.fromEntries(FIELD_ORDER.map(name => [name, fields[name].trim()])) as CustomerFormFields;
        let result: CustomerServiceResponse;
        if (customerId) {
          // Edit sends only what was changed: update_customer keeps the old value of anything left
          // out, and a mobile number that was not touched is never sent again (it is checked for a
          // duplicate only when it is sent, so two customers that already share a number stay editable).
          // An emptied optional field is sent as '' - only an empty text clears it (CR-08).
          const base = editor.base;
          const changed = (name: keyof CustomerFormFields) => trimmed[name] !== base[name].trim();
          const update: UpdateCustomerParams = {
            p_customer_id: customerId,
            // Saved photos travel with the save unchanged, never emptied. Documents are not
            // sent: update_customer has no such parameter.
            p_image_urls: editor.customer?.image_urls ?? [],
            // Exactly as it was read: the server refuses the save when the customer changed since.
            ...(editor.customer?.updated_at ? { p_expected_updated_at: editor.customer.updated_at } : {}),
          };
          if (changed('name')) update.p_name = trimmed.name;
          if (changed('mobile')) update.p_mobile = formatMobile(trimmed.mobile);
          if (changed('email')) update.p_email = trimmed.email;
          if (changed('city')) update.p_city = trimmed.city;
          if (changed('state')) update.p_state = trimmed.state;
          if (changed('pincode')) update.p_pincode = trimmed.pincode;
          if (changed('address')) update.p_address = trimmed.address;
          if (changed('gst')) update.p_gst_number = trimmed.gst;
          if (changed('pan')) update.p_pan_number = trimmed.pan;
          if (changed('contact_name')) update.p_contact_person = trimmed.contact_name;
          if (changed('contact_mobile')) {
            update.p_contact_mobile = trimmed.contact_mobile ? formatMobile(trimmed.contact_mobile) : '';
          }
          if (changed('contact_email')) update.p_contact_email = trimmed.contact_email;
          result = await customerService.updateCustomer(update);
        } else {
          // Add leaves an empty optional field out.
          const optional = (value: string) => value || undefined;
          const params: CreateCustomerParams = {
            p_name: trimmed.name,
            p_mobile: formatMobile(trimmed.mobile),
            p_email: optional(trimmed.email),
            p_city: optional(trimmed.city),
            p_state: optional(trimmed.state),
            p_pincode: optional(trimmed.pincode),
            p_address: optional(trimmed.address),
            p_gst_number: optional(trimmed.gst),
            p_pan_number: optional(trimmed.pan),
            p_contact_person: optional(trimmed.contact_name),
            p_contact_mobile: trimmed.contact_mobile ? formatMobile(trimmed.contact_mobile) : undefined,
            p_contact_email: optional(trimmed.contact_email),
          };
          result = await customerService.createCustomer(params);
        }
        const afterTimeout = lastSaveTimedOut.current;
        lastSaveTimedOut.current = !!customerId && !result.success && isTimeoutError(result) && !isStatementTimeout(result, result.code);
        if (!result.success) {
          showRefusal(result, afterTimeout);
          return;
        }
        if (customerId) {
          showToast(tr('customers.save.savedToast', { name: trimmed.name }));
          leaveWithoutAsking(() => router.back());
        } else {
          showToast(tr('customers.save.addedToast', { name: trimmed.name }));
          const newId = result.data?.id;
          leaveWithoutAsking(() => {
            if (newId) router.replace({ pathname: '/customer/[id]', params: { id: newId } });
            else router.back();
          });
        }
      } catch (error) {
        lastSaveTimedOut.current = !!customerId && isTimeoutError(error) && !isStatementTimeout(error);
        // A lost connection or a timeout says so (a timed-out save may have gone through); anything else is the general text.
        showAlert(tr('customers.save.errorTitle'), transportText(error, { write: true, form: true }) ?? tr('customers.save.saveFailed'));
      } finally {
        setSaving(false);
      }
    },
    [fields, customerId, editor.base, editor.customer, leaveWithoutAsking, showRefusal]
  );

  /**
   * On Add, before saving: a customer that already has the number or the name. The server refuses both
   * (an active customer's number; any customer's name, deactivated ones included), so they are refused here
   * too, with the same words. A deactivated customer that only shares the number does not stop the Add.
   */
  const checkDuplicate = useCallback(async () => {
    const name = fold(fields.name);
    const digits = nationalMobileDigits(fields.mobile);
    try {
      // By name, and by the mobile number as it is stored (search_customers matches a prefix).
      // Deactivated customers are asked for too (administrators and supervisors get them).
      const [byName, byMobile] = await Promise.all([
        customerService.searchCustomers(fields.name.trim(), 5, { includeInactive: true }),
        digits.length === 10
          ? customerService.searchCustomers(formatMobile(fields.mobile), 5, { includeInactive: true })
          : Promise.resolve([]),
      ]);
      const found = [...byName, ...byMobile.filter(other => !byName.some(known => known.id === other.id))];
      const sameMobile = (customer: { mobile: string }) => digits.length === 10 && nationalMobileDigits(customer.mobile) === digits;

      // An active customer with this number: refused, whatever the name.
      const owner = found.find(customer => !customer.deleted && customer.active && sameMobile(customer));
      if (owner) {
        refuseField('mobile', tr('customers.save.duplicateMobileNamed', { name: owner.name }));
        return true;
      }

      const sameName = found.find(customer => fold(customer.name) === name);
      const deactivatedOwner = found.find(customer => !customer.deleted && !customer.active && sameMobile(customer));
      const match = sameName ?? deactivatedOwner;
      if (!match) return false;
      const open = {
        text: tr('customers.form.openExisting'),
        onPress: () => router.replace({ pathname: '/customer/[id]', params: { id: match.id } }),
      };
      if (!match.active) {
        // The name constraint covers deactivated customers: a name match cannot be added again, a number match can.
        const nameTaken = match === sameName;
        if (nameTaken) {
          showDeactivatedName(match.id, match.name);
          return true;
        }
        showAlert(
          tr('customers.form.deactivatedTitle', { name: match.name }),
          tr('customers.form.deactivatedMessage'),
          [{ text: tr('common.cancel'), style: 'cancel' }, open, { text: tr('customers.form.addNew'), onPress: () => void submit() }]
        );
        return true;
      }
      showAlert(
        tr('customers.form.duplicateTitle', { name: match.name }),
        tr('customers.form.duplicateNameMessage', { mobile: formatMobileDisplay(match.mobile) }),
        [{ text: tr('common.cancel'), style: 'cancel' }, open]
      );
      return true;
    } catch {
      // A failed search never blocks the save.
      return false;
    }
  }, [fields.name, fields.mobile, submit, refuseField, showDeactivatedName]);

  const runSave = useCallback(async () => {
    if (!isCreate && !editor.hasChanges) {
      router.back();
      return;
    }
    const [basic, details] = await Promise.all([
      validateBasicInfo({ name: fields.name.trim(), mobile: fields.mobile, email: fields.email.trim() }),
      validateDetails({
        city: fields.city.trim(),
        state: fields.state.trim(),
        pincode: fields.pincode.trim(),
        address: fields.address.trim(),
        gst: fields.gst.trim(),
        pan: fields.pan.trim(),
        contact_name: fields.contact_name.trim(),
        contact_mobile: fields.contact_mobile,
        contact_email: fields.contact_email.trim(),
      }),
    ]);
    const found: CustomerValidationErrors = { ...basic.errors, ...details.errors };
    const wrong = FIELD_ORDER.filter(name => found[name]);
    if (wrong.length > 0) {
      setErrors(found);
      inputs.current[wrong[0]]?.focus();
      AccessibilityInfo.announceForAccessibility(tr('customers.form.fixFields', { count: wrong.length }));
      return;
    }
    setErrors({});
    if (isCreate && (await checkDuplicate())) return;
    await submit();
  }, [isCreate, editor.hasChanges, fields, checkDuplicate, submit]);

  const onSave = useCallback(async () => {
    // Taken at the very start: validation and the duplicate search run before `saving` turns on.
    if (saving || busy.current) return;
    busy.current = true;
    setWorking(true);
    try {
      await runSave();
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }, [saving, runSave]);

  const title = tr(isCreate ? 'customers.form.addTitle' : 'customers.form.editTitle');
  // Always our own sentence ("Couldn't open this customer..."), never the database's.
  // A lost connection or a timeout can be tried again; anything else (the customer is gone) cannot.
  const loadIsTransient = !editor.failure || isTimeoutError(editor.failure) || transportText(editor.failure) !== undefined;
  const loadFailedText = loadIsTransient ? tr('customers.page.loadFailed') : tr('errors.customer.notFound');

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <EdgeToEdgeStatusBar barStyle={t.statusBarStyle} />
      <View style={styles.navigationBar}>
        <HeaderBackButton style={styles.navSide} />
        <Text style={styles.navTitle} accessibilityRole="header">
          {title}
        </Text>
        <View style={styles.navSide} />
      </View>

      {editor.status === 'loading' && (
        <View
          style={styles.state}
          accessibilityRole="progressbar"
          accessibilityLabel={tr('customers.form.loadingLabel')}
        >
          <SkeletonBox width="100%" height={touchTarget} />
          <SkeletonBox width="100%" height={touchTarget} />
          <SkeletonBox width="100%" height={touchTarget} />
          <Text style={styles.stateText}>{tr('customers.form.loading')}</Text>
        </View>
      )}

      {editor.status === 'error' && (
        <View style={styles.state} accessibilityRole="alert">
          <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
          <Text style={styles.stateText}>{loadFailedText}</Text>
          {loadIsTransient ? (
            <Button type="secondary" leftIcon="refresh" onPress={editor.retry}>
              {tr('common.retry')}
            </Button>
          ) : (
            <Button type="secondary" leftIcon="arrow-left" onPress={() => (router.canGoBack() ? router.back() : router.replace('/customers'))}>
              {tr('common.back')}
            </Button>
          )}
        </View>
      )}

      {editor.status === 'ready' && (
        <>
          <KeyboardAwareScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            enableOnAndroid
            enableAutomaticScroll
            showsVerticalScrollIndicator={false}
          >
            <SectionHeader title={tr('customers.form.basicInformation')} />
            <View style={styles.group}>
              <Field
                label={tr('customers.form.customerName')}
                required
                accessibilityLabel={tr('customers.form.customerNameLabel')}
                error={errors.name}
                inputRef={node => (inputs.current.name = node)}
                value={fields.name}
                onChangeText={text => change('name', text)}
                placeholder={tr('customers.form.customerNamePlaceholder')}
                maxLength={80}
                returnKeyType="next"
                onSubmitEditing={() => inputs.current.mobile?.focus()}
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
              />
              <Field
                label={tr('common.mobileNumber')}
                required
                prefix="+91"
                accessibilityLabel={tr('customers.form.mobileLabel')}
                error={errors.mobile}
                inputRef={node => (inputs.current.mobile = node)}
                value={groupMobileDigits(fields.mobile)}
                onChangeText={text => change('mobile', nationalMobileDigits(text).slice(0, 10))}
                placeholder={tr('customers.form.mobilePlaceholder')}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                maxLength={11}
                returnKeyType="next"
                onSubmitEditing={() => inputs.current.email?.focus()}
              />
              <Field
                label={tr('customers.form.email')}
                accessibilityLabel={tr('customers.form.emailLabel')}
                accessibilityHint={tr('customers.form.emailHint')}
                helper={tr('customers.form.emailHelper')}
                error={errors.email}
                inputRef={node => (inputs.current.email = node)}
                value={fields.email}
                onChangeText={text => change('email', text)}
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                maxLength={100}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => inputs.current.city?.focus()}
              />
            </View>

            <SectionHeader title={tr('customers.form.address')} />
            <View style={styles.group}>
              <Field
                label={tr('customers.form.city')}
                error={errors.city}
                inputRef={node => (inputs.current.city = node)}
                value={fields.city}
                onChangeText={text => change('city', text)}
                maxLength={25}
                returnKeyType="next"
                onSubmitEditing={() => inputs.current.state?.focus()}
                autoCapitalize="words"
                autoComplete="postal-address-locality"
                textContentType="addressCity"
              />
              <Field
                label={tr('customers.form.state')}
                error={errors.state}
                inputRef={node => (inputs.current.state = node)}
                value={fields.state}
                onChangeText={text => change('state', text)}
                maxLength={50}
                returnKeyType="next"
                onSubmitEditing={() => inputs.current.pincode?.focus()}
                autoCapitalize="words"
                autoComplete="postal-address-region"
                textContentType="addressState"
              />
              <Field
                label={tr('customers.form.pincode')}
                error={errors.pincode}
                inputRef={node => (inputs.current.pincode = node)}
                value={fields.pincode}
                onChangeText={text => change('pincode', normalizeDigits(text).replace(/\D/g, '').slice(0, 6))}
                placeholder={tr('customers.form.pincodePlaceholder')}
                keyboardType="number-pad"
                autoComplete="postal-code"
                textContentType="postalCode"
                maxLength={6}
                returnKeyType="next"
                onSubmitEditing={() => inputs.current.address?.focus()}
              />
              <Field
                label={tr('customers.form.fullAddress')}
                error={errors.address}
                inputRef={node => (inputs.current.address = node)}
                value={fields.address}
                onChangeText={text => change('address', text)}
                placeholder={tr('customers.form.fullAddressPlaceholder')}
                autoComplete="street-address"
                textContentType="fullStreetAddress"
                maxLength={300}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                multilineField
              />
            </View>

            <SectionHeader title={tr('customers.form.taxDetails')} />
            <View style={styles.group}>
              <Field
                label={tr('customers.form.gstNumber')}
                helper={tr('customers.form.formatHelper', { example: '22AAAAA0000A1Z5' })}
                error={errors.gst}
                inputRef={node => (inputs.current.gst = node)}
                value={fields.gst}
                onChangeText={text => change('gst', formatGST(text))}
                placeholder={tr('customers.form.gstPlaceholder')}
                maxLength={15}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => inputs.current.pan?.focus()}
              />
              <Field
                label={tr('customers.form.pan')}
                helper={tr('customers.form.formatHelper', { example: 'AAAAA0000A' })}
                error={errors.pan}
                inputRef={node => (inputs.current.pan = node)}
                value={fields.pan}
                onChangeText={text => change('pan', formatPAN(text))}
                placeholder={tr('customers.form.panPlaceholder')}
                maxLength={10}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => inputs.current.contact_name?.focus()}
              />
            </View>

            <SectionHeader title={tr('customers.form.contactPerson')} />
            <View style={styles.group}>
              <Field
                label={tr('customers.form.contactName')}
                error={errors.contact_name}
                inputRef={node => (inputs.current.contact_name = node)}
                value={fields.contact_name}
                onChangeText={text => change('contact_name', text)}
                placeholder={tr('customers.form.contactNamePlaceholder')}
                maxLength={100}
                returnKeyType="next"
                onSubmitEditing={() => inputs.current.contact_mobile?.focus()}
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
              />
              <Field
                label={tr('customers.form.contactMobile')}
                prefix="+91"
                accessibilityLabel={tr('customers.form.labelAfterPrefix', { label: tr('customers.form.contactMobile'), prefix: '+91' })}
                error={errors.contact_mobile}
                inputRef={node => (inputs.current.contact_mobile = node)}
                value={groupMobileDigits(fields.contact_mobile)}
                onChangeText={text => change('contact_mobile', nationalMobileDigits(text).slice(0, 10))}
                placeholder={tr('customers.form.mobilePlaceholder')}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                maxLength={11}
                returnKeyType="next"
                onSubmitEditing={() => inputs.current.contact_email?.focus()}
              />
              <Field
                label={tr('customers.form.contactEmail')}
                error={errors.contact_email}
                inputRef={node => (inputs.current.contact_email = node)}
                value={fields.contact_email}
                onChangeText={text => change('contact_email', text)}
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                maxLength={100}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />
            </View>
          </KeyboardAwareScrollView>

          <View
            testID="customer-save-bar"
            style={[styles.saveBar, { paddingBottom: keyboardShown ? space.md : insets.bottom + space.md }]}
          >
            <Button size="fullWidth" onPress={() => void onSave()} loading={working || saving} disabled={working || saving}>
              {tr(isCreate ? 'customers.list.addCustomer' : 'customers.form.saveCustomer')}
            </Button>
          </View>
        </>
      )}
    </View>
  );
}

// =============================================================================
// FIELD
// =============================================================================

type FieldProps = TextInputProps & {
  label: string;
  required?: boolean;
  helper?: string;
  error?: string;
  /** Fixed text before the field, such as the +91 country code. */
  prefix?: string;
  multilineField?: boolean;
  inputRef?: (node: TextInput | null) => void;
};

/** A labelled text field with focus, error and helper states (style guide §13.2). */
function Field({ label, required, helper, error, prefix, multilineField, inputRef, onFocus, onBlur, ...inputProps }: FieldProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[styles.label, !!error && styles.labelError]}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <View style={styles.inputRow}>
        {prefix ? (
          <View style={styles.prefix} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text style={styles.prefixText}>{prefix}</Text>
          </View>
        ) : null}
        <TextInput
          ref={inputRef}
          {...inputProps}
          style={[
            styles.input,
            multilineField && styles.multiline,
            focused && styles.inputFocused,
            !!error && styles.inputError,
          ]}
          placeholderTextColor={t.text.placeholder}
          accessibilityLabel={inputProps.accessibilityLabel ?? label}
          onFocus={event => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={event => {
            setFocused(false);
            onBlur?.(event);
          }}
        />
      </View>
      {error ? (
        <View style={styles.messageRow} accessibilityLiveRegion="polite">
          <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : helper ? (
        <Text style={styles.helperText}>{helper}</Text>
      ) : null}
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const makeStyles = (t: ThemeTokens) => ({
  root: { flex: 1, backgroundColor: t.background.base },
  navigationBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  navSide: { minWidth: 80 },
  navTitle: { ...typography.headline, color: t.text.primary, flexShrink: 1, textAlign: 'center' as const },
  scroll: { flex: 1 },
  content: { paddingBottom: space.xl },
  group: { paddingHorizontal: layout.marginCompact, gap: space.lg },
  state: { flex: 1, padding: layout.marginCompact, gap: space.md, justifyContent: 'center' as const, alignItems: 'stretch' as const },
  stateText: { ...typography.subhead, color: t.text.secondary, textAlign: 'center' as const },
  saveBar: {
    paddingTop: space.md,
    paddingHorizontal: layout.marginCompact,
    backgroundColor: t.surface.card,
    ...t.shadow[3],
  },
  field: { gap: space.xs },
  label: { ...typography.footnote, color: t.text.secondary },
  labelError: { color: t.status.negative.text },
  required: { color: t.text.required },
  inputRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: space.sm },
  prefix: {
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    minHeight: touchTarget,
    justifyContent: 'center' as const,
    backgroundColor: t.surface.fieldReadOnly,
  },
  prefixText: { ...typography.body, color: t.text.primary },
  input: {
    ...typography.body,
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    minHeight: touchTarget,
    backgroundColor: t.surface.field,
    borderColor: t.border.field,
    color: t.text.primary,
  },
  multiline: { minHeight: touchTarget * 2 },
  inputFocused: { borderColor: t.border.fieldFocus, borderWidth: 2 },
  inputError: { borderColor: t.status.negative.border, borderWidth: 2 },
  messageRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: space.xs },
  errorText: { ...typography.footnote, flex: 1, color: t.status.negative.text },
  helperText: { ...typography.footnote, color: t.text.secondary },
});

export default CustomerForm;
