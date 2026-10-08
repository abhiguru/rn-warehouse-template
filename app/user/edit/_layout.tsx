/**
 * User Edit Layout
 */
import { Stack } from 'expo-router';

export default function UserEditLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[userId]" />
    </Stack>
  );
}
