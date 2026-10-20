/**
 * Change name: the own-profile edit (style guide §14.4). The name is the one
 * editable field, with a line saying where it is shown. Mobile, role, status
 * and customer access are read-only, managed by administrators, and sit in a
 * collapsed "Account details" (review 2026-10-13: SR-07, SR-08, O06).
 *
 * Customer access is read on its own: a failed read says so and offers Try
 * again, which reloads only that part and keeps a typed name. For admin,
 * supervisor and staff it is every active customer (a rule of the role); for
 * a customer it is the assigned ones.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  touchTarget,
  typography,
  type ThemeTokens,
  trackedText,
} from '@/theme/tokens';
import { UserService } from '@/services/user-service';
import { PERSON_NAME_MAX, cleanPersonName } from '@/utils/personName';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setUserProfile } from '@/store/slices/authSlice';
import {
  UserProfile,
  UserFormData,
  CustomerAssignment
} from '@/types/user.types';
import { getActiveOperatorServer } from '@/config/operatorServer';
import { InlineValidation } from '@/components/fiori/InlineValidation';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';
import { Button } from '@/components/ui/Button';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import { showToast } from '@/utils/toast';
import { showAlert } from '@/utils/alert';
import { formatCount, formatMobile } from '@/utils/formatters';
import { roleLabel } from '@/utils/roleLabel';
import { createLogger, loggableError } from '@/utils/logger';
import { t as tr } from '@/i18n';
import { errorCodeOf, isNetworkError, requestMayHaveBeenSent, serverText, transportText } from '@/utils/serverText';

const log = createLogger('ownProfileEdit');

/** The customers this person may see, and whether they could be read. */
type CustomerAccess = { status: 'loading' | 'loaded' | 'failed'; customers: CustomerAssignment[] };

/** The facility's name for the scope line; empty when no facility is chosen. */
const facilityName = (): string => {
  const server = getActiveOperatorServer();
  return server ? server.companyName || server.displayName : '';
};
const UserEditScreen: React.FC = () => {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { userProfile: currentUserProfile } = useAppSelector((state) => state.auth);

  // State management
  const [loading, setLoading] = useState(true);
  // One save at a time: a second tap before the next draw sends nothing.
  const { run: runSave, busy: saving } = useSingleFlight();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameFocused, setNameFocused] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  // Form state
  const [formData, setFormData] = useState<UserFormData>({
    name: '',
    email: '',
    mobile: '',
    supervisor: false,
    active: true,
    assignedCustomerIds: []
  });

  // Ask before a typed name is dropped: header Back, the phone's Back key and the swipe all come through here.
  const loadedName = (user?.name ?? '').trim();
  const nameChanged = !!user && formData.name.trim() !== loadedName;
  const { leaveWithoutAsking } = useLeaveGuard({ hasChanges: nameChanged });

  // Customer access (read-only), loaded with the profile and retried on its own
  const [customerAccess, setCustomerAccess] = useState<CustomerAccess>({ status: 'loading', customers: [] });

  // Load user data
  const loadUserData = useCallback(async () => {

    if (!userId) {
      showAlert(tr('users.selfEdit.couldNotOpenTitle'), tr('users.selfEdit.couldNotOpenMessage'));
      router.back();
      return;
    }

    try {
      setLoading(true);

      const result = await UserService.getUserById(userId);
      
      if (!result.success || !result.data) {
        showAlert(tr('users.selfEdit.couldNotLoadTitle'), serverText(result.message, tr('common.checkConnection')));
        router.back();
        return;
      }

      const userData = result.data;
      setUser(userData);
      setCustomerAccess({
        status: userData.assignedCustomersStatus === 'failed' ? 'failed' : 'loaded',
        customers: userData.assignedCustomers || [],
      });
      
      // Set form data
      setFormData({
        name: userData.name,
        email: userData.email,
        mobile: userData.mobile || '',
        supervisor: userData.supervisor,
        active: userData.active,
        assignedCustomerIds: (userData.assignedCustomers || []).map(c => c.id)
      });

    } catch (error) {
      log.error('Load error', loggableError(error));
      showAlert(tr('users.selfEdit.couldNotLoadTitle'), tr('common.checkConnection'));
      router.back();
    } finally {
      setLoading(false);
    }
  }, [userId]);


  // Save user data
  const handleSave = useCallback(async () => {
    if (!userId) return;

    // Basic validation
    if (!cleanPersonName(formData.name)) {
      setNameError(tr('users.selfEdit.nameRequired'));
      return;
    }

    // Nothing changed: there is nothing to save, so leave without a server call or a message.
    if (!nameChanged) {
      leaveWithoutAsking(() => router.back());
      return;
    }

    await runSave(async () => {
      try {
        // The comparison above is on trimmed names: save and keep the trimmed one too.
        const name = cleanPersonName(formData.name);
        const result = await UserService.updateUser(userId, { ...formData, name });

        if (result.success) {
          // Update Redux state with new profile data
          if (currentUserProfile) {
            const updatedProfile = {
              ...currentUserProfile,
              name,
              display_name: name,
            };
            dispatch(setUserProfile(updatedProfile));
          }

          // Go back at once; the toast stays on the screen this returns to.
          leaveWithoutAsking(() => router.back());
          showToast(tr('users.selfEdit.savedTitle'));
        } else {
          // The request never left (no connection): say so in words about the name. Once it had gone out, a timeout
          // or a connection that dropped keeps the shared "may have been saved" text.
          const text = isNetworkError(result) && !requestMayHaveBeenSent(result)
            ? tr('users.selfEdit.saveOffline')
            : transportText(result, { write: true, form: true }) ??
              serverText(result.message, tr('users.edit.tryAgainSoon'), { write: true, form: true, code: errorCodeOf(result) });
          showAlert(tr('users.selfEdit.couldNotSaveTitle'), text);
        }
      } catch (error) {
        log.error('Save error', loggableError(error));
        showAlert(
          tr('users.selfEdit.couldNotSaveTitle'),
          isNetworkError(error) && !requestMayHaveBeenSent(error)
            ? tr('users.selfEdit.saveOffline')
            : transportText(error, { write: true, form: true }) ?? tr('users.edit.tryAgainSoon')
        );
      }
    });
  }, [userId, formData, nameChanged, leaveWithoutAsking, currentUserProfile, dispatch, runSave]);

  // Load data on mount
  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  // Try again after a failed customer-access read: only that part; the form is kept.
  const retryCustomerAccess = useCallback(async () => {
    setCustomerAccess(prev => ({ ...prev, status: 'loading' }));
    const result = await UserService.getAccessibleCustomers();
    setCustomerAccess(result);
  }, []);


  // Render assigned customer (read-only)
  const renderAssignedCustomerReadOnly = ({ item }: { item: CustomerAssignment }) => {
    const meta = [item.mobile && formatMobile(item.mobile), item.city].filter(Boolean).join(' · ');
    const statusLabel = tr(item.active ? 'common.active' : 'common.inactive');
    return (
      <View
        style={styles.assignedCustomerItem}
        accessible
        accessibilityLabel={[item.name, meta, statusLabel].filter(Boolean).join(', ')}
      >
        <View style={styles.flex}>
          <Text style={styles.assignedCustomerName}>{item.name}</Text>
          {!!meta && <Text style={styles.assignedCustomerDetail}>{meta}</Text>}
        </View>
        <View style={[styles.statusTag, item.active ? styles.statusTagPositive : styles.statusTagNeutral]}>
          <Icon
            name={item.active ? 'check-circle' : 'circle-outline'}
            size={iconSize.sm - 4}
            color={item.active ? t.status.positive.text : t.status.neutral.text}
          />
          <Text
            style={[styles.statusTagText, item.active ? styles.statusTextPositive : styles.statusTextNeutral]}
            maxFontSizeMultiplier={1.6}
          >
            {statusLabel}
          </Text>
        </View>
      </View>
    );
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
      <HeaderBackButton style={styles.headerSide} />
      <Text style={styles.title} accessibilityRole="header">
        {tr('users.selfEdit.title')}
      </Text>
      <View style={styles.headerSide} />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.centerContainer} accessibilityRole="progressbar" accessibilityLabel={tr('users.edit.loading')}>
          <ActivityIndicator size="large" color={t.brand.tint} />
          <Text style={styles.loadingText}>{tr('users.edit.loadingText')}</Text>
        </View>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.centerContainer} accessibilityRole="alert">
          <Icon name="alert-circle-outline" size={iconSize.hero} color={t.status.negative.text} />
          <Text style={styles.errorTitle}>{tr('users.selfEdit.notFound')}</Text>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={() => router.back()}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>{tr('common.goBack')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // The stored role, named as on Settings and Profile (not the legacy supervisor flag).
  const ownRoleLabel = roleLabel(user.role);
  const ownStatusLabel = tr(formData.active ? 'common.active' : 'common.inactive');
  const isCustomer = user.role === 'customer';
  const facility = facilityName();
  const scopeLine = facility
    ? tr('users.selfEdit.scope', { facility })
    : tr('users.selfEdit.scopeAccount');

  return (
    <View style={styles.container}>
      {header}

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* The one editable field */}
        <View style={[styles.section, styles.firstSection]}>
          <View>
            <Text style={[styles.inputLabel, !!nameError && styles.inputLabelError]}>
              {tr('users.fields.name')}<Text style={styles.required}> *</Text>
            </Text>
            <TextInput
              style={[styles.textInput, nameFocused && styles.textInputFocused, !!nameError && styles.textInputError]}
              value={formData.name}
              onChangeText={(text) => {
                setFormData(prev => ({ ...prev, name: text }));
                if (nameError) setNameError(null);
              }}
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
              placeholder={tr('users.selfEdit.namePlaceholder')}
              placeholderTextColor={t.text.placeholder}
              maxLength={PERSON_NAME_MAX}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              accessibilityLabel={tr('users.selfEdit.nameLabel')}
              accessibilityHint={scopeLine}
            />
            {!!nameError && (
              <View style={styles.errorRow} accessibilityLiveRegion="polite">
                <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} />
                <Text style={styles.errorText}>{nameError}</Text>
              </View>
            )}
          </View>
        </View>
        <Text style={styles.sectionFooter}>{scopeLine}</Text>

        {/* Read-only account details, collapsed */}
        <Pressable
          testID="self-edit-account-details"
          onPress={() => setDetailsExpanded(expanded => !expanded)}
          style={({ pressed }) => [styles.disclosure, pressed && styles.disclosurePressed]}
          accessibilityRole="button"
          accessibilityLabel={tr('users.selfEdit.accountDetails')}
          accessibilityHint={tr('users.selfEdit.accountDetailsHint')}
          accessibilityState={{ expanded: detailsExpanded }}
        >
          <Icon name="account-details-outline" size={iconSize.md} color={t.icon.secondary} />
          <Text style={styles.disclosureLabel}>{tr('users.selfEdit.accountDetails')}</Text>
          <Icon name={detailsExpanded ? 'chevron-up' : 'chevron-down'} size={iconSize.md} color={t.icon.secondary} />
        </Pressable>

        {detailsExpanded && (
          <>
            <View style={[styles.section, styles.detailsSection]}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{tr('users.selfEdit.mobileLabel')}</Text>
                <View style={styles.readOnlyField} accessible accessibilityLabel={tr('users.selfEdit.mobileReadOnly', { mobile: formData.mobile ? formatMobile(formData.mobile) : tr('users.selfEdit.mobileNotSet') })}>
                  <Text style={styles.readOnlyValue}>
                    {formData.mobile ? formatMobile(formData.mobile) : '—'}
                  </Text>
                </View>
                <Text style={styles.helperText}>{tr('users.selfEdit.mobileHelp')}</Text>
              </View>

              <View style={styles.infoRow} accessible accessibilityLabel={`${tr('users.fields.role')}, ${ownRoleLabel}`}>
                <View style={styles.infoLeft}>
                  <Icon name="shield-account-outline" size={iconSize.md} color={t.icon.secondary} />
                  <Text style={styles.infoLabel}>{tr('users.fields.role')}</Text>
                </View>
                <Text style={styles.infoValue}>{ownRoleLabel}</Text>
              </View>

              <View style={[styles.infoRow, styles.infoRowLast]} accessible accessibilityLabel={`${tr('users.fields.status')}, ${ownStatusLabel}`}>
                <View style={styles.infoLeft}>
                  <Icon
                    name={formData.active ? 'check-circle' : 'alert-circle'}
                    size={iconSize.md}
                    color={formData.active ? t.status.positive.text : t.status.negative.text}
                  />
                  <Text style={styles.infoLabel}>{tr('users.fields.status')}</Text>
                </View>
                <Text style={styles.infoValue}>{ownStatusLabel}</Text>
              </View>
            </View>
            <Text style={styles.sectionFooter}>{tr('users.selfEdit.roleStatusFooter')}</Text>

            {/* Customer access: assignments for a customer, every active customer for the other roles */}
            <Text style={styles.sectionTitle} accessibilityRole="header">
              {tr(isCustomer ? 'users.edit.assignments' : 'users.selfEdit.customerAccess')}
            </Text>
            <View style={styles.section}>
              {customerAccess.status === 'loading' ? (
                <View style={styles.emptyState} accessibilityRole="progressbar" accessibilityLabel={tr('users.selfEdit.customerAccessLoading')}>
                  <ActivityIndicator size="small" color={t.brand.tint} />
                  <Text style={styles.emptySubtext}>{tr('users.selfEdit.customerAccessLoading')}</Text>
                </View>
              ) : customerAccess.status === 'failed' ? (
                <View style={styles.failedState}>
                  <InlineValidation variant="error" message={tr('users.selfEdit.customerAccessFailed')} />
                  <Pressable
                    testID="self-edit-customers-retry"
                    onPress={retryCustomerAccess}
                    style={({ pressed }) => [styles.secondaryButton, styles.retryButton, pressed && styles.secondaryButtonPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={tr('common.retry')}
                  >
                    <Text style={styles.secondaryButtonText}>{tr('common.retry')}</Text>
                  </Pressable>
                </View>
              ) : customerAccess.customers.length > 0 && !isCustomer ? (
                // The rule of the role is every active customer: one count, not a row for each.
                <View
                  style={styles.countRow}
                  accessible
                  accessibilityLabel={formatCount(customerAccess.customers.length, 'customer')}
                  testID="self-edit-customer-count"
                >
                  <Icon name="account-multiple-outline" size={iconSize.md} color={t.icon.secondary} />
                  <Text style={styles.countText}>{formatCount(customerAccess.customers.length, 'customer')}</Text>
                </View>
              ) : customerAccess.customers.length > 0 ? (
                customerAccess.customers.map((item, index) => (
                  <React.Fragment key={item.id}>
                    {index > 0 && <View style={styles.separator} />}
                    {renderAssignedCustomerReadOnly({ item })}
                  </React.Fragment>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Icon name="account-multiple-outline" size={iconSize.xl} color={t.icon.secondary} />
                  {isCustomer ? (
                    <>
                      <Text style={styles.emptyText}>{tr('users.edit.noAssignments')}</Text>
                      <Text style={styles.emptySubtext}>{tr('users.selfEdit.askAdmin')}</Text>
                    </>
                  ) : (
                    <Text style={styles.emptyText}>{tr('users.selfEdit.customerAccessEmpty')}</Text>
                  )}
                </View>
              )}
            </View>
            <Text style={styles.sectionFooter}>
              {tr(isCustomer ? 'users.selfEdit.assignmentsFooter' : 'users.selfEdit.customerAccessFooter')}
            </Text>
          </>
        )}
      </ScrollView>

      {/* The save button sits under the form, not on it (style guide §14.4) */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + space.md }]}>
        <Button size="fullWidth" onPress={handleSave} loading={saving} disabled={saving} testID="self-edit-save">
          {tr('users.selfEdit.saveLabel')}
        </Button>
      </View>
    </View>
  );
};

const makeStyles = (t: ThemeTokens) => ({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: t.background.base,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: space.md,
    padding: space.xxl,
    backgroundColor: t.background.base,
  },
  loadingText: {
    ...typography.subhead,
    color: t.text.secondary,
  },
  errorTitle: {
    ...typography.title3,
    color: t.text.primary,
    textAlign: 'center' as const,
  },
  secondaryButton: {
    minHeight: touchTarget,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: t.border.button,
    paddingHorizontal: space.xl,
    justifyContent: 'center' as const,
  },
  secondaryButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  secondaryButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    backgroundColor: t.surface.header,
    paddingHorizontal: space.sm,
    paddingBottom: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  // Back on the left and an empty side of the same width on the right keep the title centred.
  headerSide: {
    width: 80,
    minHeight: touchTarget,
  },
  title: {
    ...typography.headline,
    flexShrink: 1,
    color: t.text.primary,
    textAlign: 'center' as const,
  },
  bottomBar: {
    backgroundColor: t.surface.card,
    paddingTop: space.md,
    paddingHorizontal: layout.marginCompact,
    ...t.shadow[3],
  },
  countRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: layout.rowMinHeight,
  },
  countText: {
    ...typography.body,
    color: t.text.primary,
  },
  sectionTitle: {
    ...typography.footnote,
    textTransform: 'uppercase' as const,
    letterSpacing: trackedText(0.5),
    color: t.text.secondary,
    marginTop: space.xxl,
    marginBottom: space.sm,
    marginHorizontal: layout.marginCompact,
  },
  sectionFooter: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.sm,
    marginHorizontal: layout.marginCompact,
  },
  firstSection: {
    marginTop: space.xxl,
  },
  detailsSection: {
    marginTop: space.sm,
  },
  disclosure: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: touchTarget,
    marginTop: space.xxl,
    marginHorizontal: layout.marginCompact,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.card,
    backgroundColor: t.surface.card,
  },
  disclosurePressed: {
    backgroundColor: t.brand.subtle,
  },
  disclosureLabel: {
    ...typography.body,
    flex: 1,
    color: t.text.primary,
  },
  failedState: {
    gap: space.md,
  },
  retryButton: {
    alignSelf: 'flex-start' as const,
    alignItems: 'center' as const,
  },
  section: {
    backgroundColor: t.surface.card,
    marginHorizontal: layout.marginCompact,
    borderRadius: radius.card,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    ...t.shadow[2],
  },
  inputGroup: {
    marginBottom: space.lg,
  },
  inputLabel: {
    ...typography.footnote,
    color: t.text.secondary,
    marginBottom: space.xs,
  },
  inputLabelError: {
    color: t.status.negative.text,
  },
  required: {
    color: t.text.required,
  },
  textInput: {
    ...typography.body,
    backgroundColor: t.surface.field,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: touchTarget,
    color: t.text.primary,
  },
  textInputFocused: {
    borderWidth: 2,
    borderColor: t.border.fieldFocus,
  },
  textInputError: {
    borderWidth: 2,
    borderColor: t.status.negative.border,
  },
  errorRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.xs,
    marginTop: space.xs,
  },
  errorText: {
    ...typography.footnote,
    flex: 1,
    color: t.status.negative.text,
  },
  readOnlyField: {
    backgroundColor: t.surface.fieldReadOnly,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    minHeight: touchTarget,
    justifyContent: 'center' as const,
  },
  readOnlyValue: {
    ...typography.body,
    color: t.text.primary,
    fontVariant: ['tabular-nums' as const],
  },
  helperText: {
    ...typography.footnote,
    color: t.text.secondary,
    marginTop: space.xs,
  },
  infoRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    minHeight: layout.rowMinHeight,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    flex: 1,
  },
  infoLabel: {
    ...typography.body,
    color: t.text.secondary,
  },
  infoValue: {
    ...typography.body,
    color: t.text.primary,
    textAlign: 'right' as const,
    marginLeft: space.lg,
    flex: 1,
  },
  assignedCustomerItem: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.md,
  },
  assignedCustomerName: {
    ...typography.body,
    color: t.text.primary,
    marginBottom: space.xxs,
  },
  assignedCustomerDetail: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  statusTag: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingHorizontal: space.s6,
    paddingVertical: space.xxs,
    borderRadius: radius.field,
  },
  statusTagPositive: {
    backgroundColor: t.status.positive.background,
  },
  statusTagNeutral: {
    backgroundColor: t.status.neutral.background,
  },
  statusTagText: {
    ...typography.caption1,
    fontWeight: fontWeight.semibold,
  },
  statusTextPositive: {
    color: t.status.positive.text,
  },
  statusTextNeutral: {
    color: t.status.neutral.text,
  },
  emptyState: {
    alignItems: 'center' as const,
    paddingVertical: space.xxl,
    gap: space.xs,
  },
  emptyText: {
    ...typography.body,
    color: t.text.primary,
    textAlign: 'center' as const,
    marginTop: space.sm,
  },
  emptySubtext: {
    ...typography.footnote,
    color: t.text.secondary,
    textAlign: 'center' as const,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.border.divider,
  },
});

export default UserEditScreen;
