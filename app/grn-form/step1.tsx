import GrnHeaderStep from '@/features/grn/screens/GrnHeaderStep';

export default function GRNFormStep1() {
  // The Android Back key is handled by the step itself: with something entered
  // it asks before discarding, as the X in the header does (useFirstStepBack).
  return <GrnHeaderStep mode="create" />;
}
