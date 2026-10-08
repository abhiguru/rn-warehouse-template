/**
 * Customer Edit Step 1 Route
 *
 * Basic Information step for customer editing.
 */

import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { CustomerBasicInfoStep } from '@/features/customer/screens/CustomerBasicInfoStep';

export default function CustomerEditStep1() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <CustomerBasicInfoStep mode="edit" customerId={id} />;
}
