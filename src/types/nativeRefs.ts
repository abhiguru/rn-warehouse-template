import type { Text, TextInput, ScrollView, View } from 'react-native';

/**
 * Instance types of React Native's core components, for `useRef`, `Ref` props and ref maps.
 *
 * Under React Native's strict TypeScript API (`npm run typecheck:strict`; the default in Expo SDK 58)
 * `TextInput`, `ScrollView` and the other core components are no longer classes, so `useRef<TextInput>`
 * does not type-check. `React.ComponentRef<typeof X>` is valid under both the legacy and the strict API.
 */
export type TextRef = React.ComponentRef<typeof Text>;
export type TextInputRef = React.ComponentRef<typeof TextInput>;
export type ScrollViewRef = React.ComponentRef<typeof ScrollView>;
export type ViewRef = React.ComponentRef<typeof View>;
