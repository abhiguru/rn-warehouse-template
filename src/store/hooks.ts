import { useDispatch, useSelector, useStore, TypedUseSelectorHook } from 'react-redux';
import type { RootState, AppDispatch } from './index';

// Use throughout your app instead of plain `useDispatch` and `useSelector`
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
/** The store itself, to read the latest state inside a callback without subscribing to it. */
export const useAppStore = () => useStore<RootState>();

// Re-export form validation hooks
export {
  useFormValidation,
  useGRNFormValidation,
  useDispatchFormValidation,
  useInvoiceFormValidation,
} from './hooks/useFormValidation';