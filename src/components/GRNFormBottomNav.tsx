import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { iconSize, layout, motion, radius, space, touchTarget, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

export interface GRNFormBottomNavProps {
  currentStep: number;
  totalSteps: number;
  onPrevious?: () => void;
  onNext: () => void;
  nextLabel?: string; // Custom label like "Next: Items", "Create GRN"
  nextDisabled?: boolean;
  isLoading?: boolean;
  showPrevious?: boolean; // Default: true if onPrevious provided
}

const PROGRESS_BAR_HEIGHT = 4;

const makeStyles = (t: ThemeTokens) => ({
  container: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: t.surface.card,
    paddingTop: space.sm,
    paddingHorizontal: layout.marginCompact,
    ...t.shadow[3],
  },
  progressTrack: {
    height: PROGRESS_BAR_HEIGHT,
    width: '100%' as const,
    marginBottom: space.md,
    borderRadius: radius.pill,
    backgroundColor: t.brand.subtleStrong,
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%' as const,
    backgroundColor: t.brand.fill,
    borderRadius: radius.pill,
  },
  buttonsContainer: {
    flexDirection: 'row' as const,
    gap: space.sm,
    alignItems: 'center' as const,
  },
  button: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
    minHeight: Math.max(touchTarget, 48),
    gap: space.xs,
  },
  backButton: {
    flex: 1,
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
    flex: 2,
    backgroundColor: t.brand.fill,
  },
  nextButtonPressed: {
    backgroundColor: t.brand.fillPressed,
  },
  nextButtonFullWidth: {
    flex: 1,
  },
  nextButtonText: {
    ...typography.callout,
    color: t.brand.onFill,
  },
  buttonDisabled: {
    opacity: t.interaction.disabledOpacity,
  },
});

/**
 * Bottom bar of the GRN form flow: progress, Back (secondary) and Next or
 * Create (primary). Sits on surface.card with shadow[3] and adds the bottom inset.
 */
export default function GRNFormBottomNav({
  currentStep,
  totalSteps,
  onPrevious,
  onNext,
  nextLabel,
  nextDisabled = false,
  isLoading = false,
  showPrevious = true,
}: GRNFormBottomNavProps) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const t = useTokens();
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Calculate progress percentage
  const progressPercentage = (currentStep / totalSteps) * 100;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progressPercentage,
      duration: motion.standard,
      useNativeDriver: false,
    }).start();
  }, [progressPercentage, progressAnim]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  // Determine button label
  const getNextLabel = () => {
    if (nextLabel) return nextLabel;
    if (currentStep === totalSteps) return 'Create GRN';
    return `Next: step ${currentStep + 1}`;
  };

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

  const showPreviousButton = showPrevious && onPrevious && currentStep > 1;
  const isLastStep = currentStep >= totalSteps;

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
      <View
        style={styles.progressTrack}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Step ${currentStep} of ${totalSteps}`}
        accessibilityValue={{ min: 0, max: totalSteps, now: currentStep }}
      >
        <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
      </View>

      <View style={styles.buttonsContainer}>
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
            accessibilityLabel="Back to the previous step"
            accessibilityState={{ disabled: isLoading }}
          >
            <MaterialCommunityIcons name="chevron-left" size={iconSize.md} color={t.brand.tint} />
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.nextButton,
            !showPreviousButton && styles.nextButtonFullWidth,
            pressed && styles.nextButtonPressed,
            (nextDisabled || isLoading) && styles.buttonDisabled,
          ]}
          onPress={handleNext}
          disabled={nextDisabled || isLoading}
          accessibilityRole="button"
          accessibilityLabel={isLoading ? 'Creating GRN' : getNextLabel()}
          accessibilityState={{ disabled: nextDisabled || isLoading, busy: isLoading }}
        >
          {isLoading ? (
            <>
              <ActivityIndicator size="small" color={t.brand.onFill} />
              <Text style={styles.nextButtonText}>Creating GRN…</Text>
            </>
          ) : (
            <>
              <Text style={styles.nextButtonText}>{getNextLabel()}</Text>
              <MaterialCommunityIcons
                name={isLastStep ? 'check' : 'chevron-right'}
                size={iconSize.md}
                color={t.brand.onFill}
              />
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}
