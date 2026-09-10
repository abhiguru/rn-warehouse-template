import { useEffect } from 'react';
import { router } from 'expo-router';

export default function OrdersScreen() {
  // Redirect to main index since Orders is now the home screen
  useEffect(() => {
    router.replace('/');
  }, []);

  return null;
}