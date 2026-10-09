import React from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { fontWeight, iconSize, layout, radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

export interface WizardBottomBarProps {
  currentStep: number;
  totalSteps: number;
  /** Back to the previous step; the Back button shows from step 2 on. */
  onPrevious?: () => void;
  onNext: () => void;
  /** Primary label: "Next" by default, "Create GRN" on the last step. */
  nextLabel?: string;
  /** Primary label while busy, e.g. "Creating GRN…". */
  loadingLabel?: string;
  nextDisabled?: boolean;
  isLoading?: boolean;
  /** Default: true when onPrevious is provided. */
  showPrevious?: boolean;
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
 * the review step (primary). Sits on surface.card with shadow[3] and adds the
 * bottom inset. Render it below the step content, not over it.
 */
export default function WizardBottomBar({
  currentStep,
  totalSteps,
  onPrevious,
  onNext,
  nextLabel,
  loadingLabel = 'Saving…',
  nextDisabled = false,
  isLoading = false,
  showPrevious = true,
}: WizardBottomBarProps) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();

  const isLastStep = currentStep >= totalSteps;
  const label = nextLabel ?? (isLastStep ? 'Create GRN' : 'Next');

  const handlePrevious = () => {
    if (onPrevious && !isLoading) {
      onPrevious();
    }
  };

  const handleNext = () => {
    if (!nextDisabled && !isLoading) {
      onNext();
    }
  };

  const showPreviousButton = showPrevious && !!onPrevious && currentStep > 1;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + space.md }]}>
      {showPreviousButton && (
        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.backButton,
            pressed && styles.backButtonPressed,
            isLoading && styles.buttonDisabled,
          ]}
          onPress={handlePrevious}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel="Back"
          accessibilityState={{ disabled: isLoading }}
        >
          <Icon name="chevron-left" size={iconSize.md} color={t.brand.tint} />
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
      )}

      <Pressable
        style={({ pressed }) => [
          styles.button,
          styles.nextButton,
          pressed && styles.nextButtonPressed,
          (nextDisabled || isLoading) && styles.buttonDisabled,
        ]}
        onPress={handleNext}
        disabled={nextDisabled || isLoading}
        accessibilityRole="button"
        accessibilityLabel={isLoading ? loadingLabel : label}
        accessibilityState={{ disabled: nextDisabled || isLoading, busy: isLoading }}
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
    </View>
  );
}
