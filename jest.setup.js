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

// Icons render as plain host elements in tests. Loading the real icon sets pulls in
// expo-font, which needs native modules. Individual tests may still override these.
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'MaterialCommunityIcons', Ionicons: 'Ionicons' }));
