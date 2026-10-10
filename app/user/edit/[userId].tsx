/**
 * Edit own profile (style guide §14.4): name is editable; mobile, role,
 * status and customer assignments are read-only and managed by admins.
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
  FlatList,
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
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setUserProfile } from '@/store/slices/authSlice';
import {
  UserProfile,
  UserFormData,
  CustomerAssignment
} from '@/types/user.types';

import { showAlert } from '@/utils/alert';
import { formatMobile } from '@/utils/formatters';
import { t as tr } from '@/i18n';
const UserEditScreen: React.FC = () => {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { userProfile: currentUserProfile } = useAppSelector((state) => state.auth);

  // State management
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameFocused, setNameFocused] = useState(false);

  // Form state
  const [formData, setFormData] = useState<UserFormData>({
    name: '',
    email: '',
    mobile: '',
    supervisor: false,
    active: true,
    assignedCustomerIds: []
  });

  // Customer assignment state (read-only)
  const [assignedCustomers, setAssignedCustomers] = useState<CustomerAssignment[]>([]);

  // Load user data
  const loadUserData = useCallback(async () => {
    console.log('[UserEditScreen] loadUserData called');
    console.log('[UserEditScreen] userId from params:', userId);

    if (!userId) {
      console.log('[UserEditScreen] No userId provided, going back');
      showAlert(tr('users.selfEdit.couldNotOpenTitle'), tr('users.selfEdit.couldNotOpenMessage'));
      router.back();
      return;
    }

    try {
      setLoading(true);
      console.log('[UserEditScreen] Calling UserService.getUserById with:', userId);

      const result = await UserService.getUserById(userId);
      console.log('[UserEditScreen] getUserById result:', {
        success: result.success,
        message: result.message,
        error: result.error,
        hasData: !!result.data
      });
      
      if (!result.success || !result.data) {
        showAlert(tr('users.selfEdit.couldNotLoadTitle'), result.message || tr('common.checkConnection'));
        router.back();
        return;
      }

      const userData = result.data;
      setUser(userData);
      setAssignedCustomers(userData.assignedCustomers || []);
      
      // Set form data
      setFormData({
        name: userData.name,
        email: userData.email,
        mobile: userData.mobile || '',
        supervisor: userData.supervisor,
        active: userData.active,
        assignedCustomerIds: (userData.assignedCustomers || []).map(c => c.id)
      });

      if (__DEV__) console.log('[UserEditScreen] User data loaded:', {
        name: userData.name,
        role: userData.role,
        assignedCustomersCount: userData.assignedCustomers?.length || 0
      });
    } catch (error) {
      console.error('[UserEditScreen] Load error:', error);
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
    if (!formData.name.trim()) {
      setNameError(tr('users.selfEdit.nameRequired'));
      return;
    }

    try {
      setSaving(true);
      if (__DEV__) console.log('[UserEditScreen] Saving user data:', formData);

      const result = await UserService.updateUser(userId, formData);

      if (result.success) {
        // Update Redux state with new profile data
        if (currentUserProfile) {
          const updatedProfile = {
            ...currentUserProfile,
            name: formData.name,
          };
          dispatch(setUserProfile(updatedProfile));
          console.log('[UserEditScreen] Updated Redux userProfile:', updatedProfile.name);
        }

        showAlert(
          tr('users.selfEdit.savedTitle'),
          tr('users.selfEdit.savedMessage'),
          [
            {
              text: tr('common.ok'),
              onPress: () => router.back()
            }
          ]
        );
      } else {
        showAlert(tr('users.selfEdit.couldNotSaveTitle'), result.message || tr('users.edit.tryAgainSoon'));
      }
    } catch (error) {
      console.error('[UserEditScreen] Save error:', error);
      showAlert(tr('users.selfEdit.couldNotSaveTitle'), tr('common.checkConnection'));
    } finally {
      setSaving(false);
    }
  }, [userId, formData, currentUserProfile, dispatch]);

  // Load data on mount
  useEffect(() => {
    loadUserData();
  }, [loadUserData]);


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

  if (loading) {
    return (
      <View style={styles.centerContainer} accessibilityRole="progressbar" accessibilityLabel={tr('users.edit.loading')}>
        <ActivityIndicator size="large" color={t.brand.tint} />
        <Text style={styles.loadingText}>{tr('users.edit.loadingText')}</Text>
      </View>
    );
  }

  if (!user) {
    return (
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
    );
  }

  const ownRoleLabel = tr(formData.supervisor ? 'users.role.supervisor' : 'users.role.user');
  const ownStatusLabel = tr(formData.active ? 'common.active' : 'common.inactive');

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.cancelButton, pressed && styles.cancelButtonPressed]}
          accessibilityRole="button"
        >
          <Text style={styles.cancelButtonText}>{tr('common.cancel')}</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {tr('users.profile.edit')}
        </Text>
        <Pressable
          onPress={handleSave}
          style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={tr('users.selfEdit.saveLabel')}
          accessibilityState={{ busy: saving }}
        >
          {saving ? (
            <ActivityIndicator size="small" color={t.brand.onFill} />
          ) : (
            <Text style={styles.saveButtonText}>{tr('common.save')}</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Basic Information */}
        <Text style={styles.sectionTitle} accessibilityRole="header">{tr('users.selfEdit.basicInformation')}</Text>
        <View style={styles.section}>
          <View style={styles.inputGroup}>
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
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              accessibilityLabel={tr('users.selfEdit.nameLabel')}
            />
            {!!nameError && (
              <View style={styles.errorRow} accessibilityLiveRegion="polite">
                <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} />
                <Text style={styles.errorText}>{nameError}</Text>
              </View>
            )}
          </View>

          <View>
            <Text style={styles.inputLabel}>{tr('users.selfEdit.mobileLabel')}</Text>
            <View style={styles.readOnlyField} accessible accessibilityLabel={tr('users.selfEdit.mobileReadOnly', { mobile: formData.mobile ? formatMobile(formData.mobile) : tr('users.selfEdit.mobileNotSet') })}>
              <Text style={styles.readOnlyValue}>
                {formData.mobile ? formatMobile(formData.mobile) : '—'}
              </Text>
            </View>
            <Text style={styles.helperText}>{tr('users.selfEdit.mobileHelp')}</Text>
          </View>
        </View>

        {/* Role & Status */}
        <Text style={styles.sectionTitle} accessibilityRole="header">{tr('users.selfEdit.roleAndStatus')}</Text>
        <View style={styles.section}>
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

        {/* Customer Assignments */}
        <Text style={styles.sectionTitle} accessibilityRole="header">{tr('users.edit.assignments')}</Text>
        <View style={styles.section}>
          {assignedCustomers.length > 0 ? (
            <FlatList
              data={assignedCustomers}
              renderItem={renderAssignedCustomerReadOnly}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          ) : (
            <View style={styles.emptyState}>
              <Icon name="account-multiple-outline" size={iconSize.xl} color={t.icon.secondary} />
              <Text style={styles.emptyText}>{tr('users.edit.noAssignments')}</Text>
              <Text style={styles.emptySubtext}>{tr('users.selfEdit.askAdmin')}</Text>
            </View>
          )}
        </View>
        <Text style={styles.sectionFooter}>{tr('users.selfEdit.assignmentsFooter')}</Text>
      </ScrollView>
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
  cancelButton: {
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    justifyContent: 'center' as const,
    borderRadius: radius.button,
  },
  cancelButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  cancelButtonText: {
    ...typography.body,
    color: t.brand.tint,
  },
  title: {
    ...typography.headline,
    flexShrink: 1,
    color: t.text.primary,
  },
  saveButton: {
    backgroundColor: t.brand.fill,
    paddingHorizontal: space.lg,
    minHeight: touchTarget,
    borderRadius: radius.button,
    minWidth: 64,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  saveButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  saveButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
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
