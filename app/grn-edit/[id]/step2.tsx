import { useRef } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import GrnItemsStep, { type GrnItemsBackGuard } from '@/features/grn/screens/GrnItemsStep';
import { useBackHandler } from '@/hooks/useBackHandler';
import { useAppSelector } from '@/store/hooks';
import { selectGRNImported } from '@/store/slices/grnFormSlice';
import { grnRatesStepPath } from '@/features/grn/rates/paths';

export default function GRNEditStep2() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  // WH-180: an imported GRN's items cannot be changed; only its rates (step 3) open.
  const imported = useAppSelector(selectGRNImported);
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

  if (imported && id) return <Redirect href={grnRatesStepPath(String(id))} />;
  return <GrnItemsStep mode="edit" backGuard={backGuard} />;
}
