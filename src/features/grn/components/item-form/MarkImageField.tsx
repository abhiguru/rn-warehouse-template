/**
 * MarkImageField - Package mark input with image preview
 *
 * Extracted from HorizontalItemForm.tsx for better maintainability.
 *
 * @module features/grn/components/item-form/MarkImageField
 */

import React, { forwardRef, useImperativeHandle, useRef, useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import theme from '@/theme';
import { GRNImageData } from '@/store/slices/grnFormSlice';

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
    const inputRef = useRef<TextInput>(null);
    const [isFocused, setIsFocused] = useState(false);

    // Expose focus method to parent
    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    const handleImagePickPress = useCallback(() => {
      if (images.length >= maxImages) {
        Alert.alert('Limit Reached', `Maximum ${maxImages} images allowed per item.`);
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
      <View style={styles.container}>
        <View style={styles.labelRow}>
          <Icon name="tag" size={16} color={theme.colors.gray[500]} />
          <Text style={styles.label}>MARK</Text>
          <TouchableOpacity
            onPress={handleImagePickPress}
            style={styles.cameraButton}
            activeOpacity={0.7}
          >
            <Icon name="camera" size={20} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        <TextInput
          ref={inputRef}
          style={[styles.input, isFocused && styles.inputFocused]}
          value={value}
          onChangeText={onChange}
          placeholder="MARK001"
          placeholderTextColor={theme.colors.gray[400]}
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
            {images.slice(0, maxImages).map((img) => (
              <TouchableOpacity
                key={img.id}
                style={styles.miniThumb}
                onPress={() => onImageRemove(img.id)}
              >
                <Image
                  source={{ uri: img.imageUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={150}
                />
                <View style={styles.removeIconContainer}>
                  <Icon name="close-circle" size={16} color={theme.colors.semantic.error} />
                </View>
              </TouchableOpacity>
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

const styles = StyleSheet.create({
  container: {},
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '400',
    color: theme.colors.fiori.text.secondary,
    letterSpacing: 0.5,
    lineHeight: 18,
  },
  cameraButton: {
    marginLeft: theme.spacing.sm,
  },
  input: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.fiori.objectCell.divider,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: theme.fontSize.base,
    color: theme.colors.fiori.text.primary,
  },
  inputFocused: {
    borderColor: '#0057D2',
    borderWidth: 2,
  },
  imagePreviewRow: {
    flexDirection: 'row',
    marginTop: theme.spacing.xs,
    gap: 4,
  },
  miniThumb: {
    width: 128,
    height: 128,
    borderRadius: 12,
    backgroundColor: theme.colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  removeIconContainer: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: 'white',
    borderRadius: 8,
  },
  moreThumb: {
    width: 128,
    height: 128,
    borderRadius: 12,
    backgroundColor: theme.colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.gray[600],
  },
});

export default MarkImageField;
