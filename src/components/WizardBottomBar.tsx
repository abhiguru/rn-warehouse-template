import React from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';
import { t as tr } from '@/i18n';
import { useTableLayout } from '@/components/common/DetailTable';

export interface WizardBottomBarProps {
  currentStep: number;
  totalSteps: number;
  /** Back to the previous step; the Back button shows from step 2 on. */
  onPrevious?: () => void | Promise<void>;
  onNext: () => void | Promise<void>;
  /** Primary label: "Next" by default, "Create GRN" on the last step. */
  nextLabel?: string;
  /** Spoken label of the primary button when it differs from what it shows; the label by default. */
  nextAccessibilityLabel?: string;
  /** Primary label while busy, e.g. "Creating GRN…". */
  loadingLabel?: string;
  nextDisabled?: boolean;
  isLoading?: boolean;
  /** Default: true when onPrevious is provided. */
  showPrevious?: boolean;
  /** Spoken label of the Back button; "Back" by default. Say where Back goes when that helps. */
  previousAccessibilityLabel?: string;
  previousTestID?: string;
  nextTestID?: string;
}

const makeStyles = (t: ThemeTokens) => ({
  // Same bar as the dispatch and invoice wizards (§13.8 form chrome, §14.3)
  container: {
    flexDirection: 'row' as const,
    gap: space.sm,
    paddingHorizontal: layout.marginCompact,
    paddingTop: space.md,
    backgroundColor: t.surface.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border.separator,
    ...t.shadow[3],
  },
  // From font scale 1.5 the buttons stack, the primary one on top (§11.4). Next is rendered first, so the drawing,
  // the reading order and the focus order agree.
  containerStacked: {
    flexDirection: 'column' as const,
  },
  buttonStacked: {
    flex: 0,
    alignSelf: 'stretch' as const,
  },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.button,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  backButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: t.border.button,
  },
  backButtonPressed: {
    backgroundColor: t.brand.subtle,
  },
  backButtonText: {
    ...typography.callout,
    color: t.brand.tint,
  },
  nextButton: {
    backgroundColor: t.brand.fill,
  },
  nextButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  nextButtonText: {
    ...typography.callout,
    fontWeight: fontWeight.semibold,
    color: t.brand.onFill,
  },
  buttonDisabled: {
    opacity: t.interaction.disabledOpacity,
  },
});

/**
 * Bottom bar of the GRN wizard: Back (secondary) and Next, or Create/Save on
 * the review step (primary). Sits on surface.card with shadow[3]. It adds the
 * bottom inset on iOS only: on Android the root stack already pads the screen by it. Render it below the step content, not over it.
 */
export default function WizardBottomBar({
  currentStep,
  totalSteps,
  onPrevious,
  onNext,
  nextLabel,
  nextAccessibilityLabel,
  loadingLabel: loadingLabelProp,
  nextDisabled = false,
  isLoading = false,
  showPrevious = true,
  previousAccessibilityLabel,
  previousTestID,
  nextTestID,
}: WizardBottomBarProps) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const { stacked } = useTableLayout();

  const isLastStep = currentStep >= totalSteps;
  const label = nextLabel ?? (isLastStep ? tr('components.wizard.createGrn') : tr('common.next'));
  const loadingLabel = loadingLabelProp ?? tr('common.saving');

  const handlePrevious = () => {
    if (onPrevious && !isLoading) {
      return onPrevious();
    }
  };

  // The step's own promise is handed back, so a caller (or a test) that presses Next can wait for it
  const handleNext = () => {
    if (!nextDisabled && !isLoading) {
      return onNext();
    }
  };

  const showPreviousButton = showPrevious && !!onPrevious && currentStep > 1;

  const backButton = showPreviousButton ? (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        styles.backButton,
        stacked && styles.buttonStacked,
        pressed && styles.backButtonPressed,
        isLoading && styles.buttonDisabled,
      ]}
      onPress={handlePrevious}
      disabled={isLoading}
      accessibilityRole="button"
      accessibilityLabel={previousAccessibilityLabel ?? tr('common.back')}
      accessibilityState={{ disabled: isLoading }}
      testID={previousTestID}
    >
      <Icon name="chevron-left" size={iconSize.md} color={t.brand.tint} />
      <Text style={styles.backButtonText}>{tr('common.back')}</Text>
    </Pressable>
  ) : null;
  const nextButton = (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        styles.nextButton,
        stacked && styles.buttonStacked,
        pressed && styles.nextButtonPressed,
        (nextDisabled || isLoading) && styles.buttonDisabled,
      ]}
      onPress={handleNext}
      disabled={nextDisabled || isLoading}
      accessibilityRole="button"
      accessibilityLabel={isLoading ? loadingLabel : nextAccessibilityLabel ?? label}
      accessibilityState={{ disabled: nextDisabled || isLoading, busy: isLoading }}
      testID={nextTestID}
    >
      {isLoading ? (
        <>
          <ActivityIndicator size="small" color={t.brand.onFill} />
          <Text style={styles.nextButtonText}>{loadingLabel}</Text>
        </>
      ) : (
        <>
          <Text style={styles.nextButtonText}>{label}</Text>
          {!isLastStep && <Icon name="chevron-right" size={iconSize.md} color={t.brand.onFill} />}
        </>
      )}
    </Pressable>
  );

  // Stacked, Next comes first: the drawing, the reading order and the focus order agree.
  return (
    <View style={[styles.container, stacked && styles.containerStacked, { paddingBottom: (Platform.OS === 'ios' ? insets.bottom : 0) + space.md }]}>
      {stacked ? (
        <>
          {nextButton}
          {backButton}
        </>
      ) : (
        <>
          {backButton}
          {nextButton}
        </>
      )}
    </View>
  );
}
