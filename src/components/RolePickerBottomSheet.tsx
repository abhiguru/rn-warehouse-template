/**
 * RolePickerBottomSheet
 *
 * Bottom sheet for selecting user roles.
 * Filters available roles based on caller's role (supervisor cannot assign admin).
 */

import React, { useCallback, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { UserRole } from '@/types/user.types';
import { useListColors } from '@/hooks/useListColors';

// =============================================================================
// ROLE CONFIGURATION
// =============================================================================

interface RoleOption {
  value: UserRole;
  label: string;
  description: string;
  icon: string;
  color: string;
}

const ALL_ROLES: RoleOption[] = [
  {
    value: 'admin',
    label: 'Admin',
    description: 'Full system access and user management',
    icon: 'shield-crown',
    color: '#f69000',
  },
  {
    value: 'supervisor',
    label: 'Supervisor',
    description: 'Can manage operations and view all data',
    icon: 'account-supervisor',
    color: '#1c5858',
  },
  {
    value: 'staff',
    label: 'Staff',
    description: 'Can create and manage GRNs and dispatches',
    icon: 'account-hard-hat',
    color: '#7e8e9d',
  },
  {
    value: 'customer',
    label: 'Customer',
    description: 'Can view assigned orders and invoices',
    icon: 'account',
    color: '#53b1b1',
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

  // Theme colors for dark mode support
  const colors = useListColors();

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(() => StyleSheet.create({
    bottomSheetBackground: {
      backgroundColor: colors.cellBackground,
    },
    handleIndicator: {
      backgroundColor: colors.gray300,
      width: 40,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.cellDivider,
    },
    title: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    roleItemSelected: {
      backgroundColor: colors.primaryLight,
    },
    roleItemPressed: {
      backgroundColor: colors.gray50,
    },
    roleLabel: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 2,
    },
    roleDescription: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    helperText: {
      fontSize: 13,
      color: colors.textTertiary,
      textAlign: 'center',
      paddingVertical: 12,
      fontStyle: 'italic',
    },
  }), [colors]);

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
        opacity={0.4}
        pressBehavior="close"
      />
    ),
    []
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
      <BottomSheetView style={styles.container}>
        {/* Header */}
        <View style={dynamicStyles.header}>
          <Text style={dynamicStyles.title}>Select Role</Text>
          <Pressable
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="close" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Role Options */}
        <View style={styles.roleList}>
          {availableRoles.map((role) => {
            const isSelected = role.value === currentRole;
            return (
              <Pressable
                key={role.value}
                style={({ pressed }) => [
                  styles.roleItem,
                  isSelected && dynamicStyles.roleItemSelected,
                  pressed && dynamicStyles.roleItemPressed,
                ]}
                onPress={() => handleSelect(role.value)}
              >
                <View
                  style={[styles.roleIcon, { backgroundColor: `${role.color}15` }]}
                >
                  <Icon name={role.icon} size={24} color={role.color} />
                </View>
                <View style={styles.roleContent}>
                  <Text style={dynamicStyles.roleLabel}>{role.label}</Text>
                  <Text style={dynamicStyles.roleDescription}>{role.description}</Text>
                </View>
                {isSelected && (
                  <Icon
                    name="check-circle"
                    size={24}
                    color={colors.success}
                  />
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Helper text for supervisors */}
        {callerRole === 'supervisor' && (
          <Text style={dynamicStyles.helperText}>
            Note: Only administrators can assign the Admin role.
          </Text>
        )}
      </BottomSheetView>
    </BottomSheet>
  );
};

// =============================================================================
// STYLES (Layout only - colors in dynamicStyles)
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleList: {
    paddingVertical: 12,
  },
  roleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 8,
  },
  roleIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  roleContent: {
    flex: 1,
  },
});
