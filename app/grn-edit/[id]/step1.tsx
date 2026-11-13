import { Redirect, useLocalSearchParams } from 'expo-router';
import GrnHeaderStep from '@/features/grn/screens/GrnHeaderStep';
import { useAppSelector } from '@/store/hooks';
import { selectGRNImported } from '@/store/slices/grnFormSlice';
import { grnRatesStepPath } from '@/features/grn/rates/paths';

export default function GRNEditStep1() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // WH-180: an imported GRN's details cannot be changed; only its rates (step 3) open.
  const imported = useAppSelector(selectGRNImported);
  if (imported && id) return <Redirect href={grnRatesStepPath(String(id))} />;
  return <GrnHeaderStep mode="edit" />;
}
