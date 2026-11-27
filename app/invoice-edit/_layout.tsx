import { Stack } from 'expo-router';
import { OfflineFormGate } from '@/features/phone-copy/components/OfflineFormGate';
import { t as tr } from '@/i18n';

export default function InvoiceEditLayout() {
  return (
    <OfflineFormGate title={tr('common.invoice')} testID="invoice-form-needs-connection">
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen
          name="[id]"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
    </OfflineFormGate>
  );
}
