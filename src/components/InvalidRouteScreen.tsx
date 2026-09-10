/**
 * Invalid Route Screen
 *
 * PR12 Fix: Displays error when route parameters are invalid.
 * Used with useValidatedRouteParams hook.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { router, Stack } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFioriColors } from '@/theme/fioriColors';

export interface InvalidRouteScreenProps {
  /** Error message to display */
  error?: string | null;
  /** Title for the screen */
  title?: string;
  /** Custom message below the title */
  message?: string;
  /** Whether to show a back button */
  showBackButton?: boolean;
  /** Custom back action (defaults to router.back()) */
  onBack?: () => void;
}

export function InvalidRouteScreen({
  error,
  title = 'Invalid Route',
  message = 'The requested page could not be found or the URL is invalid.',
  showBackButton = true,
  onBack,
}: InvalidRouteScreenProps) {
  const FIORI = useFioriColors();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Error',
          headerBackTitle: 'Back',
          headerShown: true,
        }}
      />
      <View style={[styles.container, { backgroundColor: FIORI.colors.backgroundGrouped }]}>
        <View style={styles.content}>
          <View style={[styles.iconContainer, { backgroundColor: FIORI.colors.warningLight }]}>
            <Icon
              name="alert-circle-outline"
              size={48}
              color={FIORI.colors.warning}
            />
          </View>

          <Text style={[styles.title, { color: FIORI.colors.textPrimary }]}>
            {title}
          </Text>

          <Text style={[styles.message, { color: FIORI.colors.textSecondary }]}>
            {message}
          </Text>

          {error && (
            <View style={[styles.errorBox, { backgroundColor: FIORI.colors.destructiveLight }]}>
              <Text style={[styles.errorText, { color: FIORI.colors.destructive }]}>
                {error}
              </Text>
            </View>
          )}

          {showBackButton && (
            <Pressable
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: FIORI.colors.tint },
                pressed && styles.buttonPressed,
              ]}
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Icon name="arrow-left" size={20} color="#FFFFFF" />
              <Text style={styles.buttonText}>Go Back</Text>
            </Pressable>
          )}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'center',
    maxWidth: 320,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 16,
  },
  errorBox: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 24,
    width: '100%',
  },
  errorText: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    paddingHorizontal: 24,
    borderRadius: 8,
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default InvalidRouteScreen;
