import { getRouteInfoFromState } from 'expo-router/build/global-state/getRouteInfoFromState';
import { navigationRef } from 'expo-router/build/global-state/navigationRef';

// What the navigation tests read from the router: the container ref that ExpoRoot attaches, its
// root state and the route info (pathname) worked out from that state. Expo Router 58 no longer
// exports its `store`; this is the same three things from the modules that its own
// testing-library uses.
export const routerStore = {
  navigationRef,
  get state() {
    return navigationRef.getRootState();
  },
  getRouteInfo: () => getRouteInfoFromState(navigationRef.getRootState()),
};
