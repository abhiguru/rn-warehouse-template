import GrnItemsStep from '@/features/grn/screens/GrnItemsStep';
import { useBackHandler } from '@/hooks/useBackHandler';

export default function GRNFormStep2() {
  // I11: Handle Android back button - go to previous step
  useBackHandler({
    currentStep: 2,
    totalSteps: 3,
    stepBasePath: '/grn-form/step',
    exitRoute: '/(tabs)/grn',
  });

  return <GrnItemsStep mode="create" />;
}
