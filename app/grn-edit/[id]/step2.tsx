import { useRef } from 'react';
import { useRouter } from 'expo-router';
import GrnItemsStep, { type GrnItemsBackGuard } from '@/features/grn/screens/GrnItemsStep';
import { useBackHandler } from '@/hooks/useBackHandler';

export default function GRNEditStep2() {
  const router = useRouter();
  // The step puts its guard here: it asks about an item that was not
  // checkmarked before it lets the Back key leave.
  const backGuard = useRef<GrnItemsBackGuard | null>(null);

  useBackHandler({
    onBackPress: () => {
      const leave = () => router.back();
      if (backGuard.current) {
        backGuard.current(leave);
      } else {
        leave();
      }
      return true;
    },
  });

  return <GrnItemsStep mode="edit" backGuard={backGuard} />;
}
