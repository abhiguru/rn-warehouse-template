import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { useAppSelector } from '@/store/hooks';
import { useFioriColors } from '@/theme/fioriColors';
import {
  EnrollmentCustomer,
  PendingEnrollment,
  listEnrollmentCustomers,
  listPendingEnrollments,
  reviewEnrollment,
} from '@/services/enrollmentReviewService';

export default function EnrollmentReviewScreen() {
  const role = useAppSelector(state => state.auth.userProfile?.role);
  const FIORI = useFioriColors();
  const [pending, setPending] = useState<PendingEnrollment[]>([]);
  const [customers, setCustomers] = useState<EnrollmentCustomer[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (role !== 'admin') return;
    setBusy(true);
    setError(null);
    try {
      const [enrollments, available] = await Promise.all([
        listPendingEnrollments(), listEnrollmentCustomers(),
      ]);
      setPending(enrollments);
      setCustomers(available);
      setSelectedUser(current => {
        if (current && enrollments.some(item => item.id === current)) return current;
        setSelectedCustomers([]);
        return null;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load enrollments.');
    } finally { setBusy(false); }
  }, [role]);

  useEffect(() => {
    if (role === 'admin') void refresh();
  }, [role, refresh]);

  const decide = (decision: 'approved' | 'rejected') => {
    const profile = pending.find(item => item.id === selectedUser);
    if (!profile) return;
    if (decision === 'approved' && selectedCustomers.length === 0) {
      Alert.alert('Customer Required', 'Select at least one existing customer before approval.');
      return;
    }
    Alert.alert(
      decision === 'approved' ? 'Approve Enrollment' : 'Reject Enrollment',
      `${decision === 'approved' ? 'Approve' : 'Reject'} ${profile.display_name || profile.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: decision === 'approved' ? 'Approve' : 'Reject', style: decision === 'rejected' ? 'destructive' : 'default', onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              await reviewEnrollment(profile.id, decision, selectedCustomers);
              setSelectedUser(null);
              setSelectedCustomers([]);
              const [enrollments, available] = await Promise.all([listPendingEnrollments(), listEnrollmentCustomers()]);
              setPending(enrollments);
              setCustomers(available);
            } catch (cause) {
              Alert.alert('Review Failed', cause instanceof Error ? cause.message : 'Could not save the decision.');
            } finally { setBusy(false); }
          })();
        } },
      ]
    );
  };

  if (role !== 'admin') return <View style={styles.container}>
    <Text>Administrator access required.</Text>
    <Button onPress={() => router.replace('/settings')}>Back to settings</Button>
  </View>;

  return <ScrollView style={{ backgroundColor: FIORI.colors.background }} contentContainerStyle={styles.container}>
    <Stack.Screen options={{ title: 'Enrollment Review', headerShown: true }} />
    <Text style={[styles.title, { color: FIORI.colors.textPrimary }]}>Pending enrollments</Text>
    <Text style={{ color: FIORI.colors.textSecondary }}>Approve a verified phone only after choosing its customer access.</Text>
    <Button type="secondary" onPress={() => void refresh()} disabled={busy}>Refresh</Button>
    {busy && <ActivityIndicator />}
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!busy && pending.length === 0 && <Text>No pending enrollments.</Text>}
    {pending.map(profile => <Pressable key={profile.id} accessibilityRole="button"
      onPress={() => { setSelectedUser(profile.id); setSelectedCustomers([]); }}
      style={[styles.row, selectedUser === profile.id && styles.selected]}>
      <Text style={styles.name}>{profile.display_name || profile.name}</Text>
      <Text>{profile.mobile}</Text>
    </Pressable>)}
    {selectedUser && <View style={styles.section}>
      <Text style={styles.name}>Assign existing customers</Text>
      {customers.length === 0 && <Text>No active customers are available.</Text>}
      {customers.map(customer => {
        const checked = selectedCustomers.includes(customer.id);
        return <Pressable key={customer.id} accessibilityRole="checkbox" accessibilityState={{ checked }}
          onPress={() => setSelectedCustomers(ids => checked ? ids.filter(id => id !== customer.id) : [...ids, customer.id])}
          style={styles.row}>
          <Text>{checked ? '☑' : '☐'} {customer.name}</Text>
        </Pressable>;
      })}
      <Button onPress={() => decide('approved')} disabled={busy || selectedCustomers.length === 0}>Approve with assignment</Button>
      <Button type="secondary" onPress={() => decide('rejected')} disabled={busy}>Reject enrollment</Button>
    </View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 12, flexGrow: 1 },
  title: { fontSize: 26, fontWeight: '700' },
  section: { gap: 12, marginTop: 12 },
  row: { borderWidth: 1, borderColor: '#9aa', borderRadius: 8, padding: 14, gap: 4 },
  selected: { borderColor: '#0070a8', borderWidth: 2 },
  name: { fontSize: 17, fontWeight: '600' },
  error: { color: '#a00' },
});
