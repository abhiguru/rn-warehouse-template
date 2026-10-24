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
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'MaterialCommunityIcons', Ionicons: 'Ionicons' }));

// A report opened for a customer whose name the app does not hold asks the facility for it
// (lookUpCustomerName in src/features/reports/customerNames.ts) and shows no name until the
// answer comes; a name in the route is never shown. No test reaches a facility, so that one
// question has a stand-in by default. The screen tests open a customer by setting their
// stand-in route (`mockParams = { customerId, customerName }`), as a row tap would have left
// it: their stand-in facility therefore knows that customer by the name their route gives,
// knows nobody else, and answers at once. The rest of the module is the real code. A test of
// the names themselves takes the real question too:
// jest.unmock('@/features/reports/customerNames').
let mockForgetCustomerNames;
jest.mock('@/features/reports/customerNames', () => {
  const actual = jest.requireActual('@/features/reports/customerNames');
  mockForgetCustomerNames = actual.forgetCustomerNames;
  return {
    ...actual,
    lookUpCustomerName: id => {
      let route;
      try {
        route = require('expo-router').useLocalSearchParams();
      } catch {
        return;
      }
      if (route && route.customerId === id) actual.trustCustomerName(id, route.customerName);
    },
  };
});
// A name kept in one test would be shown at once in the next. Before a test, not after it: a
// test file's own afterEach, which takes its screens down, runs after one registered here.
beforeEach(() => mockForgetCustomerNames?.());
