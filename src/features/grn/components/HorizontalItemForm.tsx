import React, { useRef, useCallback, useMemo, useImperativeHandle, forwardRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  Keyboard,
  Platform,
  Vibration,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { RemoteAutocompleteInput } from '@/components/RemoteAutocompleteInput';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { GRNImageData } from '@/store/slices/grnFormSlice';
import { searchItems } from '@/services/item-search-service';

import { showAlert } from '@/utils/alert';
const FIELD_WIDTH_LARGE = 220; // Width for item name field
const FIELD_WIDTH_QTY_WEIGHT = 117; // Qty & Weight reduced by 35% (was 180)
const FIELD_WIDTH_RACK = 196; // Rack reduced by 30% (was 280), chips will wrap
const FIELD_WIDTH_MARK = 270; // 50% wider mark field

// Floor and Chamber options
const FLOOR_OPTIONS = ['BASE', 'F1', 'F2', 'F3', 'F4'];
const CHAMBER_OPTIONS = ['C4', 'C7', 'C2', 'Anti-Ch'];

// Parse rack value to extract user input, floor, and chamber
const parseRackValue = (rack: string): { userInput: string; floor: string; chamber: string } => {
    if (!rack || rack.trim() === '') {
        return { userInput: '', floor: '', chamber: '' };
    }
    const parts = rack.split('/');

    // Check for full format: userInput/floor/chamber (at least 3 parts)
    if (parts.length >= 3) {
        const chamber = parts[parts.length - 1];
        const floor = parts[parts.length - 2];
        const userInput = parts.slice(0, parts.length - 2).join('/');
        if (FLOOR_OPTIONS.includes(floor) && CHAMBER_OPTIONS.includes(chamber)) {
            return { userInput, floor, chamber };
        }
    }

    // Check for floor/chamber only format (exactly 2 parts: floor/chamber)
    if (parts.length === 2) {
        const firstPart = parts[0];
        const secondPart = parts[1];

        // Check if it's floor/chamber format (no userInput)
        if (FLOOR_OPTIONS.includes(firstPart) && CHAMBER_OPTIONS.includes(secondPart)) {
            return { userInput: '', floor: firstPart, chamber: secondPart };
        }

        // Check if last part is just floor (userInput/floor)
        if (FLOOR_OPTIONS.includes(secondPart)) {
            return { userInput: firstPart, floor: secondPart, chamber: '' };
        }

        // Check if last part is just chamber (userInput/chamber)
        if (CHAMBER_OPTIONS.includes(secondPart)) {
            return { userInput: firstPart, floor: '', chamber: secondPart };
        }
    }

    // No floor/chamber detected - entire value is userInput
    return { userInput: rack, floor: '', chamber: '' };
};

// Build rack value from parts
// Format: userInput/floor/chamber OR floor/chamber (when userInput is empty)
// IMPORTANT: Only include floor/chamber suffix when BOTH are selected (minimum valid combination)
const buildRackValue = (userInput: string, floor: string, chamber: string): string => {
    const trimmedInput = userInput.trim();

    // Full format with all three parts (rack text + floor + chamber)
    if (trimmedInput && floor && chamber) {
        return `${trimmedInput}/${floor}/${chamber}`;
    }
    // Floor and chamber only (no rack text) - minimum valid combination
    if (floor && chamber) {
        return `${floor}/${chamber}`;
    }
    // Return just the rack text if provided (floor/chamber not complete yet)
    // This prevents partial selections from being saved and parsed incorrectly
    return trimmedInput;
};

export interface ItemFormData {
    grn_trl_id: string;
    item_table_id: string;
    item_name: string;
    packaging: string;
    qty: string;
    weight: string;
    rack: string;
    package_mark: string;
    trl_images: GRNImageData[];
    errors: Record<string, string>;
}

// Ref handle exposed to parent
export interface HorizontalItemFormRef {
    focusQty: () => void;
    resetScroll: () => void;
}

interface HorizontalItemFormProps {
    currentItem: ItemFormData;
    onFieldChange: (field: keyof ItemFormData, value: string) => void;

    onImagePick: () => void;
    onImageRemove: (imageId: string) => void;
    onSaveItem: () => void;
    onViewAll?: () => void;
    isQtyLocked?: boolean;
    onQtyLockedPress?: () => void;
    isValid: boolean;
    isEditing: boolean;
    editingItemNumber: number;
    savedItemsCount: number;
}

export const HorizontalItemForm = forwardRef<HorizontalItemFormRef, HorizontalItemFormProps>(
    function HorizontalItemFormInner(props, ref) {
        const {
            currentItem,
            onFieldChange,
            onImagePick,
            onImageRemove,
            onSaveItem,
            onViewAll,
            isQtyLocked,
            onQtyLockedPress,
            isValid,
            isEditing,
            editingItemNumber,
            savedItemsCount,
        } = props;

        const styles = useThemedStyles(makeStyles);
        const t = useTokens();

        const scrollRef = useRef<ScrollView>(null);
        const qtyInputRef = useRef<TextInput>(null);
        const weightInputRef = useRef<TextInput>(null);
        const rackInputRef = useRef<TextInput>(null);
        const packageMarkInputRef = useRef<TextInput>(null);

        // Scroll to keep focused field visible
        const scrollToField = useCallback((offset: number) => {
            scrollRef.current?.scrollTo({ x: offset, animated: true });
        }, []);

        // Expose methods to parent via ref
        useImperativeHandle(ref, () => ({
            focusQty: () => {
                setTimeout(() => {
                    qtyInputRef.current?.focus();
                    scrollToField(FIELD_WIDTH_LARGE);
                }, 100);
            },
            resetScroll: () => {
                scrollRef.current?.scrollTo({ x: 0, animated: true });
            },
        }), [scrollToField]);

        // Focus chain for keyboard navigation
        const focusNext = useCallback((current: 'qty' | 'weight' | 'rack' | 'package_mark') => {
            const chain = {
                qty: weightInputRef,
                weight: rackInputRef,
                rack: packageMarkInputRef,
                package_mark: null, // Last field
            };
            const next = chain[current];
            if (next?.current) {
                next.current.focus();
            } else if (current === 'package_mark' && isValid) {
                // Save on last field submit
                onSaveItem();
            }
        }, [isValid, onSaveItem]);



        // Local state for floor and chamber selection (separate from rack text)
        const [selectedFloor, setSelectedFloor] = useState<string>('');
        const [selectedChamber, setSelectedChamber] = useState<string>('');
        // Fiori: Track focused field for blue border
        const [focusedField, setFocusedField] = useState<string | null>(null);

        // Parse rack value on mount/change to extract floor/chamber
        useEffect(() => {
            const parsed = parseRackValue(currentItem.rack);
            if (parsed.floor && parsed.floor !== selectedFloor) {
                setSelectedFloor(parsed.floor);
            }
            if (parsed.chamber && parsed.chamber !== selectedChamber) {
                setSelectedChamber(parsed.chamber);
            }
        }, [currentItem.rack]);

        // Get just the rack text part (without floor/chamber)
        const rackTextOnly = useMemo(() => {
            const parsed = parseRackValue(currentItem.rack);
            return parsed.userInput;
        }, [currentItem.rack]);

        const fullRackValue = useMemo(() => (
            buildRackValue(rackTextOnly, selectedFloor, selectedChamber)
        ), [rackTextOnly, selectedFloor, selectedChamber]);

        // Handle rack text input change (only the rack number part)
        const handleRackTextChange = useCallback((text: string) => {
            // Combine with current floor/chamber selections
            const combined = buildRackValue(text, selectedFloor, selectedChamber);
            onFieldChange('rack', combined || text);
        }, [selectedFloor, selectedChamber, onFieldChange]);

        // Handle floor chip selection (radio-style)
        const handleFloorSelect = useCallback((floor: string) => {
            setSelectedFloor(floor);
            // Update the combined rack value
            const combined = buildRackValue(rackTextOnly, floor, selectedChamber);
            onFieldChange('rack', combined || rackTextOnly);
            Vibration.vibrate(5);
        }, [rackTextOnly, selectedChamber, onFieldChange]);

        // Handle chamber chip selection (radio-style)
        const handleChamberSelect = useCallback((chamber: string) => {
            setSelectedChamber(chamber);
            // Update the combined rack value
            const combined = buildRackValue(rackTextOnly, selectedFloor, chamber);
            onFieldChange('rack', combined || rackTextOnly);
            Vibration.vibrate(5);
        }, [rackTextOnly, selectedFloor, onFieldChange]);

        const imageCount = currentItem.trl_images?.length || 0;
        const canViewAll = savedItemsCount > 0 && !!onViewAll;
        const itemNumber = isEditing ? editingItemNumber : savedItemsCount + 1;

        const renderError = (message?: string) =>
            message ? (
                <View style={styles.errorRow} accessibilityLiveRegion="polite">
                    <Icon name="alert-circle" size={iconSize.sm} color={t.status.negative.text} />
                    <Text style={styles.errorText}>{message}</Text>
                </View>
            ) : null;

        const renderChip = (option: string, selected: boolean, onPress: () => void, group: string) => (
            <Pressable
                key={option}
                style={({ pressed }) => [
                    styles.chip,
                    selected && styles.chipSelected,
                    pressed && !selected && styles.chipPressed,
                ]}
                onPress={onPress}
                hitSlop={{ top: space.s6, bottom: space.s6 }}
                accessibilityRole="radio"
                accessibilityLabel={`${group} ${option}`}
                accessibilityState={{ selected, checked: selected }}
            >
                {selected && (
                    <Icon name="check" size={iconSize.sm} color={t.brand.tint} style={styles.chipCheckmark} />
                )}
                <Text style={[styles.chipText, selected && styles.chipTextSelected]} maxFontSizeMultiplier={1.6}>
                    {option}
                </Text>
            </Pressable>
        );

        return (
            <View style={styles.container}>
                {/* Hero header: the item being added or edited (surface.card, guide 13.8) */}
                <View style={styles.heroBanner}>
                    <Pressable
                        style={({ pressed }) => [styles.heroContent, canViewAll && pressed && styles.heroContentPressed]}
                        onPress={() => canViewAll && onViewAll?.()}
                        disabled={!canViewAll}
                        accessibilityRole={canViewAll ? 'button' : 'header'}
                        accessibilityLabel={
                            canViewAll
                                ? `${isEditing ? 'Editing' : 'New'} item ${itemNumber}. View ${savedItemsCount} saved ${savedItemsCount === 1 ? 'item' : 'items'}`
                                : `${isEditing ? 'Editing' : 'New'} item ${itemNumber}`
                        }
                    >
                        <Text style={styles.heroOverline}>{isEditing ? 'Editing item' : 'New item'}</Text>
                        <View style={styles.heroTitleRow}>
                            <Text style={styles.heroTitle}>Item {itemNumber}</Text>
                            {canViewAll && (
                                <View style={styles.viewAll}>
                                    <Text style={styles.viewAllText}>{savedItemsCount} saved</Text>
                                    <Icon name="chevron-right" size={iconSize.sm} color={t.brand.tint} />
                                </View>
                            )}
                        </View>
                        {!!currentItem.packaging && (
                            <View style={styles.packagingBadge}>
                                <Icon name="package-variant-closed" size={iconSize.sm} color={t.icon.secondary} />
                                <Text style={styles.packagingText}>{currentItem.packaging}</Text>
                            </View>
                        )}
                    </Pressable>
                    <Pressable
                        style={({ pressed }) => [
                            styles.saveButton,
                            pressed && styles.saveButtonPressed,
                            !isValid && styles.saveButtonDisabled,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Save receipt item"
                        accessibilityState={{ disabled: !isValid }}
                        onPress={onSaveItem}
                        disabled={!isValid}
                    >
                        <Icon name="check" size={iconSize.lg} color={t.brand.onFill} />
                    </Pressable>
                </View>

                {/* Horizontal Scrolling Form */}
                <ScrollView
                    ref={scrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="always"
                    keyboardDismissMode="none"
                    contentContainerStyle={styles.scrollContent}
                    style={styles.scrollView}
                >
                    {/* Field 1: Item Name (Dropdown Picker) */}
                    <View style={[styles.fieldContainer, { width: FIELD_WIDTH_LARGE, zIndex: 1000 }]}>
                        <View style={styles.labelRow}>
                            <Icon name="cube-outline" size={iconSize.sm} color={t.icon.secondary} />
                            <Text style={styles.label}>Item<Text style={styles.required}> *</Text></Text>
                        </View>
                        <RemoteAutocompleteInput<{ id: string; name: string; packaging?: string }>
                            value={currentItem.item_name}
                            placeholder="Search items"
                            fetchData={searchItems}
                            suggestionPlacement="inline"
                            getItemAccessibilityLabel={(item) => `Select receipt item ${item.name}`}
                            onSelect={(item) => {
                                if (item) {
                                    onFieldChange('item_table_id', item.id);
                                    onFieldChange('item_name', item.name);
                                    onFieldChange('packaging', item.packaging || '');
                                    // Focus Qty
                                    setTimeout(() => {
                                        qtyInputRef.current?.focus();
                                        scrollToField(FIELD_WIDTH_LARGE);
                                    }, 100);
                                } else {
                                    // Clear
                                    onFieldChange('item_table_id', '');
                                    onFieldChange('item_name', '');
                                    onFieldChange('packaging', '');
                                }
                            }}
                            renderItem={(item) => (
                                <View>
                                    <Text style={styles.dropdownText}>{item.name}</Text>
                                    {!!item.packaging && (
                                        <Text style={styles.dropdownSubtext}>{item.packaging}</Text>
                                    )}
                                </View>
                            )}
                            keyExtractor={(item) => item.id}
                            zIndex={3000}
                        />
                        {renderError(currentItem.errors.item_table_id)}
                    </View>

                    {/* Field 2: Quantity */}
                    <View style={[styles.fieldContainer, { width: FIELD_WIDTH_QTY_WEIGHT }]}>
                        <View style={styles.labelRow}>
                            <Text style={styles.label}>Quantity<Text style={styles.required}> *</Text></Text>
                            {isQtyLocked && (
                                <Icon
                                    name="lock-outline"
                                    size={iconSize.sm}
                                    color={t.icon.secondary}
                                    accessibilityLabel="Quantity locked"
                                />
                            )}
                        </View>
                        <TextInput
                            ref={qtyInputRef}
                            accessibilityLabel="Receipt item quantity"
                            accessibilityHint={isQtyLocked ? 'Locked because this item has dispatches' : undefined}
                            style={[
                                styles.input,
                                styles.numericInput,
                                !!currentItem.errors.qty && styles.inputError,
                                isQtyLocked && styles.inputReadOnly,
                                focusedField === 'qty' && !isQtyLocked && styles.inputFocused,
                            ]}
                            value={currentItem.qty}
                            onChangeText={(text) => {
                                if (isQtyLocked) {
                                    onQtyLockedPress?.();
                                    return;
                                }
                                onFieldChange('qty', text);
                            }}
                            placeholder="0"
                            placeholderTextColor={t.text.placeholder}
                            keyboardType="numeric"
                            returnKeyType="next"
                            onSubmitEditing={() => focusNext('qty')}
                            blurOnSubmit={false}
                            onFocus={() => {
                                if (isQtyLocked) {
                                    onQtyLockedPress?.();
                                    Keyboard.dismiss();
                                    return;
                                }
                                setFocusedField('qty');
                                scrollToField(FIELD_WIDTH_LARGE);
                            }}
                            onBlur={() => setFocusedField(null)}
                            selectTextOnFocus={!isQtyLocked}
                            editable={!isQtyLocked}
                        />
                        {renderError(currentItem.errors.qty)}
                    </View>

                    {/* Field 3: Weight */}
                    <View style={[styles.fieldContainer, { width: FIELD_WIDTH_QTY_WEIGHT }]}>
                        <View style={styles.labelRow}>
                            <Text style={styles.label}>Weight</Text>
                        </View>
                        <View
                            style={[
                                styles.input,
                                styles.suffixField,
                                !!currentItem.errors.weight && styles.inputError,
                                focusedField === 'weight' && styles.inputFocused,
                            ]}
                        >
                            <TextInput
                                ref={weightInputRef}
                                accessibilityLabel="Receipt item weight in kilograms"
                                style={[styles.suffixInput, styles.numericInput]}
                                value={currentItem.weight}
                                onChangeText={(text) => onFieldChange('weight', text)}
                                placeholder="0"
                                placeholderTextColor={t.text.placeholder}
                                keyboardType="numeric"
                                returnKeyType="next"
                                onSubmitEditing={() => focusNext('weight')}
                                blurOnSubmit={false}
                                onFocus={() => {
                                    setFocusedField('weight');
                                    scrollToField(FIELD_WIDTH_LARGE + FIELD_WIDTH_QTY_WEIGHT);
                                }}
                                onBlur={() => setFocusedField(null)}
                                selectTextOnFocus
                            />
                            <Text style={styles.suffix} importantForAccessibility="no">kg</Text>
                        </View>
                        {renderError(currentItem.errors.weight)}
                    </View>

                    {/* Field 4: Rack with Floor/Chamber Chips */}
                    <View style={[styles.fieldContainer, { width: FIELD_WIDTH_RACK }]}>
                        <View style={styles.labelRow}>
                            <Icon name="view-grid-outline" size={iconSize.sm} color={t.icon.secondary} />
                            <Text style={styles.label}>Rack</Text>
                            {!!fullRackValue && (
                                <Text style={styles.rackPreviewInline} numberOfLines={1}>{fullRackValue}</Text>
                            )}
                        </View>
                        <TextInput
                            ref={rackInputRef}
                            accessibilityLabel="Rack"
                            style={[
                                styles.input,
                                !!currentItem.errors.rack && styles.inputError,
                                focusedField === 'rack' && styles.inputFocused,
                            ]}
                            value={rackTextOnly}
                            onChangeText={handleRackTextChange}
                            placeholder="For example 20B-20C"
                            placeholderTextColor={t.text.placeholder}
                            returnKeyType="next"
                            onSubmitEditing={() => focusNext('rack')}
                            blurOnSubmit={false}
                            onFocus={() => {
                                setFocusedField('rack');
                                scrollToField(FIELD_WIDTH_LARGE + FIELD_WIDTH_QTY_WEIGHT * 2);
                            }}
                            onBlur={() => setFocusedField(null)}
                            autoCapitalize="characters"
                        />

                        {/* Floor Chips */}
                        <View style={styles.chipSection}>
                            <Text style={styles.chipLabel} accessibilityRole="header">Floor</Text>
                            <View style={styles.chipWrap} accessibilityRole="radiogroup">
                                {FLOOR_OPTIONS.map((floor) =>
                                    renderChip(floor, selectedFloor === floor, () => handleFloorSelect(floor), 'Floor')
                                )}
                            </View>
                        </View>

                        {/* Chamber Chips */}
                        <View style={styles.chipSection}>
                            <Text style={styles.chipLabel} accessibilityRole="header">Chamber</Text>
                            <View style={styles.chipWrap} accessibilityRole="radiogroup">
                                {CHAMBER_OPTIONS.map((chamber) =>
                                    renderChip(chamber, selectedChamber === chamber, () => handleChamberSelect(chamber), 'Chamber')
                                )}
                            </View>
                        </View>

                        {renderError(currentItem.errors.rack)}
                    </View>

                    {/* Field 5: Package Mark + Image Upload */}
                    <View style={[styles.fieldContainer, { width: FIELD_WIDTH_MARK }]}>
                        <View style={styles.labelRow}>
                            <Icon name="tag-outline" size={iconSize.sm} color={t.icon.secondary} />
                            <Text style={styles.label}>Mark</Text>
                            <Pressable
                                onPress={() => {
                                    if (imageCount >= 2) {
                                        showAlert('Photo limit reached', 'You can add up to 2 photos per item.');
                                        return;
                                    }
                                    onImagePick();
                                }}
                                style={({ pressed }) => [styles.cameraButton, pressed && styles.iconButtonPressed]}
                                accessibilityRole="button"
                                accessibilityLabel="Add mark photo"
                            >
                                <Icon name="camera-outline" size={iconSize.md} color={t.brand.tint} />
                            </Pressable>
                        </View>
                        <TextInput
                            ref={packageMarkInputRef}
                            accessibilityLabel="Mark"
                            style={[
                                styles.input,
                                focusedField === 'package_mark' && styles.inputFocused,
                            ]}
                            value={currentItem.package_mark}
                            onChangeText={(text) => onFieldChange('package_mark', text)}
                            placeholder="For example MARK001"
                            placeholderTextColor={t.text.placeholder}
                            returnKeyType="done"
                            onSubmitEditing={() => focusNext('package_mark')}
                            blurOnSubmit={false}
                            onFocus={() => {
                                setFocusedField('package_mark');
                                scrollToField(FIELD_WIDTH_LARGE + FIELD_WIDTH_QTY_WEIGHT * 2 + FIELD_WIDTH_RACK);
                            }}
                            onBlur={() => setFocusedField(null)}
                            maxLength={60}
                        />
                        {/* Image Previews */}
                        {imageCount > 0 && (
                            <View style={styles.imagePreviewRow}>
                                {currentItem.trl_images.slice(0, 2).map((img, idx) => (
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
                                {currentItem.trl_images.length > 2 && (
                                    <View style={styles.moreThumb}>
                                        <Text style={styles.moreText}>+{currentItem.trl_images.length - 2}</Text>
                                    </View>
                                )}
                            </View>
                        )}
                    </View>
                </ScrollView>

                {/* Scroll hint: more fields to the right */}
                <View style={styles.scrollHintRight} pointerEvents="none" importantForAccessibility="no-hide-descendants">
                    <Icon name="chevron-right" size={iconSize.md} color={t.icon.secondary} />
                </View>
            </View>
        );
    });

// SAP Fiori form cells (guide 13.2 and 13.3) on the item entry strip
const makeStyles = (t: ThemeTokens) => ({
    container: {
        flex: 1,
        backgroundColor: t.background.base,
    },
    heroBanner: {
        paddingHorizontal: space.lg,
        paddingVertical: space.sm,
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
        gap: space.md,
        minHeight: 56,
        backgroundColor: t.surface.card,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: t.border.divider,
    },
    heroContent: {
        flex: 1,
        borderRadius: radius.button,
    },
    heroContentPressed: {
        backgroundColor: t.surface.cardPressed,
    },
    heroOverline: {
        ...typography.footnote,
        color: t.text.secondary,
    },
    heroTitleRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        flexWrap: 'wrap' as const,
        gap: space.sm,
    },
    heroTitle: {
        ...typography.headline,
        color: t.text.primary,
    },
    viewAll: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
    },
    viewAllText: {
        ...typography.subhead,
        color: t.brand.tint,
    },
    packagingBadge: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        marginTop: space.xxs,
        gap: space.xs,
    },
    packagingText: {
        ...typography.footnote,
        color: t.text.secondary,
    },
    saveButton: {
        width: touchTarget,
        height: touchTarget,
        borderRadius: radius.pill,
        backgroundColor: t.brand.fill,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    saveButtonPressed: {
        backgroundColor: t.brand.fillPressed,
    },
    saveButtonDisabled: {
        opacity: t.interaction.disabledOpacity,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        alignItems: 'flex-start' as const,
    },
    fieldContainer: {
        marginRight: space.md,
    },
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
    required: {
        color: t.text.required,
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
            android: {
                textAlignVertical: 'center' as const,
                includeFontPadding: false,
            },
        }),
    },
    numericInput: {
        fontVariant: ['tabular-nums' as const],
    },
    inputFocused: {
        borderColor: t.border.fieldFocus,
        borderWidth: 2,
        paddingHorizontal: space.md - 1,
    },
    inputError: {
        borderColor: t.status.negative.border,
        borderWidth: 2,
        paddingHorizontal: space.md - 1,
    },
    inputReadOnly: {
        backgroundColor: t.surface.fieldReadOnly,
        borderWidth: 0,
        paddingHorizontal: space.md + 1,
    },
    suffixField: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
    },
    suffixInput: {
        ...typography.body,
        flex: 1,
        minHeight: 40,
        padding: 0,
        color: t.text.primary,
        ...Platform.select({
            android: {
                textAlignVertical: 'center' as const,
                includeFontPadding: false,
            },
        }),
    },
    suffix: {
        ...typography.body,
        color: t.text.secondary,
        marginLeft: space.xs,
    },
    dropdownText: {
        ...typography.body,
        color: t.text.primary,
    },
    dropdownSubtext: {
        ...typography.footnote,
        color: t.text.secondary,
    },
    errorRow: {
        flexDirection: 'row' as const,
        alignItems: 'flex-start' as const,
        gap: space.xs,
        marginTop: space.xs,
    },
    errorText: {
        ...typography.footnote,
        color: t.status.negative.text,
        flexShrink: 1,
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
    iconButtonPressed: {
        backgroundColor: t.brand.subtle,
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
        color: t.text.secondary,
        fontVariant: ['tabular-nums' as const],
    },
    scrollHintRight: {
        position: 'absolute' as const,
        right: 0,
        top: '50%' as const,
        marginTop: space.xl,
        borderTopLeftRadius: radius.card,
        borderBottomLeftRadius: radius.card,
        padding: space.xs,
        backgroundColor: t.surface.card,
        ...t.shadow[1],
    },
    chipSection: {
        marginTop: space.sm,
    },
    chipLabel: {
        ...typography.caption1,
        fontWeight: fontWeight.semibold,
        textTransform: 'uppercase' as const,
        letterSpacing: 0.5,
        color: t.text.secondary,
        marginBottom: space.xs,
    },
    chipWrap: {
        flexDirection: 'row' as const,
        flexWrap: 'wrap' as const,
        gap: space.sm,
    },
    chip: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        minHeight: 36,
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: t.border.button,
        backgroundColor: t.surface.card,
        minWidth: 44,
    },
    chipPressed: {
        backgroundColor: t.surface.cardPressed,
    },
    chipSelected: {
        backgroundColor: t.brand.subtle,
        borderColor: t.brand.tint,
    },
    chipCheckmark: {
        marginRight: space.xs,
    },
    chipText: {
        ...typography.caption1,
        fontWeight: fontWeight.medium,
        color: t.text.primary,
    },
    chipTextSelected: {
        color: t.brand.tint,
        fontWeight: fontWeight.semibold,
    },
    rackPreviewInline: {
        ...typography.footnote,
        fontWeight: fontWeight.semibold,
        color: t.text.primary,
        flexShrink: 1,
    },
});

export default HorizontalItemForm;
