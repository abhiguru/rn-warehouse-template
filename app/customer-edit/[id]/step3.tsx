/**
 * Customer Edit Step 3 Route
 *
 * Documents & Review step for customer editing.
 */

import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { CustomerReviewStep } from '@/features/customer/screens/CustomerReviewStep';

export default function CustomerEditStep3() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <CustomerReviewStep mode="edit" customerId={id} />;
}
