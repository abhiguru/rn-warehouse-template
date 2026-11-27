/**
 * Holding list as a row of the Reports tab (WH-304, Design offline-capture.md 7.1). The registry gives every report the route
 * `/reports/<id>` and a screen file here; the root stack hides the header of every report because a report draws its own, so this
 * one turns it back on for the Holding list's own header.
 */
import React from 'react';
import { Stack } from 'expo-router';
import HoldingListScreen from '@/features/holding/HoldingListScreen';

export default function HoldingListReport() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true }} />
      <HoldingListScreen />
    </>
  );
}
