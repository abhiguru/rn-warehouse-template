import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import theme from '@/theme';

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
const ANIMATION_DURATION = 300;

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
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Calculate progress percentage
  const progressPercentage = (currentStep / totalSteps) * 100;

  useEffect(() => {
    // Animate progress bar
    Animated.timing(progressAnim, {
      toValue: progressPercentage,
      duration: ANIMATION_DURATION,
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
    return `Next: Step ${currentStep + 1}`;
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

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: insets.bottom || theme.spacing.md,
        },
      ]}
    >
      {/* Progress Bar */}
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBarBackground} />
        <Animated.View
          style={[
            styles.progressBarFill,
            {
              width: progressWidth,
            },
          ]}
        />
      </View>

      {/* Navigation Buttons */}
      <View style={styles.buttonsContainer}>
        {showPreviousButton ? (
          <TouchableOpacity
            style={[
              styles.button,
              styles.previousButton,
              isLoading && styles.buttonDisabled,
            ]}
            onPress={handlePrevious}
            disabled={isLoading}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go to previous step"
            accessibilityState={{ disabled: isLoading }}
          >
            <Ionicons
              name="chevron-back"
              size={20}
              color={theme.colors.gray[700]}
              style={styles.buttonIcon}
            />
            <Text style={styles.previousButtonText}>Previous</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.buttonSpacer} />
        )}

        <TouchableOpacity
          style={[
            styles.button,
            styles.nextButton,
            !showPreviousButton && styles.nextButtonFullWidth,
            (nextDisabled || isLoading) && styles.buttonDisabled,
          ]}
          onPress={handleNext}
          disabled={nextDisabled || isLoading}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={isLoading ? 'Creating GRN' : getNextLabel()}
          accessibilityState={{ disabled: nextDisabled || isLoading, busy: isLoading }}
        >
          {isLoading ? (
            <>
              <ActivityIndicator size="small" color={theme.colors.white} />
              <Text style={styles.nextButtonText}>Creating...</Text>
            </>
          ) : (
            <>
              <Text style={styles.nextButtonText}>{getNextLabel()}</Text>
              {currentStep < totalSteps ? (
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={theme.colors.white}
                  style={styles.buttonIcon}
                />
              ) : (
                <Ionicons
                  name="checkmark"
                  size={20}
                  color={theme.colors.white}
                  style={styles.buttonIcon}
                />
              )}
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(249, 250, 251, 0.98)', // Semi-transparent white
    borderTopWidth: 1,
    borderTopColor: theme.colors.gray[200],
    paddingTop: theme.spacing.xs,
    paddingHorizontal: theme.spacing.lg,
    ...Platform.select({
      ios: {
        shadowColor: theme.colors.black,
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  progressBarContainer: {
    height: PROGRESS_BAR_HEIGHT,
    width: '100%',
    position: 'relative',
    marginBottom: theme.spacing.md,
    borderRadius: PROGRESS_BAR_HEIGHT / 2,
    overflow: 'hidden',
  },
  progressBarBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.gray[200],
    borderRadius: PROGRESS_BAR_HEIGHT / 2,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: PROGRESS_BAR_HEIGHT / 2,
  },
  buttonsContainer: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    minHeight: 48, // Android touch target
    gap: theme.spacing.xs,
  },
  previousButton: {
    flex: 1,
    backgroundColor: theme.colors.gray[100],
    borderWidth: 1,
    borderColor: theme.colors.gray[300],
  },
  previousButtonText: {
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    color: theme.colors.gray[700],
  },
  nextButton: {
    flex: 2,
    backgroundColor: theme.colors.primary,
  },
  nextButtonFullWidth: {
    flex: 1,
  },
  nextButtonText: {
    fontSize: theme.fontSize.base,
    fontWeight: '600',
    color: theme.colors.white,
    letterSpacing: 0.3,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonSpacer: {
    flex: 0,
  },
  buttonIcon: {
    marginHorizontal: -4, // Tighten spacing
  },
});
