import { getStateFromPath } from 'expo-router/build/fork/getStateFromPath';

test('the actual Expo Router linking consumer handles Unicode and malformed queries', () => {
  const options = { screens: { stock: 'stock' } };
  const state = getStateFromPath('/stock?q=cold+store&name=%E0%A4%86', options);
  expect(state?.routes[0].params).toMatchObject({ q: 'cold store', name: 'आ' });
  expect(() => getStateFromPath('/stock?q=%E0%A4%A%FF', options)).not.toThrow();
});
