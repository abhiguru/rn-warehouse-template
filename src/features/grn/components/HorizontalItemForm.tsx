import React, { useRef, useCallback, useImperativeHandle, forwardRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  Keyboard,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { RemoteAutocompleteInput } from '@/components/RemoteAutocompleteInput';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, radius, space, touchTarget, typography, trackedText } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { GRNImageData } from '@/store/slices/grnFormSlice';
import { searchItems } from '@/services/item-search-service';
import { parseReceiptQuantity } from '@/features/grn/schemas/grnValidation';

import { showAlert } from '@/utils/alert';
import { formatNumber } from '@/utils/formatters';
import { normalizeDigits, t as tr, localizeDigits } from '@/i18n';

// The five fields of the row, in the order they are drawn, each with its width.
const FIELD_WIDTHS = {
    item: 220,
    qty: 117,
    // Wider than Quantity: "Weight each" has to stay on one line at font scale
    // 2.0, or the weight box drops below the quantity box.
    weight: 152,
    rack: 196, // the chips wrap
    package_mark: 270,
} as const;
type FieldName = keyof typeof FIELD_WIDTHS;
const FIELD_ORDER: readonly FieldName[] = ['item', 'qty', 'weight', 'rack', 'package_mark'];

/**
 * Where the row scrolls to when a field takes focus: the widths of the fields
 * before it. Worked out from the table above, so a width cannot change without
 * the offsets following it.
 */
const scrollOffsetOf = (field: FieldName): number =>
    FIELD_ORDER.slice(0, FIELD_ORDER.indexOf(field)).reduce((sum, name) => sum + FIELD_WIDTHS[name], 0);

// Floor and Chamber options
const FLOOR_OPTIONS = ['BASE', 'F1', 'F2', 'F3', 'F4'];
const CHAMBER_OPTIONS = ['C4', 'C7', 'C2', 'Anti-Ch'];

// A rack is free text. The floor and chamber chips are optional help: each
// chosen chip adds its own "/Floor" or "/Chamber" after the typed text, and a
// second tap takes it off again. The chips never take characters out of the
// text field.
//
// A rack is split into text and chips only when a line is put into the form
// (never while it is typed), and only when it ends in a floor and a chamber
// from the lists above; any other rack ("C3", "20B/F1", "A/1/2") is shown
// whole in the text field. Text plus chips always give the stored rack back,
// so a line that is opened and saved without a change keeps its rack.
const parseRackValue = (rack: string): { userInput: string; floor: string; chamber: string } => {
    if (!rack || rack.trim() === '') {
        return { userInput: '', floor: '', chamber: '' };
    }
    const parts = rack.split('/');
    if (parts.length >= 2) {
        const chamber = parts[parts.length - 1];
        const floor = parts[parts.length - 2];
        if (FLOOR_OPTIONS.includes(floor) && CHAMBER_OPTIONS.includes(chamber)) {
            return { userInput: parts.slice(0, parts.length - 2).join('/'), floor, chamber };
        }
    }
    return { userInput: rack, floor: '', chamber: '' };
};

// Build the rack from the typed text and the chosen chips: the text exactly as
// typed, then "/Floor" and "/Chamber" for the chips that are chosen. A chip
// shown as chosen is always part of the rack. Without a chip the text is
// passed on as typed (the items step drops the spaces at its ends when the
// line is saved); before a chip the spaces at its ends are dropped here, as
// they would otherwise be left in the middle of the rack ("ROW 3 /F1").
const buildRackValue = (userInput: string, floor: string, chamber: string): string => {
    const chips = [floor, chamber].filter(Boolean).join('/');
    if (userInput.trim() === '') return chips;
    return chips ? `${userInput.trim()}/${chips}` : userInput;
};

/** The rack of the line in the form: the text field, the chips, and the rack they make. */
interface RackEdit {
    lineId: string;
    rack: string;
    text: string;
    floor: string;
    chamber: string;
}

const loadRackEdit = (lineId: string, rack: string): RackEdit => {
    const parsed = parseRackValue(rack);
    return { lineId, rack, text: parsed.userInput, floor: parsed.floor, chamber: parsed.chamber };
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
                    scrollToField(scrollOffsetOf('qty'));
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



        // Fiori: Track focused field for blue border
        const [focusedField, setFocusedField] = useState<string | null>(null);

        // The text field and the chips are kept here while the line is in the
        // form. They are read from the rack only when a line is put into the
        // form: another line, or the same line with a rack this form did not
        // make (the items step put the saved line back). Reading them from the
        // rack at every key would move a typed "/F2/C2" out of the text field
        // and into the chips, and the next key would land in the wrong place.
        const lineRack = currentItem.rack ?? '';
        const [storedRackEdit, setRackEdit] = useState(() => loadRackEdit(currentItem.grn_trl_id, lineRack));
        let rackEdit = storedRackEdit;
        if (rackEdit.lineId !== currentItem.grn_trl_id || rackEdit.rack !== lineRack) {
            rackEdit = loadRackEdit(currentItem.grn_trl_id, lineRack);
            setRackEdit(rackEdit);
        }
        const { text: rackText, floor: selectedFloor, chamber: selectedChamber } = rackEdit;

        const changeRack = useCallback((text: string, floor: string, chamber: string) => {
            const rack = buildRackValue(text, floor, chamber);
            setRackEdit({ lineId: currentItem.grn_trl_id, rack, text, floor, chamber });
            onFieldChange('rack', rack);
        }, [currentItem.grn_trl_id, onFieldChange]);

        // The text field: whatever is typed is the text, character for character.
        const handleRackTextChange = useCallback((text: string) => {
            changeRack(text, selectedFloor, selectedChamber);
        }, [changeRack, selectedFloor, selectedChamber]);

        // A chip is chosen by a tap and taken off again by a second tap. The text is not touched.
        const handleFloorSelect = useCallback((floor: string) => {
            changeRack(rackText, floor === selectedFloor ? '' : floor, selectedChamber);
        }, [changeRack, rackText, selectedFloor, selectedChamber]);

        const handleChamberSelect = useCallback((chamber: string) => {
            changeRack(rackText, selectedFloor, chamber === selectedChamber ? '' : chamber);
        }, [changeRack, rackText, selectedFloor, selectedChamber]);

        const imageCount = currentItem.trl_images?.length || 0;
        const canViewAll = savedItemsCount > 0 && !!onViewAll;
        const itemNumber = isEditing ? editingItemNumber : savedItemsCount + 1;

        // The fixed strip names the line in the form: which item and how many of
        // what. Rack and Mark are a screen's width away from Item and Quantity,
        // so without it a correction made there is made blind.
        const itemName = currentItem.item_name?.trim() ?? '';
        const packaging = currentItem.packaging?.trim() ?? '';
        const typedQty = (currentItem.qty ?? '').trim();
        const parsedQty = parseReceiptQuantity(typedQty);
        // What is typed is shown even when it is not a quantity yet ("0", "12.5").
        const quantityText = parsedQty !== null ? formatNumber(parsedQty) : localizeDigits(typedQty);
        const quantityLine = quantityText && packaging
            ? tr('grn.item.quantityWithPackaging', { quantity: quantityText, packaging })
            : quantityText || packaging;
        const stripLabel = [
            tr(isEditing ? 'grn.item.a11yEditingItem' : 'grn.item.a11yNewItem', { number: itemNumber }),
            itemName,
            quantityText ? tr('grn.item.a11yQuantity', { quantity: quantityText }) : '',
            packaging,
            canViewAll ? tr('grn.item.a11yViewSaved', { count: savedItemsCount }) : '',
        ]
            .filter(Boolean)
            .join(', ');

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
                        accessibilityLabel={stripLabel}
                    >
                        {/* Line 1: new or correction, and the way to the saved items */}
                        <View style={styles.heroOverlineRow}>
                            <Text style={styles.heroOverline}>{isEditing ? tr('grn.item.editingItem') : tr('grn.item.newItem')}</Text>
                            {canViewAll && (
                                <View style={styles.viewAll}>
                                    <Text style={styles.viewAllText}>{tr('grn.item.savedCount', { count: savedItemsCount })}</Text>
                                    <Icon name="chevron-right" size={iconSize.sm} color={t.brand.tint} />
                                </View>
                            )}
                        </View>
                        {/* Line 2: the line's number and, once chosen, its item. A long name wraps, then ends in an ellipsis. */}
                        <Text style={styles.heroTitle} numberOfLines={3} ellipsizeMode="tail">
                            {itemName
                                ? tr('grn.item.itemNumberWithName', { number: itemNumber, name: itemName })
                                : tr('grn.item.itemNumber', { number: itemNumber })}
                        </Text>
                        {/* Line 3: how many of what, as typed so far. A value is never cut short. */}
                        {!!quantityLine && <Text style={styles.heroQuantity}>{quantityLine}</Text>}
                    </Pressable>
                    <Pressable
                        style={({ pressed }) => [
                            styles.saveButton,
                            pressed && styles.saveButtonPressed,
                            !isValid && styles.saveButtonDisabled,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={tr('grn.item.saveLabel')}
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
                    <View style={[styles.fieldContainer, { width: FIELD_WIDTHS.item, zIndex: 1000 }]}>
                        <View style={styles.labelRow}>
                            <Icon name="cube-outline" size={iconSize.sm} color={t.icon.secondary} />
                            <Text style={styles.label}>{tr('common.item')}<Text style={styles.required}> *</Text></Text>
                        </View>
                        <RemoteAutocompleteInput<{ id: string; name: string; packaging?: string }>
                            value={currentItem.item_name}
                            placeholder={tr('grn.item.searchPlaceholder')}
                            fetchData={searchItems}
                            suggestionPlacement="inline"
                            getItemAccessibilityLabel={(item) => tr('grn.item.selectItemLabel', { name: item.name })}
                            onSelect={(item) => {
                                if (item) {
                                    onFieldChange('item_table_id', item.id);
                                    onFieldChange('item_name', item.name);
                                    onFieldChange('packaging', item.packaging || '');
                                    // Focus Qty
                                    setTimeout(() => {
                                        qtyInputRef.current?.focus();
                                        scrollToField(scrollOffsetOf('qty'));
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
                    <View style={[styles.fieldContainer, { width: FIELD_WIDTHS.qty }]}>
                        <View style={styles.labelRow}>
                            <Text style={styles.label}>{tr('grn.item.quantity')}<Text style={styles.required}> *</Text></Text>
                            {isQtyLocked && (
                                <Icon
                                    name="lock-outline"
                                    size={iconSize.sm}
                                    color={t.icon.secondary}
                                    accessibilityLabel={tr('grn.item.quantityLocked')}
                                />
                            )}
                        </View>
                        <TextInput
                            ref={qtyInputRef}
                            accessibilityLabel={tr('grn.item.quantityInputLabel')}
                            accessibilityHint={isQtyLocked ? tr('grn.item.quantityLockedHint') : undefined}
                            style={[
                                styles.input,
                                styles.numericInput,
                                !!currentItem.errors.qty && styles.inputError,
                                isQtyLocked && styles.inputReadOnly,
                                focusedField === 'qty' && !isQtyLocked && styles.inputFocused,
                            ]}
                            value={localizeDigits(currentItem.qty ?? '')}
                            onChangeText={(text) => {
                                if (isQtyLocked) {
                                    onQtyLockedPress?.();
                                    return;
                                }
                                onFieldChange('qty', normalizeDigits(text));
                            }}
                            placeholder={formatNumber(0)}
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
                                scrollToField(scrollOffsetOf('qty'));
                            }}
                            onBlur={() => setFocusedField(null)}
                            selectTextOnFocus={!isQtyLocked}
                            editable={!isQtyLocked}
                        />
                        {renderError(currentItem.errors.qty)}
                    </View>

                    {/* Field 3: Weight of one bag, box or crate */}
                    <View style={[styles.fieldContainer, { width: FIELD_WIDTHS.weight }]}>
                        <View style={styles.labelRow}>
                            <Text style={styles.label}>{tr('common.weightEach')}</Text>
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
                                accessibilityLabel={tr('grn.item.weightInputLabel')}
                                style={[styles.suffixInput, styles.numericInput]}
                                value={localizeDigits(currentItem.weight ?? '')}
                                onChangeText={(text) => onFieldChange('weight', normalizeDigits(text))}
                                placeholder={formatNumber(0)}
                                placeholderTextColor={t.text.placeholder}
                                keyboardType="numeric"
                                returnKeyType="next"
                                onSubmitEditing={() => focusNext('weight')}
                                blurOnSubmit={false}
                                onFocus={() => {
                                    setFocusedField('weight');
                                    scrollToField(scrollOffsetOf('weight'));
                                }}
                                onBlur={() => setFocusedField(null)}
                                selectTextOnFocus
                            />
                            <Text style={styles.suffix} importantForAccessibility="no">{tr('grn.item.weightUnit')}</Text>
                        </View>
                        {renderError(currentItem.errors.weight)}
                    </View>

                    {/* Field 4: Rack with Floor/Chamber Chips */}
                    <View style={[styles.fieldContainer, { width: FIELD_WIDTHS.rack }]}>
                        <View style={styles.labelRow}>
                            <Icon name="view-grid-outline" size={iconSize.sm} color={t.icon.secondary} />
                            <Text style={styles.label}>{tr('common.rack')}</Text>
                            {/* The rack as it will be saved */}
                            {!!currentItem.rack?.trim() && (
                                <Text style={styles.rackPreviewInline} numberOfLines={1}>{currentItem.rack}</Text>
                            )}
                        </View>
                        <TextInput
                            ref={rackInputRef}
                            accessibilityLabel={tr('common.rack')}
                            style={[
                                styles.input,
                                !!currentItem.errors.rack && styles.inputError,
                                focusedField === 'rack' && styles.inputFocused,
                            ]}
                            value={rackText}
                            onChangeText={handleRackTextChange}
                            placeholder={tr('grn.form.forExample', { example: '20B-20C' })}
                            placeholderTextColor={t.text.placeholder}
                            returnKeyType="next"
                            onSubmitEditing={() => focusNext('rack')}
                            blurOnSubmit={false}
                            onFocus={() => {
                                setFocusedField('rack');
                                scrollToField(scrollOffsetOf('rack'));
                            }}
                            onBlur={() => setFocusedField(null)}
                            autoCapitalize="characters"
                        />

                        {/* Floor Chips */}
                        <View style={styles.chipSection}>
                            <Text style={styles.chipLabel} accessibilityRole="header">{tr('grn.item.floor')}</Text>
                            <View style={styles.chipWrap} accessibilityRole="radiogroup">
                                {FLOOR_OPTIONS.map((floor) =>
                                    renderChip(floor, selectedFloor === floor, () => handleFloorSelect(floor), tr('grn.item.floor'))
                                )}
                            </View>
                        </View>

                        {/* Chamber Chips */}
                        <View style={styles.chipSection}>
                            <Text style={styles.chipLabel} accessibilityRole="header">{tr('common.chamber')}</Text>
                            <View style={styles.chipWrap} accessibilityRole="radiogroup">
                                {CHAMBER_OPTIONS.map((chamber) =>
                                    renderChip(chamber, selectedChamber === chamber, () => handleChamberSelect(chamber), tr('common.chamber'))
                                )}
                            </View>
                        </View>

                        {renderError(currentItem.errors.rack)}
                    </View>

                    {/* Field 5: Package Mark + Image Upload */}
                    <View style={[styles.fieldContainer, { width: FIELD_WIDTHS.package_mark }]}>
                        <View style={styles.labelRow}>
                            <Icon name="tag-outline" size={iconSize.sm} color={t.icon.secondary} />
                            <Text style={styles.label}>{tr('grn.item.mark')}</Text>
                            <Pressable
                                onPress={() => {
                                    if (imageCount >= 2) {
                                        showAlert(tr('grn.photos.limitTitle'), tr('grn.photos.limitPerItem', { count: 2 }));
                                        return;
                                    }
                                    onImagePick();
                                }}
                                style={({ pressed }) => [styles.cameraButton, pressed && styles.iconButtonPressed]}
                                accessibilityRole="button"
                                accessibilityLabel={tr('grn.item.addMarkPhoto')}
                            >
                                <Icon name="camera-outline" size={iconSize.md} color={t.brand.tint} />
                            </Pressable>
                        </View>
                        <TextInput
                            ref={packageMarkInputRef}
                            accessibilityLabel={tr('grn.item.mark')}
                            style={[
                                styles.input,
                                focusedField === 'package_mark' && styles.inputFocused,
                            ]}
                            value={currentItem.package_mark}
                            onChangeText={(text) => onFieldChange('package_mark', text)}
                            placeholder={tr('grn.form.forExample', { example: 'MARK001' })}
                            placeholderTextColor={t.text.placeholder}
                            returnKeyType="done"
                            onSubmitEditing={() => focusNext('package_mark')}
                            blurOnSubmit={false}
                            onFocus={() => {
                                setFocusedField('package_mark');
                                scrollToField(scrollOffsetOf('package_mark'));
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
                                        accessibilityLabel={tr('grn.item.removeMarkPhoto', { position: idx + 1 })}
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
                                        <Text style={styles.moreText}>+{formatNumber(currentItem.trl_images.length - 2)}</Text>
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
    heroOverlineRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
        flexWrap: 'wrap' as const,
        columnGap: space.sm,
    },
    heroTitle: {
        ...typography.headline,
        color: t.text.primary,
    },
    heroQuantity: {
        ...typography.subhead,
        color: t.text.primary,
        fontVariant: ['tabular-nums' as const],
    },
    viewAll: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
    },
    viewAllText: {
        ...typography.subhead,
        color: t.brand.tint,
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
        letterSpacing: trackedText(0.5),
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
