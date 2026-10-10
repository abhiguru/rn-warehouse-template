jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

// Worklets 0.10 (Reanimated 4.5) installs native unpackers on import; use its
// published JS mock so Reanimated runs on the JS thread in tests.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

// Expo SDK 57 installs fetch as a lazy global. Resolve it now: otherwise Jest's
// environment teardown is the first to read it, which loads Expo's fetch module
// after the tests are done and fails the run with "Cannot log after tests are done".
void globalThis.fetch;

// Icons render as plain host elements in tests. Loading the real icon sets pulls in
// expo-font, which needs native modules. Individual tests may still override these.
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'MaterialCommunityIcons', Ionicons: 'Ionicons' }));
