/** Edit customer: the one-page customer form, loaded by the route's id (G-02, G-14). */
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { CustomerForm } from '@/features/customer/CustomerForm';

export default function CustomerEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CustomerForm customerId={id} />;
}
