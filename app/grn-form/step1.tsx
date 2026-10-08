import GrnHeaderStep from '@/features/grn/screens/GrnHeaderStep';
import { useBackHandler } from '@/hooks/useBackHandler';

export default function GRNFormStep1() {
  // I11: Handle Android back button - on step 1, go back to GRN list
  useBackHandler({
    currentStep: 1,
    totalSteps: 3,
    stepBasePath: '/grn-form/step',
    exitRoute: '/(tabs)/grn',
  });

  return <GrnHeaderStep mode="create" />;
}
