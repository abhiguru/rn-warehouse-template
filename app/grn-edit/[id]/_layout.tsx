import React, { useEffect } from 'react';
import { Stack, useNavigation } from 'expo-router';

/**
 * GRN Edit Layout
 *
 * This layout ONLY handles navigation structure.
 * All data loading is handled by useGRNForm hook in the screen components.
 * This follows the "Hook-Only Architecture" pattern for form state management.
 */
export default function GRNEditLayout() {
  const navigation = useNavigation();

  // Ensure parent navigation has no header
  useEffect(() => {
    navigation.getParent()?.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="step1" options={{ headerShown: false }} />
      <Stack.Screen name="step2" options={{ headerShown: false }} />
      <Stack.Screen name="step3" options={{ headerShown: false }} />
    </Stack>
  );
}