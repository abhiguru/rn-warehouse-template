/**
 * MarkImageField - Package mark input with image preview
 *
 * Extracted from HorizontalItemForm.tsx for better maintainability.
 *
 * @module features/grn/components/item-form/MarkImageField
 */

import React, { forwardRef, useImperativeHandle, useRef, useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { GRNImageData } from '@/store/slices/grnFormSlice';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

import { showAlert } from '@/utils/alert';
import { formatCount } from '@/utils/formatters';
// ============================================================================
// TYPES
// ============================================================================

export interface MarkImageFieldRef {
  focus: () => void;
}

export interface MarkImageFieldProps {
  value: string;
  onChange: (value: string) => void;
  images: GRNImageData[];
  onImagePick: () => void;
  onImageRemove: (imageId: string) => void;
  maxImages?: number;
  onFocus?: () => void;
  onSubmitEditing?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const MarkImageField = forwardRef<MarkImageFieldRef, MarkImageFieldProps>(
  function MarkImageFieldInner(
    {
      value,
      onChange,
      images,
      onImagePick,
      onImageRemove,
      maxImages = 2,
      onFocus,
      onSubmitEditing,
    },
    ref
  ) {
    const styles = useThemedStyles(makeStyles);
    const t = useTokens();
    const inputRef = useRef<TextInput>(null);
    const [isFocused, setIsFocused] = useState(false);

    // Expose focus method to parent
    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    const handleImagePickPress = useCallback(() => {
      if (images.length >= maxImages) {
        showAlert(
          'Photo limit reached',
          `You can add up to ${formatCount(maxImages, 'photo')} per item.`
        );
        return;
      }
      onImagePick();
    }, [images.length, maxImages, onImagePick]);

    const handleFocus = useCallback(() => {
      setIsFocused(true);
      onFocus?.();
    }, [onFocus]);

    const handleBlur = useCallback(() => {
      setIsFocused(false);
    }, []);

    return (
      <View>
        <View style={styles.labelRow}>
          <Icon name="tag-outline" size={iconSize.sm} color={t.icon.secondary} />
          <Text style={styles.label}>Mark</Text>
          <Pressable
            onPress={handleImagePickPress}
            style={({ pressed }) => [styles.cameraButton, pressed && styles.cameraButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Add mark photo"
          >
            <Icon name="camera-outline" size={iconSize.md} color={t.brand.tint} />
          </Pressable>
        </View>

        <TextInput
          ref={inputRef}
          accessibilityLabel="Mark"
          style={[styles.input, isFocused && styles.inputFocused]}
          value={value}
          onChangeText={onChange}
          placeholder="For example MARK001"
          placeholderTextColor={t.text.placeholder}
          returnKeyType="done"
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={false}
          onFocus={handleFocus}
          onBlur={handleBlur}
          maxLength={60}
        />

        {/* Image Previews */}
        {images.length > 0 && (
          <View style={styles.imagePreviewRow}>
            {images.slice(0, maxImages).map((img, idx) => (
              <Pressable
                key={img.id}
                style={({ pressed }) => [styles.miniThumb, pressed && styles.thumbPressed]}
                onPress={() => onImageRemove(img.id)}
                accessibilityRole="button"
                accessibilityLabel={`Remove mark photo ${idx + 1}`}
              >
                <Image
                  source={{ uri: img.imageUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={150}
                />
                <View style={styles.removeBadge}>
                  <Icon name="close" size={iconSize.sm} color={t.overlay.onImage} />
                </View>
              </Pressable>
            ))}
            {images.length > maxImages && (
              <View style={styles.moreThumb}>
                <Text style={styles.moreText}>+{images.length - maxImages}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  }
);

// ============================================================================
// STYLES
// ============================================================================

const makeStyles = (t: ThemeTokens) => ({
  labelRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: 24,
    marginBottom: space.xs,
    gap: space.xs,
  },
  label: {
    ...typography.footnote,
    color: t.text.secondary,
  },
  cameraButton: {
    marginLeft: 'auto' as const,
    minWidth: touchTarget,
    minHeight: touchTarget,
    marginVertical: -(touchTarget - 24) / 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.pill,
  },
  cameraButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  input: {
    ...typography.body,
    backgroundColor: t.surface.field,
    borderWidth: 1,
    borderColor: t.border.field,
    borderRadius: radius.field,
    paddingHorizontal: space.md,
    minHeight: 44,
    color: t.text.primary,
    ...Platform.select({
      android: { textAlignVertical: 'center' as const, includeFontPadding: false },
      default: {},
    }),
  },
  inputFocused: {
    borderColor: t.border.fieldFocus,
    borderWidth: 2,
    paddingHorizontal: space.md - 1,
  },
  imagePreviewRow: {
    flexDirection: 'row' as const,
    marginTop: space.xs,
    gap: space.xs,
  },
  miniThumb: {
    width: 128,
    height: 128,
    borderRadius: radius.card,
    backgroundColor: t.surface.cardActive,
    overflow: 'hidden' as const,
  },
  thumbPressed: {
    opacity: 0.8,
  },
  removeBadge: {
    position: 'absolute' as const,
    top: space.xs,
    right: space.xs,
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: t.overlay.scrim,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  moreThumb: {
    width: 128,
    height: 128,
    borderRadius: radius.card,
    backgroundColor: t.surface.cardActive,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  moreText: {
    ...typography.headline,
    fontVariant: ['tabular-nums' as const],
    color: t.text.secondary,
  },
});

export default MarkImageField;
