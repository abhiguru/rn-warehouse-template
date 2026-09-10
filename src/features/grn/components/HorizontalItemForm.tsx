import React, { useRef, useCallback, useMemo, useImperativeHandle, forwardRef, useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    Dimensions,
    ScrollView,
    TouchableOpacity,
    Keyboard,
    Platform,
    Vibration,
    Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { RemoteAutocompleteInput } from '@/components/RemoteAutocompleteInput';
import theme from '@/theme';
import { useListColors } from '@/hooks/useListColors';
import { GRNImageData } from '@/store/slices/grnFormSlice';
import { getSupabaseClient } from '@/config/supabaseConfig';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const FIELD_WIDTH = 180; // Base width for fields
const FIELD_WIDTH_LARGE = 220; // Width for item name field
const FIELD_WIDTH_QTY_WEIGHT = 117; // Qty & Weight reduced by 35% (was 180)
const FIELD_WIDTH_RACK = 196; // Rack reduced by 30% (was 280), chips will wrap
const FIELD_WIDTH_MARK = 270; // 50% wider mark field
const INPUT_HEIGHT = 48; // Uniform height for all inputs

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

        // Theme colors for dark mode support
        const colors = useListColors();

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

        return (
            <View style={[styles.container, { backgroundColor: colors.gray50 }]}>
                {/* Hero Banner - Compact */}
                <View style={[styles.heroBanner, { backgroundColor: colors.primary }, isEditing && { backgroundColor: colors.gray400 }]}>
                    <TouchableOpacity
                        style={styles.heroContent}
                        onPress={() => savedItemsCount > 0 && onViewAll?.()}
                        activeOpacity={savedItemsCount > 0 ? 0.7 : 1}
                    >
                        <Text style={styles.heroTitle}>
                            {isEditing
                                ? `Editing Item ${editingItemNumber}`
                                : savedItemsCount === 0
                                    ? 'Adding Item 1'
                                    : `Adding Item ${savedItemsCount + 1}`}
                        </Text>
                        {currentItem.packaging && (
                            <View style={styles.packagingBadge}>
                                <Icon name="package-variant-closed" size={14} color="#FFFFFF" />
                                <Text style={styles.packagingText}>{currentItem.packaging}</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.saveButton, !isValid && styles.saveButtonDisabled]}
                        onPress={onSaveItem}
                        disabled={!isValid}
                        activeOpacity={0.7}
                    >
                        <Icon name="check" size={24} color="#FFFFFF" />
                    </TouchableOpacity>
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
                            <Icon name="package-variant" size={16} color={colors.primary} />
                            <Text style={[styles.label, { color: colors.textSecondary }]}>ITEM<Text style={[styles.required, { color: colors.error }]}> *</Text></Text>
                        </View>
                        <RemoteAutocompleteInput<{ id: string; name: string; packaging?: string }>
                            value={currentItem.item_name}
                            placeholder="Type to search..."
                            fetchData={async (query) => {
                                try {
                                    console.log('[ItemAutocomplete] Starting search for:', query);
                                    const supabase = getSupabaseClient();
                                    console.log('[ItemAutocomplete] Using RPC: search_items_autocomplete');

                                    const { data, error } = await supabase.rpc('search_items_autocomplete', {
                                        p_search_query: query,
                                        p_active_only: true,
                                        p_limit: 20
                                    });

                                    console.log('[ItemAutocomplete] RPC result:', {
                                        success: !error,
                                        errorCode: error?.code,
                                        errorMessage: error?.message,
                                        dataCount: data?.items?.length || 0,
                                        hasItems: !!data?.items
                                    });

                                    if (error) {
                                        console.error('[ItemAutocomplete] RPC error:', error);
                                        throw error;
                                    }

                                    if (!data || !data.items) {
                                        console.log('[ItemAutocomplete] No items in response');
                                        return [];
                                    }

                                    const mappedData = data.items.map((item: any) => ({
                                        id: item.id,
                                        name: item.name,
                                        packaging: item.packaging || ''
                                    }));

                                    console.log('[ItemAutocomplete] Returning mapped data:', {
                                        count: mappedData.length,
                                        firstItem: mappedData[0]
                                    });

                                    return mappedData;
                                } catch (e) {
                                    console.error('[ItemAutocomplete] Search failed:', e);
                                    return [];
                                }
                            }}
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
                                    <Text style={[styles.dropdownText, { color: colors.textPrimary }]}>{item.name}</Text>
                                    {item.packaging && (
                                        <Text style={[styles.dropdownText, { fontSize: 12, color: colors.textSecondary }]}>
                                            {item.packaging}
                                        </Text>
                                    )}
                                </View>
                            )}
                            keyExtractor={(item) => item.id}
                            zIndex={3000}
                        />
                        {currentItem.errors.item_table_id && (
                            <Text style={[styles.errorText, { color: colors.error }]}>{currentItem.errors.item_table_id}</Text>
                        )}
                    </View>

                    {/* Field 2: Quantity */}
                    <View style={[styles.fieldContainer, { width: FIELD_WIDTH_QTY_WEIGHT }]}>
                        <View style={styles.labelRow}>
                            <Icon name="counter" size={16} color={colors.primary} />
                            <Text style={[styles.label, { color: colors.textSecondary }]}>QTY<Text style={[styles.required, { color: colors.error }]}> *</Text></Text>
                            {isQtyLocked && (
                                <Icon name="lock" size={14} color={colors.warning} style={{ marginLeft: 4 }} />
                            )}
                        </View>
                        <TextInput
                            ref={qtyInputRef}
                            style={[
                                styles.input,
                                { backgroundColor: colors.cellBackground, borderColor: colors.gray200, color: colors.textPrimary },
                                currentItem.errors.qty && { borderColor: colors.error, borderWidth: 2 },
                                isQtyLocked && { backgroundColor: colors.gray100, color: colors.textSecondary },
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
                            placeholderTextColor={colors.textTertiary}
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
                        {currentItem.errors.qty && (
                            <Text style={[styles.errorText, { color: colors.error }]}>{currentItem.errors.qty}</Text>
                        )}
                    </View>

                    {/* Field 3: Weight */}
                    <View style={[styles.fieldContainer, { width: FIELD_WIDTH_QTY_WEIGHT }]}>
                        <View style={styles.labelRow}>
                            <Icon name="scale" size={16} color={colors.textTertiary} />
                            <Text style={[styles.label, { color: colors.textSecondary }]}>WEIGHT (KG)</Text>
                        </View>
                        <TextInput
                            ref={weightInputRef}
                            style={[
                                styles.input,
                                { backgroundColor: colors.cellBackground, borderColor: colors.gray200, color: colors.textPrimary },
                                currentItem.errors.weight && { borderColor: colors.error, borderWidth: 2 },
                                focusedField === 'weight' && styles.inputFocused,
                            ]}
                            value={currentItem.weight}
                            onChangeText={(text) => onFieldChange('weight', text)}
                            placeholder="0"
                            placeholderTextColor={colors.textTertiary}
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
                    </View>

                    {/* Field 4: Rack with Floor/Chamber Chips */}
                    <View style={[styles.fieldContainer, { width: FIELD_WIDTH_RACK }]}>
                        <View style={styles.labelRow}>
                            <Icon name="warehouse" size={16} color={colors.textTertiary} />
                            <Text style={[styles.label, { color: colors.textSecondary }]}>RACK</Text>
                            {fullRackValue && (
                                <Text style={[styles.rackPreviewInline, { color: colors.primary }]}>({fullRackValue})</Text>
                            )}
                        </View>
                        <TextInput
                            ref={rackInputRef}
                            style={[
                                styles.rackInput,
                                { backgroundColor: colors.cellBackground, borderColor: colors.gray200, color: colors.textPrimary },
                                currentItem.errors.rack && { borderColor: colors.error, borderWidth: 2 },
                                focusedField === 'rack' && styles.inputFocused,
                            ]}
                            value={rackTextOnly}
                            onChangeText={handleRackTextChange}
                            placeholder="e.g., 20B-20C"
                            placeholderTextColor={colors.textTertiary}
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
                            <Text style={[styles.chipLabel, { color: colors.textSecondary }]}>FLOOR</Text>
                            <View style={styles.chipWrap}>
                                {FLOOR_OPTIONS.map((floor) => (
                                    <TouchableOpacity
                                        key={floor}
                                        style={[
                                            styles.chip,
                                            { backgroundColor: colors.gray100, borderColor: colors.gray200 },
                                            selectedFloor === floor && { backgroundColor: colors.primary, borderColor: colors.primary },
                                        ]}
                                        onPress={() => handleFloorSelect(floor)}
                                        activeOpacity={0.7}
                                    >
                                        {selectedFloor === floor && (
                                            <Icon name="check" size={12} color="#FFFFFF" style={styles.chipCheckmark} />
                                        )}
                                        <Text style={[
                                            styles.chipText,
                                            { color: colors.textSecondary },
                                            selectedFloor === floor && styles.chipTextSelected,
                                        ]}>
                                            {floor}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Chamber Chips */}
                        <View style={styles.chipSection}>
                            <Text style={[styles.chipLabel, { color: colors.textSecondary }]}>CHAMBER</Text>
                            <View style={styles.chipWrap}>
                                {CHAMBER_OPTIONS.map((chamber) => (
                                    <TouchableOpacity
                                        key={chamber}
                                        style={[
                                            styles.chip,
                                            { backgroundColor: colors.gray100, borderColor: colors.gray200 },
                                            selectedChamber === chamber && { backgroundColor: colors.primary, borderColor: colors.primary },
                                        ]}
                                        onPress={() => handleChamberSelect(chamber)}
                                        activeOpacity={0.7}
                                    >
                                        {selectedChamber === chamber && (
                                            <Icon name="check" size={12} color="#FFFFFF" style={styles.chipCheckmark} />
                                        )}
                                        <Text style={[
                                            styles.chipText,
                                            { color: colors.textSecondary },
                                            selectedChamber === chamber && styles.chipTextSelected,
                                        ]}>
                                            {chamber}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {currentItem.errors.rack && (
                            <Text style={[styles.errorText, { color: colors.error }]}>{currentItem.errors.rack}</Text>
                        )}
                    </View>

                    {/* Field 5: Package Mark + Image Upload */}
                    <View style={[styles.fieldContainer, { width: FIELD_WIDTH_MARK }]}>
                        <View style={styles.labelRow}>
                            <Icon name="tag" size={16} color={colors.textTertiary} />
                            <Text style={[styles.label, { color: colors.textSecondary }]}>MARK</Text>
                            <TouchableOpacity
                                onPress={() => {
                                    if ((currentItem.trl_images?.length || 0) >= 2) {
                                        Alert.alert('Limit Reached', 'Maximum 2 images allowed per item.');
                                        return;
                                    }
                                    onImagePick();
                                }}
                                style={{ marginLeft: theme.spacing.sm }}
                                activeOpacity={0.7}
                            >
                                <Icon name="camera" size={20} color={colors.primary} />
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            ref={packageMarkInputRef}
                            style={[
                                styles.input,
                                { backgroundColor: colors.cellBackground, borderColor: colors.gray200, color: colors.textPrimary },
                                focusedField === 'package_mark' && styles.inputFocused,
                            ]}
                            value={currentItem.package_mark}
                            onChangeText={(text) => onFieldChange('package_mark', text)}
                            placeholder="MARK001"
                            placeholderTextColor={colors.textTertiary}
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
                        {(currentItem.trl_images?.length || 0) > 0 && (
                            <View style={styles.imagePreviewRow}>
                                {currentItem.trl_images.slice(0, 2).map((img, idx) => (
                                    <TouchableOpacity
                                        key={img.id}
                                        style={[styles.miniThumb, { backgroundColor: colors.gray200 }]}
                                        onPress={() => onImageRemove(img.id)}
                                    >
                                        <Image
                                            source={{ uri: img.imageUrl }}
                                            style={StyleSheet.absoluteFill}
                                            contentFit="cover"
                                            cachePolicy="memory-disk"
                                            transition={150}
                                        />
                                        <View style={{ position: 'absolute', top: -4, right: -4, backgroundColor: colors.cellBackground, borderRadius: 8 }}>
                                            <Icon name="close-circle" size={16} color={colors.error} />
                                        </View>
                                    </TouchableOpacity>
                                ))}
                                {currentItem.trl_images.length > 2 && (
                                    <View style={[styles.moreThumb, { backgroundColor: colors.gray300 }]}>
                                        <Text style={[styles.moreText, { color: colors.gray600 }]}>+{currentItem.trl_images.length - 2}</Text>
                                    </View>
                                )}
                            </View>
                        )}
                    </View>




                </ScrollView>

                {/* Scroll hint gradient */}
                <View style={[styles.scrollHintRight, { backgroundColor: colors.cellBackground }]} pointerEvents="none">
                    <Icon name="chevron-right" size={20} color={colors.gray400} />
                </View>
            </View>
        );
    });

// SAP Fiori Form Cell Styles (Layout only - colors applied inline)
const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    heroBanner: {
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 56,
    },
    heroContent: {
        flex: 1,
    },
    heroTitle: {
        fontSize: theme.fontSize.lg,
        fontWeight: theme.fontWeight.semibold,
        color: '#FFFFFF',
    },
    packagingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        opacity: 0.9,
    },
    packagingText: {
        fontSize: theme.fontSize.xs,
        color: '#FFFFFF',
        marginLeft: 4,
    },
    saveButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveButtonDisabled: {
        opacity: 0.3,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        alignItems: 'flex-start',
    },
    fieldContainer: {
        marginRight: theme.spacing.md,
    },
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
        gap: 4,
    },
    label: {
        fontSize: 13,
        fontWeight: '400',
        letterSpacing: 0.5,
        lineHeight: 18,
    },
    required: {},
    input: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        height: 44,
        fontSize: theme.fontSize.base,
        ...Platform.select({
            android: {
                textAlignVertical: 'center',
                includeFontPadding: false,
            },
        }),
    },
    inputFocused: {
        borderColor: '#0057D2',
        ...Platform.select({
            ios: {
                borderWidth: 2,
            },
            android: {
                borderWidth: 1,
            },
        }),
    },
    dropdownText: {
        fontSize: theme.fontSize.sm,
    },
    errorText: {
        fontSize: 13,
        marginTop: 4,
        lineHeight: 18,
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
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    moreThumb: {
        width: 128,
        height: 128,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    moreText: {
        fontSize: 10,
        fontWeight: theme.fontWeight.bold,
    },
    scrollHintRight: {
        position: 'absolute',
        right: 0,
        top: '50%',
        marginTop: 20,
        borderTopLeftRadius: 12,
        borderBottomLeftRadius: 12,
        padding: 4,
        ...theme.shadows.sm,
    },
    rackInput: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        height: 44,
        fontSize: theme.fontSize.base,
        ...Platform.select({
            android: {
                textAlignVertical: 'center',
                includeFontPadding: false,
            },
        }),
    },
    chipSection: {
        marginTop: theme.spacing.xs,
    },
    chipLabel: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.5,
        marginBottom: 4,
        lineHeight: 16,
    },
    chipWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 32,
        paddingHorizontal: 12,
        borderRadius: 16,
        borderWidth: 1,
        minWidth: 44,
    },
    chipCheckmark: {
        marginRight: 4,
    },
    chipText: {
        fontSize: 13,
        fontWeight: '500',
    },
    chipTextSelected: {
        color: '#FFFFFF',
        fontWeight: '600',
    },
    rackPreviewInline: {
        fontSize: 12,
        fontWeight: theme.fontWeight.semibold,
        marginLeft: 4,
    },
});

export default HorizontalItemForm;
