/**
 * Dispatch Form Header
 * Reusable header component for dispatch form steps
 * Based on GRNFormHeader pattern
 */

import React, { ComponentProps } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import theme from '@/theme';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

export interface DispatchFormHeaderProps {
  title: string; // e.g., "Create Dispatch - Step 1"
  onCancel: () => void; // Called after user confirms cancellation
  showCancelButton?: boolean; // Default: true
  confirmCancel?: boolean; // Show confirmation alert (default: true)
  cancelMessage?: string; // Custom cancel confirmation message
  rightAction?: {
    icon: IoniconsName; // Ionicons name
    label?: string; // Optional label
    onPress: () => void;
    disabled?: boolean;
  };
}

const HEADER_HEIGHT_IOS = 56;
const HEADER_HEIGHT_ANDROID = 64;

export const DispatchFormHeader: React.FC<DispatchFormHeaderProps> = ({
  title,
  onCancel,
  showCancelButton = true,
  confirmCancel = true,
  cancelMessage = 'Are you sure you want to cancel? All entered data will be lost.',
  rightAction,
}) => {
  const insets = useSafeAreaInsets();

  const handleCancelPress = () => {
    if (confirmCancel) {
      Alert.alert(
        'Cancel Dispatch Creation',
        cancelMessage,
        [
          {
            text: 'Continue Editing',
            style: 'cancel',
          },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: onCancel,
          },
        ],
        { cancelable: true }
      );
    } else {
      onCancel();
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top || theme.spacing.md,
          height:
            (Platform.OS === 'ios'
              ? HEADER_HEIGHT_IOS
              : HEADER_HEIGHT_ANDROID) + (insets.top || 0),
        },
      ]}
    >
      <View style={styles.content}>
        {/* Cancel Button */}
        {showCancelButton && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancelPress}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={24} color={theme.colors.gray[700]} />
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        )}

        {/* Title */}
        <Text style={styles.title}>{title}</Text>

        {/* Right Action Button or Spacer */}
        {rightAction ? (
          <TouchableOpacity
            style={[
              styles.rightActionButton,
              rightAction.disabled && styles.rightActionButtonDisabled,
            ]}
            onPress={rightAction.onPress}
            disabled={rightAction.disabled}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={rightAction.icon}
              size={24}
              color={
                rightAction.disabled
                  ? theme.colors.gray[400]
                  : theme.colors.primary
              }
            />
            {rightAction.label && (
              <Text
                style={[
                  styles.rightActionText,
                  rightAction.disabled && styles.rightActionTextDisabled,
                ]}
              >
                {rightAction.label}
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          showCancelButton && <View style={styles.spacer} />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.primary,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.gray[200],
    ...Platform.select({
      ios: {
        shadowColor: theme.colors.black,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingRight: theme.spacing.sm,
    minHeight: 44, // iOS touch target
  },
  cancelText: {
    fontSize: theme.fontSize.base,
    fontWeight: '500',
    color: theme.colors.gray[700],
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.colors.gray[900],
    textAlign: 'center',
    flex: 1,
  },
  spacer: {
    width: 80, // Match approximate width of cancel button
  },
  rightActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingLeft: theme.spacing.sm,
    minHeight: 44, // iOS touch target
  },
  rightActionButtonDisabled: {
    opacity: 0.5,
  },
  rightActionText: {
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  rightActionTextDisabled: {
    color: theme.colors.gray[400],
  },
});
