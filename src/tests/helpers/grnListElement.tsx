import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import GRNListFiori from '../../components/GRNListFiori';

// The list's rows use a GestureDetector, which needs a GestureHandlerRootView above it.
export const grnListElement = () => (
  <GestureHandlerRootView>
    <GRNListFiori />
  </GestureHandlerRootView>
);
