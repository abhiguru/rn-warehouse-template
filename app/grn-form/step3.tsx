import GrnReviewStep from '@/features/grn/screens/GrnReviewStep';
import { useBackHandler } from '@/hooks/useBackHandler';
import { useAppSelector } from '@/store/hooks';
import { selectGRNFormIsSaving } from '@/store/slices/grnFormSlice';

export default function GRNFormStep3() {
  // While the GRN is being created the Back key does nothing: leaving would reset the form under the save
  // (the review step sets the form's saving flag from Confirm until the answer is in).
  const saving = useAppSelector(selectGRNFormIsSaving);

  // I11: Handle Android back button - go to previous step
  useBackHandler({
    currentStep: 3,
    totalSteps: 3,
    stepBasePath: '/grn-form/step',
    exitRoute: '/(tabs)/grn',
    ...(saving ? { onBackPress: () => true } : {}),
  });

  return <GrnReviewStep mode="create" />;
}
