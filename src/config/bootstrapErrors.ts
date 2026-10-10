import { BootstrapValidationError } from './bootstrapValidation';
import { t } from '@/i18n';

/**
 * The same failure with its message in the app's language. bootstrapValidation
 * names what was wrong by a code and cannot translate (it also runs in Node);
 * any other error is returned as it is.
 */
export function localizeBootstrapError(error: unknown): unknown {
  if (!(error instanceof BootstrapValidationError)) return error;
  const localized = new BootstrapValidationError(error.code, t(`errors.server.${error.code}`));
  localized.stack = error.stack;
  return localized;
}

/** Runs a bootstrapValidation check and rethrows its failure in the app's language. */
export function withLocalizedBootstrapErrors<T>(check: () => T): T {
  try {
    return check();
  } catch (error) {
    throw localizeBootstrapError(error);
  }
}
