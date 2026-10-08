export const isTemporaryGRNImageId = (id: string | undefined | null): boolean =>
  !id || id.startsWith('temp_') || id.startsWith('temp-');
