import React from 'react';

// Stands in for expo-router's Stack.Screen in tests: draws what the screen puts in the stack header
// (title, then the buttons at its end), so a test can read and tap them as the person would.
type HeaderOptions = {
  headerLeft?: () => React.ReactNode;
  headerTitle?: () => React.ReactNode;
  headerRight?: () => React.ReactNode;
};

export function StackScreenMock({ options }: { options?: HeaderOptions }) {
  return (
    <>
      {options?.headerLeft?.()}
      {options?.headerTitle?.()}
      {options?.headerRight?.()}
    </>
  );
}
