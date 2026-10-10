/**
 * RolePickerBottomSheet
 *
 * Bottom sheet for selecting user roles.
 * Filters available roles based on caller's role (supervisor cannot assign admin).
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, BackHandler } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { UserRole } from '@/types/user.types';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { t as tr, type TranslationKey } from '@/i18n';
import { roleLabel } from '@/utils/roleLabel';

// =============================================================================
// ROLE CONFIGURATION
// =============================================================================

interface RoleOption {
  value: UserRole;
  /** Key of the one-line description; the name comes from `roleLabel`. */
  descriptionKey: TranslationKey;
  icon: string;
  /** Index into the theme's avatar palette (category colour, not status). */
  avatarIndex: number;
}

const ALL_ROLES: RoleOption[] = [
  {
    value: 'admin',
    descriptionKey: 'users.roleDescription.admin',
    icon: 'shield-crown',
    avatarIndex: 0,
  },
  {
    value: 'supervisor',
    descriptionKey: 'users.roleDescription.supervisor',
    icon: 'account-supervisor',
    avatarIndex: 5,
  },
  {
    value: 'staff',
    descriptionKey: 'users.roleDescription.staff',
    icon: 'account-hard-hat',
    avatarIndex: 8,
  },
  {
    value: 'customer',
    descriptionKey: 'users.roleDescription.customer',
    icon: 'account',
    avatarIndex: 6,
  },
];

// =============================================================================
// COMPONENT
// =============================================================================

interface RolePickerBottomSheetProps {
  isVisible: boolean;
  onClose: () => void;
  onSelect: (role: UserRole) => void;
  currentRole: UserRole;
  callerRole: 'admin' | 'supervisor';
}

export const RolePickerBottomSheet: React.FC<RolePickerBottomSheetProps> = ({
  isVisible,
  onClose,
  onSelect,
  currentRole,
  callerRole,
}) => {
  const bottomSheetRef = React.useRef<BottomSheet>(null);

  const t = useTokens();
  const dynamicStyles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const avatarIconColor = t.mode === 'dark' ? t.overlay.onImage : t.text.primary;

  // Android back closes the sheet first (style guide 15)
  useEffect(() => {
    if (!isVisible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [isVisible, onClose]);

  // Filter roles based on caller's role
  const availableRoles = useMemo(() => {
    if (callerRole === 'admin') {
      return ALL_ROLES;
    }
    // Supervisors cannot assign admin role
    return ALL_ROLES.filter((role) => role.value !== 'admin');
  }, [callerRole]);

  // Handle role selection
  const handleSelect = useCallback(
    (role: UserRole) => {
      onSelect(role);
      onClose();
    },
    [onSelect, onClose]
  );

  // Render backdrop
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={1}
        pressBehavior="close"
        style={[props.style, dynamicStyles.backdrop]}
      />
    ),
    [dynamicStyles.backdrop]
  );

  // Handle sheet changes
  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isVisible) {
    return null;
  }

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={['50%']}
      onChange={handleSheetChanges}
      backdropComponent={renderBackdrop}
      enablePanDownToClose
      handleIndicatorStyle={dynamicStyles.handleIndicator}
      backgroundStyle={dynamicStyles.bottomSheetBackground}
    >
      <BottomSheetView style={[styles.container, { paddingBottom: insets.bottom + space.lg }]}>
        {/* Header */}
        <View style={dynamicStyles.header}>
          <Text style={dynamicStyles.title} accessibilityRole="header">{tr('users.rolePicker.title')}</Text>
          <Pressable
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={tr('users.rolePicker.close')}
          >
            <Icon name="close" size={iconSize.lg} color={t.icon.primary} />
          </Pressable>
        </View>

        {/* Role Options */}
        <View style={styles.roleList} accessibilityRole="radiogroup">
          {availableRoles.map((role) => {
            const isSelected = role.value === currentRole;
            const label = roleLabel(role.value);
            const description = tr(role.descriptionKey);
            return (
              <Pressable
                key={role.value}
                style={({ pressed }) => [
                  styles.roleItem,
                  isSelected && dynamicStyles.roleItemSelected,
                  pressed && dynamicStyles.roleItemPressed,
                ]}
                onPress={() => handleSelect(role.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected, selected: isSelected }}
                accessibilityLabel={tr('users.rolePicker.optionLabel', { role: label, description })}
              >
                <View
                  style={[styles.roleIcon, { backgroundColor: t.avatar[role.avatarIndex % t.avatar.length] }]}
                >
                  <Icon name={role.icon} size={iconSize.lg} color={avatarIconColor} />
                </View>
                <View style={styles.roleContent}>
                  <Text style={dynamicStyles.roleLabel}>{label}</Text>
                  <Text style={dynamicStyles.roleDescription}>{description}</Text>
                </View>
                {isSelected && (
                  <Icon
                    name="check-circle"
                    size={iconSize.lg}
                    color={t.brand.tint}
                  />
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Helper text for supervisors */}
        {callerRole === 'supervisor' && (
          <Text style={dynamicStyles.helperText}>
            {tr('users.rolePicker.adminOnly')}
          </Text>
        )}
      </BottomSheetView>
    </BottomSheet>
  );
};

// =============================================================================
// STYLES
// =============================================================================

const makeStyles = (t: ThemeTokens) => ({
  backdrop: {
    backgroundColor: t.overlay.scrim,
  },
  bottomSheetBackground: {
    backgroundColor: t.surface.sheet,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    ...t.shadow[4],
  },
  handleIndicator: {
    backgroundColor: t.border.separator,
    width: 36,
    height: 4,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  title: {
    ...typography.headline,
    color: t.text.primary,
  },
  roleItemSelected: {
    backgroundColor: t.surface.selected,
  },
  roleItemPressed: {
    backgroundColor: t.surface.cardPressed,
  },
  roleLabel: {
    ...typography.headline,
    color: t.text.primary,
    marginBottom: space.xxs,
  },
  roleDescription: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  helperText: {
    ...typography.footnote,
    color: t.text.secondary,
    textAlign: 'center' as const,
    paddingVertical: space.md,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.lg,
  },
  closeButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleList: {
    paddingVertical: space.md,
  },
  roleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: layout.objectCellMinHeight,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.button,
    marginBottom: space.sm,
  },
  roleIcon: {
    width: layout.avatar.md,
    height: layout.avatar.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  roleContent: {
    flex: 1,
  },
});
