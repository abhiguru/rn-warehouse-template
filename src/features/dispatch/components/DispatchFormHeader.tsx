/**
 * Dispatch Form Header
 * Reusable header component for dispatch form steps
 * Based on GRNFormHeader pattern
 */

import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import {
  fontWeight,
  iconSize,
  space,
  touchTarget,
  typography,
} from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

import { showAlert } from '@/utils/alert';
import { t as tr } from '@/i18n';

export interface DispatchFormHeaderProps {
  title: string; // e.g., "Create dispatch"
  onCancel: () => void; // Called after user confirms cancellation
  showCancelButton?: boolean; // Default: true
  confirmCancel?: boolean; // Show confirmation alert (default: true)
  cancelMessage?: string; // Custom cancel confirmation message
  rightAction?: {
    icon: string; // MaterialCommunityIcons name
    label?: string; // Optional label
    onPress: () => void;
    disabled?: boolean;
  };
}

const HEADER_HEIGHT_IOS = 56;
const HEADER_HEIGHT_ANDROID = 64;

const makeStyles = (t: ThemeTokens) => ({
  // Stack header spec (guide 13.8): surface.header, no shadow, hairline divider
  container: {
    backgroundColor: t.surface.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border.divider,
  },
  content: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: space.lg,
  },
  cancelButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingRight: space.sm,
    minHeight: touchTarget,
    minWidth: touchTarget,
  },
  cancelText: {
    ...typography.callout,
    color: t.brand.tint,
  },
  title: {
    ...typography.headline,
    color: t.text.primary,
    textAlign: 'center' as const,
    flex: 1,
  },
  spacer: {
    width: 80, // Match approximate width of cancel button
  },
  rightActionButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingLeft: space.sm,
    minHeight: touchTarget,
    minWidth: touchTarget,
  },
  pressed: {
    opacity: 0.6,
  },
  rightActionButtonDisabled: {
    opacity: t.interaction.disabledOpacity,
  },
  rightActionText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.tint,
  },
});

export const DispatchFormHeader: React.FC<DispatchFormHeaderProps> = ({
  title,
  onCancel,
  showCancelButton = true,
  confirmCancel = true,
  cancelMessage = tr('dispatch.wizard.discardCreateMessage'),
  rightAction,
}) => {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const handleCancelPress = () => {
    if (confirmCancel) {
      showAlert(
        tr('dispatch.wizard.discardTitle'),
        cancelMessage,
        [
          {
            text: tr('common.keepEditing'),
            style: 'cancel',
          },
          {
            text: tr('dispatch.wizard.discardDispatch'),
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
          paddingTop: insets.top || space.md,
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
          <Pressable
            style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
            onPress={handleCancelPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={tr('dispatch.wizard.cancelDispatch')}
          >
            <Icon name="close" size={iconSize.lg} color={t.brand.tint} />
            <Text style={styles.cancelText}>{tr('common.cancel')}</Text>
          </Pressable>
        )}

        {/* Title */}
        <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
          {title}
        </Text>

        {/* Right Action Button or Spacer */}
        {rightAction ? (
          <Pressable
            style={({ pressed }) => [
              styles.rightActionButton,
              rightAction.disabled && styles.rightActionButtonDisabled,
              pressed && styles.pressed,
            ]}
            onPress={rightAction.onPress}
            disabled={rightAction.disabled}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={rightAction.label ?? title}
            accessibilityState={{ disabled: !!rightAction.disabled }}
          >
            <Icon
              name={rightAction.icon}
              size={iconSize.lg}
              color={t.brand.tint}
            />
            {rightAction.label && (
              <Text style={styles.rightActionText}>
                {rightAction.label}
              </Text>
            )}
          </Pressable>
        ) : (
          showCancelButton && <View style={styles.spacer} />
        )}
      </View>
    </View>
  );
};
