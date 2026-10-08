/**
 * Customer Edit Step 2 Route
 *
 * Address & Tax Details step for customer editing.
 */

import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { CustomerDetailsStep } from '@/features/customer/screens/CustomerDetailsStep';

export default function CustomerEditStep2() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <CustomerDetailsStep mode="edit" customerId={id} />;
}
