import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { EdgeToEdgeStatusBar } from '@/components/EdgeToEdgeStatusBar';
import {
  getEnrollmentStatus,
  getPendingEnrollmentToken,
  signOutPendingEnrollment,
} from '@/config/supabaseConfig';
import { useFioriColors } from '@/theme/fioriColors';
import { useTheme } from '@/hooks/useTheme';

type EnrollmentStatus = 'pending' | 'approved' | 'rejected' | 'disabled';

export default function PendingEnrollmentScreen() {
  const [status, setStatus] = useState<EnrollmentStatus>('pending');
  const [loading, setLoading] = useState(true);
  const FIORI = useFioriColors();
  const { isDarkMode } = useTheme();

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await getEnrollmentStatus();
    setLoading(false);
    if (result.success) {
      setStatus(result.status);
    } else {
      Alert.alert('Status Unavailable', result.error);
    }
  }, []);

  useEffect(() => {
    let active = true;
    getPendingEnrollmentToken().then(token => {
      if (!active) return;
      if (!token) router.replace('/login');
      else void refresh();
    }).catch(() => router.replace('/login'));
    return () => { active = false; };
  }, [refresh]);

  const leave = async () => {
    setLoading(true);
    try {
      await signOutPendingEnrollment();
      router.replace('/login');
    } catch {
      setLoading(false);
      Alert.alert('Could Not Sign Out', 'Please try again.');
    }
  };

  const message = status === 'approved'
    ? 'Your account is approved. Request a new verification code to sign in.'
    : status === 'rejected' || status === 'disabled'
      ? 'This account is unavailable. Contact your warehouse administrator.'
      : 'Your enrollment is awaiting administrator approval. Check again later.';

  return (
    <View style={[styles.container, { backgroundColor: FIORI.colors.background }]}>
      <EdgeToEdgeStatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <Text style={[styles.heading, { color: FIORI.colors.textPrimary }]}>Enrollment status</Text>
      <Text style={[styles.message, { color: FIORI.colors.textPrimary }]}>{message}</Text>
      {loading ? <ActivityIndicator accessibilityLabel="Checking enrollment status" /> : (
        <View style={styles.actions}>
          {status === 'pending' && <Button onPress={() => void refresh()}>Check status</Button>}
          {status === 'approved' ? (
            <Button onPress={() => void leave()}>Sign in</Button>
          ) : (
            <Button onPress={() => void leave()}>Sign out</Button>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 20 },
  heading: { fontSize: 28, fontWeight: '700' },
  message: { fontSize: 17, lineHeight: 25 },
  actions: { gap: 12 },
});
