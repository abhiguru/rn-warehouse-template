import GrnReviewStep from '@/features/grn/screens/GrnReviewStep';
import { useBackHandler } from '@/hooks/useBackHandler';

export default function GRNFormStep3() {
  // I11: Handle Android back button - go to previous step
  useBackHandler({
    currentStep: 3,
    totalSteps: 3,
    stepBasePath: '/grn-form/step',
    exitRoute: '/(tabs)/grn',
  });

  return <GrnReviewStep mode="create" />;
}
