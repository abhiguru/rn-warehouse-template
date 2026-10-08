/**
 * Defers loading the auth slice until after the Redux store has mounted.
 *
 * Keeping this import behind a function prevents the auth service/store import
 * cycle from running while the tabs route module is initialized.
 */
export const loadAuthSlice = () => import('./slices/authSlice');
