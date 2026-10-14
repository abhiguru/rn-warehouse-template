import { useRef } from 'react';
import { useRouter } from 'expo-router';
import GrnItemsStep, { type GrnItemsBackGuard } from '@/features/grn/screens/GrnItemsStep';
import { useBackHandler } from '@/hooks/useBackHandler';

export default function GRNFormStep2() {
  const router = useRouter();
  // The step puts its guard here: it asks about an item that was not
  // checkmarked before it lets the Back key leave.
  const backGuard = useRef<GrnItemsBackGuard | null>(null);

  // I11: Handle Android back button - go to previous step
  useBackHandler({
    onBackPress: () => {
      // To the step 1 already in the stack, not a second entry of it.
      const leave = () => router.dismissTo('/grn-form/step1');
      if (backGuard.current) {
        backGuard.current(leave);
      } else {
        leave();
      }
      return true;
    },
  });

  return <GrnItemsStep mode="create" backGuard={backGuard} />;
}
