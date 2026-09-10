import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useListColors } from '@/hooks/useListColors';
import { UserService } from '@/services/user-service';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setUserProfile } from '@/store/slices/authSlice';
import {
  UserProfile,
  UserFormData,
  CustomerAssignment
} from '@/types/user.types';

const UserEditScreen: React.FC = () => {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const colors = useListColors();
  const dispatch = useAppDispatch();
  const { userProfile: currentUserProfile } = useAppSelector((state) => state.auth);

  // Dynamic styles for dark mode
  const dynamicStyles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.gray50,
        },
        loadingContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.gray50,
        },
        loadingText: {
          marginTop: 12,
          fontSize: 16,
          color: colors.textSecondary,
        },
        errorContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.gray50,
        },
        errorText: {
          fontSize: 16,
          color: colors.statusNegative,
        },
        header: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: colors.cellBackground,
          paddingTop: 60,
          paddingHorizontal: 16,
          paddingBottom: 16,
          borderBottomWidth: 1,
          borderBottomColor: colors.cellDivider,
        },
        backButtonText: {
          fontSize: 16,
          color: colors.textSecondary,
        },
        title: {
          fontSize: 18,
          fontWeight: '600',
          color: colors.textPrimary,
        },
        saveButton: {
          backgroundColor: colors.primary,
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 8,
          minWidth: 60,
          alignItems: 'center',
        },
        saveButtonText: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.cellBackground,
        },
        section: {
          backgroundColor: colors.cellBackground,
          marginTop: 16,
          paddingHorizontal: 16,
          paddingVertical: 20,
        },
        sectionTitle: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.textPrimary,
          marginBottom: 16,
        },
        inputLabel: {
          fontSize: 14,
          fontWeight: '500',
          color: colors.textSecondary,
          marginBottom: 8,
        },
        textInput: {
          backgroundColor: colors.gray100,
          borderWidth: 1,
          borderColor: colors.cellDivider,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 12,
          fontSize: 16,
          color: colors.textPrimary,
        },
        readOnlyInput: {
          backgroundColor: colors.gray200,
          borderColor: colors.gray300,
          color: colors.textSecondary,
        },
        readOnlyNote: {
          fontSize: 12,
          color: colors.textTertiary,
          marginTop: 4,
          fontStyle: 'italic',
        },
        infoRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.cellDivider,
        },
        infoLabel: {
          fontSize: 16,
          fontWeight: '500',
          color: colors.textSecondary,
        },
        infoValue: {
          fontSize: 16,
          color: colors.textPrimary,
          textAlign: 'right',
          marginLeft: 16,
          flex: 1,
        },
        assignedCustomerName: {
          fontSize: 16,
          fontWeight: '500',
          color: colors.textPrimary,
          marginBottom: 4,
        },
        assignedCustomerDetail: {
          fontSize: 14,
          color: colors.textSecondary,
        },
        customerStatusText: {
          fontSize: 12,
          fontWeight: '500',
          color: colors.textSecondary,
        },
        emptyText: {
          fontSize: 16,
          fontWeight: '500',
          color: colors.textSecondary,
          marginBottom: 4,
        },
        emptySubtext: {
          fontSize: 14,
          color: colors.textTertiary,
          textAlign: 'center',
        },
        separator: {
          height: 1,
          backgroundColor: colors.cellDivider,
        },
      }),
    [colors]
  );

  // State management
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);

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
      Alert.alert('Error', 'User ID is required');
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
        Alert.alert('Error', result.message || 'Failed to load user data');
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
      Alert.alert('Error', 'Failed to load user data');
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
      Alert.alert('Validation Error', 'Name is required');
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

        Alert.alert(
          'Success',
          'Profile updated successfully',
          [
            {
              text: 'OK',
              onPress: () => router.back()
            }
          ]
        );
      } else {
        Alert.alert('Error', result.message || 'Failed to update profile');
      }
    } catch (error) {
      console.error('[UserEditScreen] Save error:', error);
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }, [userId, formData, currentUserProfile, dispatch]);

  // Load data on mount
  useEffect(() => {
    loadUserData();
  }, [loadUserData]);


  // Render assigned customer (read-only)
  const renderAssignedCustomerReadOnly = ({ item }: { item: CustomerAssignment }) => (
    <View style={styles.assignedCustomerItem}>
      <View style={styles.assignedCustomerInfo}>
        <Text style={dynamicStyles.assignedCustomerName}>{item.name}</Text>
        {(item.mobile || item.city) && (
          <Text style={dynamicStyles.assignedCustomerDetail}>
            {[item.mobile, item.city].filter(Boolean).join(' • ')}
          </Text>
        )}
      </View>
      <View style={styles.customerStatusIndicator}>
        <Text style={dynamicStyles.customerStatusText}>
          {item.active ? '✓ Active' : '○ Inactive'}
        </Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={dynamicStyles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={dynamicStyles.loadingText}>Loading user data...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={dynamicStyles.errorContainer}>
        <Text style={dynamicStyles.errorText}>User not found</Text>
      </View>
    );
  }

  return (
    <View style={dynamicStyles.container}>
      {/* Header */}
      <View style={dynamicStyles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={dynamicStyles.backButtonText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={dynamicStyles.title}>Edit User</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={[dynamicStyles.saveButton, saving && styles.saveButtonDisabled]}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.cellBackground} />
          ) : (
            <Text style={dynamicStyles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Basic Information */}
        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Basic Information</Text>

          <View style={styles.inputGroup}>
            <Text style={dynamicStyles.inputLabel}>Name *</Text>
            <TextInput
              style={dynamicStyles.textInput}
              value={formData.name}
              onChangeText={(text) => setFormData(prev => ({ ...prev, name: text }))}
              placeholder="Enter user name"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={dynamicStyles.inputLabel}>Mobile (Login Number)</Text>
            <TextInput
              style={[dynamicStyles.textInput, dynamicStyles.readOnlyInput]}
              value={formData.mobile}
              placeholder="Mobile number used for login"
              placeholderTextColor={colors.textTertiary}
              keyboardType="phone-pad"
              editable={false}
              selectTextOnFocus={false}
            />
            <Text style={dynamicStyles.readOnlyNote}>
              This is your login number and cannot be changed
            </Text>
          </View>
        </View>

        {/* Role & Status */}
        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Role & Status</Text>
          <Text style={dynamicStyles.readOnlyNote}>
            Role and status settings are managed by administrators
          </Text>

          <View style={dynamicStyles.infoRow}>
            <View style={styles.infoLeft}>
              <Text style={styles.infoIcon}>🎯</Text>
              <Text style={dynamicStyles.infoLabel}>Role</Text>
            </View>
            <Text style={dynamicStyles.infoValue}>
              {formData.supervisor ? 'Supervisor' : 'User'}
            </Text>
          </View>

          <View style={dynamicStyles.infoRow}>
            <View style={styles.infoLeft}>
              <Text style={styles.infoIcon}>{formData.active ? '✅' : '❌'}</Text>
              <Text style={dynamicStyles.infoLabel}>Status</Text>
            </View>
            <Text style={dynamicStyles.infoValue}>
              {formData.active ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>

        {/* Customer Assignments */}
        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Customer Assignments</Text>
          <Text style={dynamicStyles.readOnlyNote}>
            Customer assignments are managed by administrators
          </Text>

          {assignedCustomers.length > 0 ? (
            <FlatList
              data={assignedCustomers}
              renderItem={renderAssignedCustomerReadOnly}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={dynamicStyles.separator} />}
            />
          ) : (
            <View style={styles.emptyState}>
              <Text style={dynamicStyles.emptyText}>No customers assigned</Text>
              <Text style={dynamicStyles.emptySubtext}>Contact an administrator for customer assignments</Text>
            </View>
          )}
        </View>
      </ScrollView>

    </View>
  );
};

// Static styles (layout only - colors in dynamicStyles)
const styles = StyleSheet.create({
  backButton: {
    padding: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  content: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 20,
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  infoIcon: {
    fontSize: 18,
    marginRight: 12,
    width: 24,
    textAlign: 'center',
  },
  assignedCustomerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  assignedCustomerInfo: {
    flex: 1,
  },
  customerStatusIndicator: {
    padding: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
});

export default UserEditScreen;