# Code guide

How the app's TypeScript and React Native code is written: structure, types, components,
hooks, data, lists, platform APIs, accessibility mechanics, translation, errors, security,
tests and pull requests.

- **Scope.** All code under `app/` and `src/`, and the tests next to it.
- **Looks are not here.** Colour, type, spacing, layout, components to use, wording and the
  accessibility targets (contrast, touch size, what a screen reader says) belong to
  [STYLE_GUIDE.md](STYLE_GUIDE.md), the app's only style guide. This guide does not repeat it.
  Translation rules are in [I18N.md](I18N.md); this guide only points to them.
- **New and changed code.** Every rule applies to code you add or change. Existing code is
  not rewritten just to follow it; it comes into line when it is touched for other work.
  Tests are the exception: see CG-67.
- **Platform.** React Native 0.88 (New Architecture only), Expo SDK 58 with expo-router,
  React 19, TypeScript 6 (`strict`), ESLint 10 flat config (`eslint.config.mjs`), Jest 30
  with `jest-expo`.

Each rule is numbered `CG-n` and has: the rule, why, a Do / Don't, how it is enforced and
its source. "Enforced by" names an ESLint rule (marked "(proposed)" when it is not switched
on yet), a test, the type checker, or review. Rules a machine cannot check are reviewed with
the [checklist](#review-checklist) at the end.

## Contents

1. [Layout and imports](#1-layout-and-imports)
2. [TypeScript](#2-typescript)
3. [Components](#3-components)
4. [Hooks and effects](#4-hooks-and-effects)
5. [State and data](#5-state-and-data)
6. [Lists and performance](#6-lists-and-performance)
7. [New Architecture APIs](#7-new-architecture-apis)
8. [Accessibility mechanics](#8-accessibility-mechanics)
9. [Translation (i18n)](#9-translation-i18n)
10. [Errors and logging](#10-errors-and-logging)
11. [Security and secrets](#11-security-and-secrets)
12. [Tests](#12-tests)
13. [Git and pull requests](#13-git-and-pull-requests)
- [Review checklist](#review-checklist)
- [Proposed lint rules](#proposed-lint-rules)
- [Sources](#sources)

---

## 1. Layout and imports

### CG-1 Only routes live in `app/`

Every file under `app/` is a screen or a `_layout`. Components, hooks, services and helpers
live under `src/` (`src/components`, `src/features/<area>`, `src/hooks`, `src/services`,
`src/utils`).

**Why.** expo-router turns every file under `app/` into a route, so a helper placed there
becomes a screen anyone can open by URL.

```tsx
// Do: app/customers.tsx renders a screen built in src/
import { CustomerList } from '@/features/customer/CustomerList';

// Don't: app/customerHelpers.ts (this becomes the route /customerHelpers)
```

**Enforced by:** review. **Source:** [S12](#sources).

### CG-2 Import across folders with the `@/` alias

Use `@/…` for anything outside the current folder; `./` and `../` only within a feature.

**Why.** Paths stay valid when files move, and an import says where the code lives.

```ts
// Do
import { showAlert } from '@/utils/alert';
import { toLocalISODate } from '@/utils/formatters';
// Don't
import { showAlert } from '../../../utils/alert';
```

**Enforced by:** `no-restricted-imports` pattern `../../*` (proposed). **Source:** repo
(`tsconfig.json` paths, `babel.config.js`).

### CG-3 Import navigation from `expo-router`

Use `router`, `useRouter`, `useLocalSearchParams`, `Link`, `Stack` and `Tabs` from
`expo-router`, not the `@react-navigation/*` packages underneath.

**Why.** Expo SDK 58 reworked the router core; direct imports of the packages it wraps can
break on an upgrade. App code has none today.

```ts
// Do
import { router, useLocalSearchParams } from 'expo-router';
// Don't
import { useNavigation } from '@react-navigation/native';
```

**Enforced by:** `no-restricted-imports` pattern `@react-navigation/*` (proposed).
**Source:** [S11](#sources).

### CG-4 No deep imports from `react-native/Libraries`

Import from `'react-native'` only.

**Why.** Deep imports are private. They warn since 0.80 and are type errors under the
strict TypeScript API (`npm run typecheck:strict`, `tsconfig.strict.json`).

```ts
// Do
import { useWindowDimensions } from 'react-native';
// Don't
import useWindowDimensions from 'react-native/Libraries/Utilities/useWindowDimensions';
```

**Enforced by:** `typecheck:strict`; `no-restricted-imports` pattern
`react-native/Libraries/*` (proposed, app code only; existing test mocks stay).
**Source:** [S10](#sources), [S11](#sources).

### CG-5 One exported component per file, named after the file

A component file exports one main component in PascalCase and is named after it
(`OrderCard.tsx`). Small private helpers for that component may sit in the same file. Hooks
are `useX` in `useX.ts`.

**Why.** Code is found by its name; a file with many exported components hides them.

```tsx
// Do: src/components/lists/DispatchFlashList.tsx
export function DispatchFlashList(props: DispatchFlashListProps) { /* … */ }
// Don't: src/components/Lists.tsx exporting DispatchList, OrderList and GrnList
```

**Enforced by:** review. **Source:** [S23](#sources).

### CG-6 No unused code or imports

Delete unused variables, parameters, imports and exports. Prefix a parameter that must exist
but is not read with `_`.

**Why.** Dead code is read, maintained and trusted by the next person, and it hides bugs.

```ts
// Do
const getItemLayout = (_data: unknown, index: number) => ({ length: ROW, offset: ROW * index, index });
// Don't
import { useMemo } from 'react'; // never used
```

**Enforced by:** `@typescript-eslint/no-unused-vars` with `argsIgnorePattern: '^_'`
(proposed). **Source:** [S13](#sources).

### CG-7 Import only what you use; no new barrel files

Import a module directly. Do not add `index.ts` files that re-export a whole feature.

**Why.** Barrels pull whole feature trees into every importer, which grows the bundle and
slows start-up, and they make import cycles easy.

```ts
// Do
import { formatCurrency } from '@/utils/formatters';
// Don't: a new src/features/invoice/index.ts that re-exports every screen and service
```

**Enforced by:** review. **Source:** [S22](#sources).

---

## 2. TypeScript

### CG-8 Code passes `strict` and the strict React Native API

`npm run typecheck`, `npm run typecheck:tests` and `npm run typecheck:strict` pass. Do not
loosen `tsconfig*.json`, and do not add `// @ts-ignore`; use `// @ts-expect-error` with a
reason when it is truly needed.

**Why.** The type checker is the cheapest test the app has; the strict RN API becomes the
only API in a later release.

```ts
// Do
// @ts-expect-error: the library's type misses the `ref` prop (fixed in its next major)
// Don't
// @ts-ignore
```

**Enforced by:** `tsc` (CI); `@typescript-eslint/ban-ts-comment` (proposed, in
`recommendedTypeChecked`). **Source:** [S10](#sources), [S13](#sources).

### CG-9 No `any`; use `unknown` and narrow

**Why.** `any` switches type checking off for everything it touches.

```ts
// Do: src/utils/anyUuid.ts
export const isAnyUuid = (value: unknown): value is string =>
  typeof value === 'string' && ANY_UUID.test(value);
// Don't
const isAnyUuid = (value: any) => ANY_UUID.test(value);
```

**Enforced by:** `@typescript-eslint/no-explicit-any` (proposed). **Source:** [S13](#sources).

### CG-10 No non-null assertions (`!`)

Check for `null`/`undefined` and handle it.

**Why.** `!` tells the compiler a value exists without checking; the crash moves to run time.

```ts
// Do
const node = pickerRefs.current[first];
if (node) AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
// Don't
AccessibilityInfo.sendAccessibilityEvent(pickerRefs.current[first]!, 'focus');
```

**Enforced by:** `@typescript-eslint/no-non-null-assertion` (proposed). **Source:**
[S14](#sources).

### CG-11 Every promise is awaited, returned or handled

No floating promises, and no `async` function where a `void` callback is expected
(`onPress`, `useEffect`) without handling its rejection.

**Why.** An unhandled rejection fails silently in release and leaves the screen half done.

```tsx
// Do
onPress={() => { void save().catch(error => setError(failureText(error, null, tr('errors.grn.form.saveFailedTitle')))); }}
// Don't
onPress={async () => { await save(); }} // a rejection is lost
```

**Enforced by:** `@typescript-eslint/no-floating-promises`, `@typescript-eslint/no-misused-promises`
(proposed; type-aware). **Source:** [S13](#sources).

### CG-12 `switch` on a union is exhaustive

Handle every member, or end with a `default` that fails to compile when a member is added.

**Why.** A new status or role then shows up as a type error, not as a blank screen.

```ts
// Do
switch (load.state) {
  case 'loading': return <Spinner />;
  case 'failed': return <ErrorStateView onRetry={load.retry} />;
  case 'loaded': return <List data={load.data} />;
}
// Don't: a switch that silently ignores 'failed'
```

**Enforced by:** `@typescript-eslint/switch-exhaustiveness-check` (proposed). **Source:**
[S14](#sources).

### CG-13 `import type` for type-only imports

**Why.** The import disappears from the bundle and cannot create a runtime cycle.

```ts
// Do
import { Alert, type AlertButton } from 'react-native';
import type { ThemeTokens } from '@/theme/tokens';
// Don't
import { ThemeTokens } from '@/theme/tokens';
```

**Enforced by:** `@typescript-eslint/consistent-type-imports` (proposed). **Source:**
[S14](#sources).

### CG-14 Prefer `??` and `?.` over `||` and `&&` chains for missing values

**Why.** `||` also replaces `0`, `''` and `false`, which are real values (0 bags, an empty
note).

```ts
// Do
const bags = row.bags ?? 0;
// Don't
const bags = row.bags || 0; // fine here, wrong for a default of 1
```

**Enforced by:** `@typescript-eslint/prefer-nullish-coalescing`,
`@typescript-eslint/prefer-optional-chain` (proposed, in `stylisticTypeChecked`).
**Source:** [S13](#sources).

### CG-15 Props have a named type; no `React.FC`, no `defaultProps`

Declare `type XProps` or `interface XProps`, destructure with defaults in the parameter
list.

**Why.** Function components with typed parameters are what React 19 expects; `defaultProps`
on function components is gone.

```tsx
// Do
interface ChipProps { label: string; selected?: boolean }
export function Chip({ label, selected = false }: ChipProps) { /* … */ }
// Don't
export const Chip: React.FC<ChipProps> = props => { /* … */ };
Chip.defaultProps = { selected: false };
```

**Enforced by:** review. **Source:** [S3](#sources).

### CG-16 No deprecated APIs in new code

Do not add calls to anything marked `@deprecated` in the installed types (for example
`MutableRefObject`, `findNodeHandle`, `AccessibilityInfo.setAccessibilityFocus`,
`ImageBackground`).

**Why.** Deprecated APIs are removed in a later release, and the upgrade then breaks in many
places at once.

```ts
// Do
const timer = useRef<ReturnType<typeof setTimeout> | null>(null); // RefObject, writable in React 19
// Don't
const timer: React.MutableRefObject<number | null> = useRef(null);
```

**Enforced by:** `@typescript-eslint/no-deprecated` (proposed). **Source:** [S14](#sources),
[S11](#sources).

---

## 3. Components

### CG-17 Function components only

Write components as functions. The only class components are the error boundaries
(`src/components/ErrorBoundary.tsx`, `src/components/FeatureErrorBoundary.tsx`,
`src/components/list/ListErrorBoundary.tsx`), because React has no hook for
`getDerivedStateFromError` or `componentDidCatch`.

**Why.** Hooks, Strict Mode and the React Compiler are built for function components.

```tsx
// Do
export function SectionHeader({ title }: SectionHeaderProps) { /* … */ }
// Don't
export class SectionHeader extends React.Component<SectionHeaderProps> { /* … */ }
```

**Enforced by:** `no-restricted-syntax` on `ClassDeclaration[superClass]` outside the three
boundary files (proposed). **Source:** [S2](#sources), [S4](#sources).

### CG-18 Rendering is pure

Given the same props, state and context, a component returns the same output. During
render: no network calls, no writes to refs, module variables or props, no `Date.now()` or
`Math.random()` used for output, no state setters.

**Why.** React may render a component more than once (always twice in development), and the
Compiler relies on purity.

```tsx
// Do: derive while rendering
const total = items.reduce((sum, item) => sum + item.bags, 0);
// Don't
items.sort(byDate);          // mutates a prop
countRef.current += 1;       // writes a ref during render
```

**Enforced by:** `react-hooks/purity`, `react-hooks/immutability`, `react-hooks/refs`,
`react-hooks/globals`, `react-hooks/set-state-in-render` (proposed; plugin installed).
**Source:** [S2](#sources), [S5](#sources).

### CG-19 Define components at module level; never call one as a function

**Why.** A component defined inside another is a new type on every render, so its subtree
is unmounted and its state lost each time. Calling `Row()` instead of `<Row />` breaks the
rules of hooks.

```tsx
// Do
function Row({ item }: RowProps) { /* … */ }
export function List({ items }: ListProps) { return items.map(item => <Row key={item.id} item={item} />); }
// Don't
export function List({ items }: ListProps) {
  const Row = ({ item }: RowProps) => <Text>{item.name}</Text>; // new type each render
  return items.map(item => Row({ item }));                      // called as a function
}
```

**Enforced by:** `react-hooks/static-components` (proposed);
`react/no-unstable-nested-components` (proposed, new package). **Source:** [S2](#sources),
[S5](#sources).

### CG-20 New components take `ref` as a prop

React 19 passes `ref` as an ordinary prop. New components declare it in their props and do
not use `forwardRef`. Existing `forwardRef` components are not violations and change when
touched.

**Why.** Simpler types, no wrapper, and React plans to deprecate `forwardRef`.

```tsx
// Do
export function GhostTextInput({ ref, ...props }: GhostTextInputProps & { ref?: React.Ref<GhostTextInputHandle> }) {
  useImperativeHandle(ref, () => ({ focus }));
  // …
}
// Don't (in a new component)
export const GhostTextInput = forwardRef<GhostTextInputHandle, GhostTextInputProps>((props, ref) => { /* … */ });
```

**Enforced by:** review. **Source:** [S3](#sources).

### CG-21 New pressables use `Pressable`

New touchable elements use `Pressable` (or the shared `Button` and cells the style guide
names). `TouchableOpacity` is not deprecated, and its existing uses are not violations.

**Why.** `Pressable` is the current, configurable primitive; the `Touchable*` family is
frozen.

```tsx
// Do
<Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={label}>{/* … */}</Pressable>
// Don't (in new code)
<TouchableOpacity onPress={onOpen}>{/* … */}</TouchableOpacity>
```

**Enforced by:** review. **Source:** [S8](#sources).

### CG-22 Keys are stable ids, never the array index

**Why.** An index key gives a row the state of another row after an insert, delete or sort.

```tsx
// Do
{lots.map(lot => <LotRow key={lot.id} lot={lot} />)}
// Don't
{lots.map((lot, i) => <LotRow key={i} lot={lot} />)}
```

**Enforced by:** `react/no-array-index-key` (proposed, new package). **Source:**
[S23](#sources), [S6](#sources).

### CG-23 Boolean props are written bare

**Why.** One way to write them makes diffs and searches simple.

```tsx
// Do
<Input numeric disabled />
// Don't
<Input numeric={true} disabled={true} />
```

**Enforced by:** `react/jsx-boolean-value` (proposed, new package). **Source:**
[S23](#sources).

### CG-24 Keep components small and single-purpose

Split a component that mixes data loading, several states and a large tree into a container
hook (`useX`) and presentational parts. Keep list rows small.

**Why.** Small parts are easier to review, test and keep fast.

```tsx
// Do: src/components/OrderBusinessSheet.tsx mounts OpenOrderBusinessSheet only while open,
// so the read and its three states live in one small component.
// Don't: one 1,500-line screen with loading, editing, printing and dialogs inline
```

**Enforced by:** review. **Source:** [S6](#sources), [S22](#sources).

### CG-25 Render errors are caught by an error boundary

Wrap a screen area that can fail in `ListErrorBoundary`, `FeatureErrorBoundary` or the root
`ErrorBoundary`. Do not wrap JSX in `try/catch`.

**Why.** `try/catch` cannot catch errors thrown while a child renders; a boundary can, and
it reports them.

```tsx
// Do: app/(tabs)/grn.tsx
<ListErrorBoundary listName="GRN items">{/* … */}</ListErrorBoundary>
// Don't
try { return <GrnList />; } catch { return <ErrorText />; }
```

**Enforced by:** `react-hooks/error-boundaries` (proposed). **Source:** [S5](#sources).

---

## 4. Hooks and effects

### CG-26 Follow the rules of hooks

Call hooks at the top level of a component or of a `useX` function, before any early
return, never in a loop, condition or callback.

**Why.** React matches hook state by call order.

```tsx
// Do
const styles = useThemedStyles(makeStyles);
if (!visible) return null;
// Don't
if (!visible) return null;
const styles = useThemedStyles(makeStyles);
```

**Enforced by:** `react-hooks/rules-of-hooks` (proposed, error). **Source:** [S2](#sources).

### CG-27 Dependency arrays are complete

List every value from the component that an effect, `useMemo` or `useCallback` reads. Do not
silence the rule; if an effect runs too often, restructure it (move the value inside, use an
event handler, or keep the latest callback in a ref as `useLoadWithRetry` does).

**Why.** A missing dependency reads stale values; the bug shows only after the next change.

```ts
// Do: src/hooks/useLoadWithRetry.ts keeps the caller's latest function in a ref
const latestLoad = useRef(load);
useEffect(() => { latestLoad.current = load; });
// Don't
useEffect(() => { load(customerId); }, []); // eslint-disable-line react-hooks/exhaustive-deps
```

**Enforced by:** `react-hooks/exhaustive-deps` (proposed). **Source:** [S2](#sources),
[S5](#sources).

### CG-28 Effects only synchronise with something outside React

Use an effect for subscriptions, timers, native APIs and listeners. Derive values while
rendering; reset state with a `key`; do work caused by a tap in the tap's handler.

**Why.** An effect that sets state from props renders twice and drifts out of sync.

```tsx
// Do
const fullName = `${first} ${last}`;
<CustomerForm key={customerId} />                 // resets the form for a new customer
// Don't
const [fullName, setFullName] = useState('');
useEffect(() => setFullName(`${first} ${last}`), [first, last]);
```

**Enforced by:** `react-hooks/set-state-in-effect` (proposed); review. **Source:**
[S1](#sources).

### CG-29 User actions run in event handlers

Saving, sending, printing and navigating after a tap happen in the handler, not in an effect
that watches a flag.

**Why.** The handler runs once, on intent; a flag-watching effect also runs on remount and
in Strict Mode.

```tsx
// Do
const onSave = () => { void submit(values).then(() => router.back()); };
// Don't
useEffect(() => { if (saved) router.back(); }, [saved]);
```

**Enforced by:** review. **Source:** [S1](#sources).

### CG-30 Every effect cleans up

An effect that subscribes, starts a timer or starts a request returns a cleanup that
unsubscribes, clears the timer, or aborts the request or drops its late answer.

**Why.** Without it, late answers overwrite newer ones and listeners leak.

```ts
// Do: src/hooks/useLoadWithRetry.ts
useEffect(() => {
  let current = true;
  latestLoad.current().then(data => { if (current) setSettled({ state: 'loaded', data, key, attempt }); });
  return () => { current = false; };
}, [key, attempt]);
// Don't
useEffect(() => { fetchRows().then(setRows); }, [filter]); // an old filter's answer can land last
```

**Enforced by:** review. **Source:** [S1](#sources).

### CG-31 Read external stores with `useSyncExternalStore`

State kept outside React (a module, a native API) is read with `useSyncExternalStore` or the
library's own hook (`useSelector`, `useQuery`), not copied into state by an effect.

**Why.** It cannot tear between renders and needs no effect.

```ts
// Do: src/components/AlertHost.tsx
const queue = useSyncExternalStore(subscribeAlertQueue, getAlertQueue);
// Don't
const [queue, setQueue] = useState(getAlertQueue());
useEffect(() => subscribeAlertQueue(() => setQueue(getAlertQueue())), []);
```

**Enforced by:** review. **Source:** [S1](#sources).

### CG-32 Memoise only where it matters

Use `useMemo`, `useCallback` and `memo` for list rows, `renderItem`, `keyExtractor` and
handlers passed to memoised rows (CG-38), and for values used as effect dependencies. Add
memoisation elsewhere only when a measurement shows a need. Keep existing memoisation.

**Why.** The React Compiler is not enabled in this app. Memo everywhere costs reading time
and hides real causes of slow renders; memo on list rows and effect inputs prevents real
work.

```tsx
// Do: src/components/lists/DispatchFlashList.tsx
const keyExtractor = useCallback((item: FlattenedItem<Dispatch>) => item.key, []);
// Don't
const title = useMemo(() => tr('grn.list.title'), []); // cheap; nothing depends on its identity
```

**Enforced by:** review; `react-hooks/preserve-manual-memoization` (proposed) keeps existing
memo valid. **Source:** [S4](#sources), [S6](#sources), [S22](#sources).

### CG-33 One-time start-up work runs outside effects

Work that must run once per app start (registering a locale, configuring a library) runs at
module level or behind a guard in the root `_layout`, not in an effect with `[]`.

**Why.** Effects run twice in development and again when a tree remounts (the language
switch rebuilds the navigation tree).

```ts
// Do
let started = false;
export function startOnce() { if (started) return; started = true; /* … */ }
// Don't
useEffect(() => { configureLibrary(); }, []);
```

**Enforced by:** review. **Source:** [S1](#sources).

---

## 5. State and data

### CG-34 Server data is read through a hook, never copied into state

Read facility data through a service in `src/services` (or a feature `services/` folder)
called from a hook:

- TanStack Query (`useQuery`, `useInfiniteQuery`, `useMutation`) for data that is cached,
  shared between screens or paged;
- `useLoadWithRetry` for a one-off read on one screen with loading, failed and loaded
  states and "Try again".

Do not copy the answer into `useState` or Redux.

**Why.** A copy never refreshes and the two disagree after the next write.

```ts
// Do: src/components/OrderBusinessSheet.tsx
const choices = useLoadWithRetry('own-businesses', readChoices);
// Don't
const { data } = useQuery({ queryKey, queryFn });
useEffect(() => setRows(data ?? []), [data]);
```

**Enforced by:** review. **Source:** [S19](#sources).

### CG-35 Query keys come from `queryKeys` and include every input

Build keys with the factory in `src/lib/queryClient.ts` (add an entry for a new area). The
key contains every variable the query function reads. One custom hook per query keeps key,
function and types together.

**Why.** A key that misses an input serves one customer's data for another.

```ts
// Do
useQuery({ queryKey: queryKeys.dispatch.list({ customerId, sortBy }), queryFn: () => list({ customerId, sortBy }) });
// Don't
useQuery({ queryKey: ['dispatch'], queryFn: () => list({ customerId, sortBy }) });
```

**Enforced by:** `@tanstack/query/exhaustive-deps` (proposed, new package). **Source:**
[S18](#sources), [S19](#sources).

### CG-36 Use the one `QueryClient`

Import `queryClient` from `@/lib/queryClient`; do not create another in app code. Its
defaults (stale time, which errors retry, one attempt per write) apply everywhere; override
per query only with a reason in a comment.

**Why.** A second client has its own cache, so invalidation misses it.

```ts
// Do
import { queryClient } from '@/lib/queryClient';
// Don't
const client = new QueryClient(); // inside a component: a new cache every render
```

**Enforced by:** `@tanstack/query/stable-query-client` (proposed, new package); review.
**Source:** [S21](#sources).

### CG-37 Do not rest-destructure query results or put them in dependencies

Pick the fields you need (`const { data, isLoading } = useQuery(…)`). Do not put the whole
result object of `useQuery` or `useMutation` in an effect or memo dependency list.

**Why.** Query results track which fields are read; rest-destructuring reads them all and
re-renders on every change. The result object is new on every render, so as a dependency it
loops.

```ts
// Do
const { mutate } = useMutation(options);
useEffect(() => { if (ready) mutate(payload); }, [ready, mutate, payload]);
// Don't
const { data, ...rest } = useQuery(options);
```

**Enforced by:** `@tanstack/query/no-rest-destructuring`, `@tanstack/query/no-unstable-deps`
(proposed, new package). **Source:** [S21](#sources).

### CG-38 Writes invalidate what they change and never leave a half state

After a successful write, invalidate the queries it affects (for example
`invalidateReportQueries()`). On failure the screen shows the error and the data as it was.
A write is sent once; the user decides whether to try again.

**Why.** A stale list after a save looks like a lost save; an automatic second write can
duplicate a GRN or dispatch.

```ts
// Do
onSuccess: () => { void queryClient.invalidateQueries({ queryKey: queryKeys.dispatch.lists() }); invalidateReportQueries(); }
// Don't
onError: () => mutate(payload); // retries a write that may already be saved
```

**Enforced by:** review. **Source:** [S19](#sources); repo (`src/lib/queryClient.ts`).

### CG-39 Redux holds small, global client state only

Redux (`src/store`) holds app-wide client state such as the theme, language and the selected
facility. Read it with the typed hooks. Screen state stays in the component; lift it only
when two components share it.

**Why.** One source of truth per value; fewer re-renders.

```ts
// Do
const [query, setQuery] = useState('');              // screen-local
// Don't
dispatch(setGrnListSearchText(query));               // screen-local text in the global store
```

**Enforced by:** review. **Source:** [S19](#sources), [S1](#sources).

---

## 6. Lists and performance

### CG-40 Data lists are virtualised

A list that can grow past one screen uses `FlashList`, `FlatList`, or `DataTable`
(`list="flat"`). `ScrollView` with `.map()` is for short, fixed content only.

**Why.** A mapped `ScrollView` renders every row at once: memory and frame drops grow with
the data.

```tsx
// Do: src/components/lists/DispatchFlashList.tsx
<FlashList data={flattenedData} renderItem={renderItem} keyExtractor={keyExtractor} getItemType={getItemType} />
// Don't
<ScrollView>{dispatches.map(d => <DispatchCard key={d.id} dispatch={d} />)}</ScrollView>
```

**Enforced by:** review. **Source:** [S6](#sources), [S7](#sources).

### CG-41 Rows, `renderItem` and `keyExtractor` are stable

`keyExtractor` returns the row's string id. `renderItem` is memoised with `useCallback`,
rows are memoised components, and handlers passed to rows are stable. Values a row reads
that are not in `data` go in `extraData`.

**Why.** A new `renderItem` or handler on each render re-renders every visible row.

```tsx
// Do
const renderItem = useCallback(({ item }: { item: Dispatch }) => <DispatchRow dispatch={item} onPress={openDispatch} />, [openDispatch]);
// Don't
<FlashList renderItem={({ item }) => <DispatchRow dispatch={item} onPress={() => open(item.id)} />} />
```

**Enforced by:** review. **Source:** [S6](#sources).

### CG-42 Help the list measure

For a `FlatList` with fixed-height rows, give `getItemLayout`. `FlashList` 2 measures rows
itself and has no `estimatedItemSize`; give it `getItemType` when rows differ in kind, and do
not set `key` inside a row component (it defeats recycling). Tune `windowSize`,
`initialNumToRender` and `maxToRenderPerBatch` only after measuring.

**Why.** Measuring is the main cost of long lists; wrong tuning costs memory or blank areas.

```tsx
// Do: src/features/dispatch/components/GRNAutocompleteBottomSheet.tsx
getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
// Don't
<FlashList estimatedItemSize={72} /> // not a FlashList 2 prop
```

**Enforced by:** `tsc` (unknown props); review. **Source:** [S6](#sources),
[S24](#sources).

### CG-43 Measure before optimising, in a release build

Profile (React DevTools profiler, the Perf Monitor) on a release build before changing code
for speed, and fix the cause of a re-render before adding memoisation.

**Why.** Development builds are much slower and point at the wrong problems.

```text
Do:   "Profiler: DispatchRow re-renders on every keystroke because onPress is new; made it stable."
Don't: "Wrapped 12 components in memo in case it helps."
```

**Enforced by:** review. **Source:** [S7](#sources), [S22](#sources).

### CG-44 Animate on the UI thread

Animate with Reanimated worklets (or `useNativeDriver: true`), and animate `transform` and
`opacity` rather than width, height or margins.

**Why.** JS-driven layout animation drops frames whenever the JS thread is busy.

```ts
// Do
const style = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
// Don't
Animated.timing(height, { toValue: 200, useNativeDriver: false }).start();
```

**Enforced by:** review. **Source:** [S7](#sources).

### CG-45 Keep press handlers cheap

A handler gives feedback first; heavy work (building a PDF, sorting thousands of rows)
starts after the frame (`requestAnimationFrame`) or off the JS thread.

**Why.** The tap must feel answered within a frame.

```ts
// Do
const onPrint = () => { setBusy(true); requestAnimationFrame(() => { void buildAndPrint(); }); };
// Don't
const onPrint = () => { const pdf = buildPdfSync(rows); setBusy(true); };
```

**Enforced by:** review. **Source:** [S7](#sources).

### CG-46 Images are sized and cached

Show remote images at the size they are drawn, through `expo-image` where possible; do not
put full-size photos in list rows.

**Why.** Large decoded images exhaust memory on low-end phones.

```tsx
// Do
<Image source={{ uri: thumbUrl }} style={{ width: size, height: size }} cachePolicy="memory-disk" />
// Don't
<Image source={{ uri: fullSizePhotoUrl }} style={styles.thumb} /> // in every row
```

**Enforced by:** review. **Source:** [S6](#sources).

---

## 7. New Architecture APIs

### CG-47 New Architecture APIs only

The legacy architecture is gone (0.84). Do not use `UIManager` calls, `findNodeHandle`,
`setNativeProps`, `requireNativeComponent` or `NativeModules` for new work; pass host
instances (refs) directly and use Expo Modules or TurboModules for native code.

**Why.** These go through compatibility layers that are being removed.

```ts
// Do
if (ref.current) AccessibilityInfo.sendAccessibilityEvent(ref.current, 'focus');
// Don't
const node = findNodeHandle(ref.current);
if (node) AccessibilityInfo.setAccessibilityFocus(node);
```

**Enforced by:** `@typescript-eslint/no-deprecated` (proposed); `no-restricted-imports` for
`findNodeHandle` and `requireNativeComponent` from `react-native` (proposed). **Source:**
[S9](#sources), [S10](#sources).

### CG-48 Removed and deprecated platform APIs stay out

Do not use `InteractionManager` (removed in SDK 58), `StyleSheet.absoluteFillObject` (use
`StyleSheet.absoluteFill`), `ImageBackground` (deprecated in SDK 58), or gesture-handler's
`Swipeable` (use `ReanimatedSwipeable`).

**Why.** They fail to build or will on the next upgrade.

```ts
// Do
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
// Don't
InteractionManager.runAfterInteractions(load);
```

**Enforced by:** `no-restricted-imports` (`Swipeable`, existing); `tsc`;
`@typescript-eslint/no-deprecated` (proposed); `no-restricted-imports` for
`InteractionManager` and `ImageBackground` (proposed). **Source:** [S10](#sources),
[S11](#sources).

### CG-49 Read window size with `useWindowDimensions`

Read sizes during render with `useWindowDimensions()`. `Dimensions.get` at module load is
only a seed value that `onLayout` replaces.

**Why.** A value read once at load goes stale on split screen, foldables and display-size
changes.

```tsx
// Do
const { height } = useWindowDimensions();
<View style={[styles.sheet, { maxHeight: height }]} />
// Don't
const SCREEN_HEIGHT = Dimensions.get('window').height; // module level, used in styles
```

**Enforced by:** review. **Source:** [S7](#sources).

### CG-50 Measure layout in `useLayoutEffect`; defer non-urgent updates

Under the New Architecture, `useLayoutEffect` can measure and set state before the frame is
shown (no jump). Use `startTransition` or `useDeferredValue` for updates that may lag, such
as filtering a long list while typing.

**Why.** Layout reads are synchronous now, and concurrent rendering keeps typing smooth.

```tsx
// Do
const deferredQuery = useDeferredValue(query);
const rows = useMemo(() => filterRows(all, deferredQuery), [all, deferredQuery]);
// Don't
onLayout={e => setHeight(e.nativeEvent.layout.height)} // one frame at the wrong size first
```

**Enforced by:** review. **Source:** [S9](#sources).

---

## 8. Accessibility mechanics

What a screen reader must say, touch sizes and contrast are set by
[STYLE_GUIDE.md §11](STYLE_GUIDE.md#11-accessibility). These rules cover only how the code
expresses them.

### CG-51 Pressable elements carry role, label and state props

Set `accessibilityRole`, `accessibilityLabel` (when the visible text is not enough) and
`accessibilityState` on every pressable element, as STYLE_GUIDE §11.3 lists. Keep
`accessibilityState` in step with the visual state. Use `accessibilityRole`; do not use
React Native's `role` prop.

**Why.** Screen readers read these props, not the look. The app's own components already
use a `role` prop for their look (`DialogButton`'s `primary`/`negative`), so React Native's
`role` beside it would confuse a reader.

```tsx
// Do
<Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, busy: loading }} />
// Don't
<Pressable onPress={open}><Icon name="printer" /></Pressable>
```

**Enforced by:** review. **Source:** [S8](#sources); [STYLE_GUIDE.md §11.3](STYLE_GUIDE.md#113-screen-readers).

### CG-52 A row reads as one element

Group a row with `accessible` and one combined label; do not nest separately focusable
pressables inside an accessible group. A row's second action goes outside the grouped row,
as its own button with its own label, the way swipe and menu actions do. Do not use
`accessibilityActions` unless the screen design specifies them.

**Why.** TalkBack and VoiceOver handle nested accessible elements differently; one may skip
the inner control.

```tsx
// Do
<View style={styles.rowLine}>
  <Pressable accessible accessibilityRole="button" accessibilityLabel={rowLabel} onPress={open}>{/* texts */}</Pressable>
  <Pressable accessibilityRole="button" accessibilityLabel={printLabel} onPress={print}><Icon name="printer" /></Pressable>
</View>
// Don't
<View accessible><Pressable onPress={open} /><Pressable onPress={print} /></View>
```

**Enforced by:** review. **Source:** [S8](#sources).

### CG-53 Announce changes and move focus through the APIs

Announce a status change or error with `AccessibilityInfo.announceForAccessibility` (or an
`accessibilityLiveRegion` on Android). Move focus with
`AccessibilityInfo.sendAccessibilityEvent(ref.current, 'focus')`.

**Why.** A change the user cannot see must still reach them; the old focus API goes through
the legacy bridge.

```ts
// Do: src/features/invoice/components/items/InvoiceItemsEditor.tsx
AccessibilityInfo.announceForAccessibility(tr('invoice.items.fixRates', { count: wrong.length }));
// Don't
AccessibilityInfo.setAccessibilityFocus(findNodeHandle(field)!);
```

**Enforced by:** review; `@typescript-eslint/no-deprecated` (proposed). **Source:**
[S8](#sources), [S25](#sources).

### CG-54 Extend touch areas with `hitSlop`, not padding hacks

When a control is drawn smaller than the touch size in STYLE_GUIDE §11.2, extend it with
`hitSlop` so the layout does not change. The extended area must not overlap a neighbouring
target. On Android the touch area is cut off at the parent's edge, so the parent must leave
room for it.

**Why.** The touch area grows without moving anything on screen.

```tsx
// Do: src/components/ui/Input.tsx
const CLEAR_HIT_SLOP = (touchTarget - iconSize.md) / 2;
<Pressable hitSlop={CLEAR_HIT_SLOP} accessibilityRole="button" accessibilityLabel={label} />
// Don't
<Pressable style={{ margin: -12, padding: 12 }} />
```

**Enforced by:** review. **Source:** [S8](#sources); [STYLE_GUIDE.md §11.2](STYLE_GUIDE.md#112-touch-targets-and-spacing).

---

## 9. Translation (i18n)

The full rules are in [I18N.md](I18N.md). The code-level ones:

### CG-55 Every text a person sees or hears goes through `t`

Labels, accessibility labels and hints, placeholders, alert titles and buttons, and error
messages use `t('area.group.name')`, called while rendering or inside a function, never at
module level. Both languages are added in the same change.

**Why.** The app runs in English and Gujarati; a module-level `t` keeps the start-up
language.

```tsx
// Do
showAlert(tr('central.link.notSentTitle'), result.message);
// Don't
const TITLE = t('grn.list.title');          // module level
<Text>No GRNs yet</Text>                    // literal text
```

**Enforced by:** test (`src/i18n/__tests__/guards.test.ts`, `scripts/i18n-report.mjs`);
`tsc` (both locale tables share one type). **Source:** [I18N.md rules 1, 2 and 8](I18N.md#rules).

### CG-56 Whole sentences with placeholders; counts as plural pairs

Never join translated pieces with `+` or a template string; pass values as placeholders and
counts as `{ count }`.

**Why.** Gujarati word order differs from English.

```ts
// Do
tr('grn.list.noMatch', { search });
// Don't
tr('grn.list.noMatchPrefix') + ' "' + search + '"';
```

**Enforced by:** test (`src/i18n/__tests__/translate.test.ts`); review. **Source:**
[I18N.md rules 3 and 4](I18N.md#rules).

### CG-57 Numbers, dates and identifiers go through the formatters

Format amounts, weights, counts and dates with `@/utils/formatters`; send calendar days with
`toLocalISODate`; wrap identifiers in `formatIdentifier`. Never `toLocaleString`,
`toLocaleDateString` or `toISOString().split('T')`.

**Why.** The formatters apply Indian grouping and Gujarati digits; `toISOString` is UTC and
gives yesterday's date before 5:30 in India.

```ts
// Do
const day = toLocalISODate(pickedDate);
// Don't
const day = pickedDate.toISOString().split('T')[0];
```

**Enforced by:** `no-restricted-syntax` (`toISOString` rule, existing); test
(`guards.test.ts` for `toLocale*`). **Source:** [I18N.md rule 5](I18N.md#rules).

---

## 10. Errors and logging

### CG-58 Log with the app logger, never `console`

Use `createLogger('<area>')` from `@/utils/logger` and pass errors through `loggableError`.
Never log credentials, tokens, login codes, phone numbers or request and response bodies.

**Why.** The logger redacts known secrets and logs only errors in release; `console` does
neither.

```ts
// Do: src/services/user-service.ts
const log = createLogger('user');
log.error('User profile fetch error', loggableError(userError));
// Don't
console.log('profile', response);
```

**Enforced by:** `no-console` (existing: warn, error in the sign-in files); proposed to raise
to error everywhere except `src/utils/logger.ts`. **Source:** [S7](#sources); repo
(`src/utils/logger.ts`).

### CG-59 Every failure reaches the user once, in their language

Catch a failure where it can be explained, show a translated message (`failureText` or
`serverText` from `@/utils/serverText`, shown in the screen's error state or with
`showAlert`), and log the cause once. Never swallow an error silently.

**Why.** A silent failure looks like a save that worked.

```ts
// Do
} catch (error) {
  log.error('Save failed', loggableError(error));
  const title = tr('errors.grn.form.saveFailedTitle');
  showAlert(title, failureText(error, null, title));
}
// Don't
} catch {}
```

**Enforced by:** `@typescript-eslint/no-floating-promises` (proposed); `no-empty` (existing,
in `@eslint/js` recommended); review. **Source:** [S13](#sources).

### CG-60 Throw `Error` objects; narrow `unknown` in `catch`

Throw `new Error(message)` (with a `code` property when callers need one); treat the caught
value as `unknown` and narrow it before reading fields.

**Why.** Only `Error` objects carry a stack; a caught value can be anything.

```ts
// Do
throw Object.assign(new Error(message), { code: response.errorCode });
// Don't
throw { message: 'failed' };
```

**Enforced by:** `@typescript-eslint/only-throw-error`,
`@typescript-eslint/prefer-promise-reject-errors` (proposed); `tsc` (`strict` makes catch
variables `unknown`). **Source:** [S13](#sources).

### CG-61 Use `showAlert`, not `Alert.alert`

**Why.** `showAlert` draws the themed dialog and queues dialogs safely; `Alert.alert` does
neither.

```ts
// Do
import { showAlert } from '@/utils/alert';
// Don't
Alert.alert('Saved');
```

**Enforced by:** `no-restricted-syntax` (existing). **Source:** repo (`src/utils/alert.ts`).

---

## 11. Security and secrets

### CG-62 Facility requests go through `gatedFetch`

Every request to a facility's backend goes through the authenticated client and
`gatedFetch` (or `transportFetch` for a request that must not carry sign-in tokens). A new
bare `fetch`, download or signed URL to a facility address must be added to the network
fallback rules.

**Why.** That path checks identity, server switches and rotated keys, and signs requests on
the warehouse network.

```ts
// Do
const client = await getAuthenticatedClient();
// Don't
await fetch(`${facilityOrigin}/rest/v1/grn`); // bypasses the gate
```

**Enforced by:** `no-restricted-imports` (`getSupabaseClient` in listed services, existing);
test (`src/config/__tests__/lanCallSites.test.ts`). **Source:** repo
([CLAUDE.md](../CLAUDE.md)).

### CG-63 Secrets live in secure storage only

Tokens, keys and anything that grants access are stored with `expo-secure-store` through the
existing modules (`src/utils/secureStorage.ts`, `src/config/lanKey.ts`), never in
AsyncStorage, Redux persistence or the bundle. Every `EXPO_PUBLIC_*` value is public.

**Why.** The bundle and AsyncStorage are readable on a rooted or backed-up phone.

```ts
// Do
await storeTokensSecurely(tokens);
// Don't
await AsyncStorage.setItem('refresh_token', token);
```

**Enforced by:** review. **Source:** repo
([DEVELOPER_HANDOFF.md](DEVELOPER_HANDOFF.md)).

### CG-64 Treat route params and server data as untrusted

Validate route params before use (`useValidatedRouteParams`, `useRequiredIdParam`,
`isAnyUuid`) and check the shape of data from the network before relying on it.

**Why.** Deep links can carry anything; a wrong shape crashes a screen or sends a bad write.

```ts
// Do
const { params, isValid } = useValidatedRouteParams<{ id: string }>(['id'], { id: isValidUUID });
// Don't
const { id } = useLocalSearchParams<{ id: string }>(); // used unchecked in a query
```

**Enforced by:** review. **Source:** [S12](#sources); repo (`src/hooks/useRouteParams.ts`).

### CG-65 No code from strings

No `eval`, `new Function`, or string arguments to `setTimeout`; no unescaped data inserted
into WebView HTML.

**Why.** They run whatever the string holds.

```ts
// Do
setTimeout(retry, 500);
// Don't
setTimeout('retry()', 500);
```

**Enforced by:** `no-eval`, `no-implied-eval`, `no-new-func` (proposed; core). **Source:**
[S13](#sources).

### CG-66 Dependencies are added deliberately and audited

Add a dependency only when it is needed, pinned as Expo recommends (`npx expo install`), and
keep `npm run audit:dependencies` passing.

**Why.** Every package is code that runs with the app's rights.

```bash
# Do
npx expo install expo-image
# Don't
npm install some-package@latest   # outside Expo's version set
```

**Enforced by:** CI (audit and expo-doctor). **Source:** repo
([DEPENDENCY_SECURITY.md](DEPENDENCY_SECURITY.md)).

---

## 12. Tests

### CG-67 New tests use React Native Testing Library

Every new test uses `@testing-library/react-native` (`render`, `screen`, `userEvent`).
The existing `react-test-renderer` tests are being converted to Testing Library in batches,
folder by folder; a test that has not been converted yet may stay as it is until its batch
comes up.

**Why.** `react-test-renderer` is deprecated in React 19; Testing Library tests what a user
sees and does.

```tsx
// Do (render, userEvent and fireEvent are async in v14: await them)
it('saves', async () => {
  await render(<SaveBar onSave={onSave} />);
  await userEvent.press(screen.getByRole('button', { name: 'Save' }));
});
// Don't (in a new test)
const tree = renderer.create(<SaveBar onSave={onSave} />);
tree.root.findAll(n => typeof n.props.onPress === 'function')[0].props.onPress();
```

**Enforced by:** review. **Source:** [S15](#sources), [S16](#sources).

### CG-68 Query like a user

Prefer `getByRole` with a name, then label or text, and `testID` last: use `testID` where
the text changes with the language or the element has no role. Tests run in English; a test
of Gujarati sets the language and resets it in `afterEach`.

**Why.** Role queries also check that the element is accessible.

```tsx
// Do (after await render(...) in an async test)
screen.getByRole('button', { name: 'Print' });
// Don't
screen.getByTestId('print-button'); // when a role and name exist
```

**Enforced by:** review; `testing-library/prefer-screen-queries` (proposed, new package).
**Source:** [S16](#sources), [S17](#sources); [I18N.md](I18N.md#tests).

### CG-69 Use the right query variant and await async work

`getBy` for something that is there, `queryBy` only to assert absence, `findBy` for
something that appears later. One assertion per `waitFor`, no side effects in it. Use the
built-in matchers (`toBeOnTheScreen`, `toBeDisabled`). Do not wrap in `act` or call
`cleanup` by hand.

**Why.** Clear failure messages and no flaky timing.

```tsx
// Do
it('shows Saved', async () => {
  await render(<SaveBar onSave={onSave} />);
  await userEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Saved')).toBeOnTheScreen();
});
// Don't
await waitFor(async () => { await fireEvent.press(save); expect(screen.getByText('Saved')).toBeTruthy(); });
```

**Enforced by:** `testing-library/prefer-find-by`, `testing-library/prefer-presence-queries`,
`testing-library/no-wait-for-side-effects`, `testing-library/no-wait-for-multiple-assertions`,
`testing-library/await-async-queries`, `testing-library/no-unnecessary-act`,
`testing-library/no-manual-cleanup` (proposed, new package). **Source:** [S16](#sources),
[S17](#sources).

### CG-70 Prefer `userEvent` over `fireEvent` in new tests

Await `userEvent.press`, `userEvent.type` and so on; use `fireEvent` (also awaited) only for
events `userEvent` does not cover.

**Why.** `userEvent` runs the full press and typing sequence a real touch would.

```ts
// Do
await userEvent.type(screen.getByLabelText('Bags'), '12');
// Don't
await fireEvent.changeText(input, '12');
```

**Enforced by:** review. **Source:** [S16](#sources).

### CG-71 Each test owns its data and network

Create a new `QueryClient` per test with `retry: false`; mock services or the network, never
a real facility. Use fictional names and phone numbers.

**Why.** A shared cache or retries make tests depend on order and slow.

```ts
// Do
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
// Don't
import { queryClient } from '@/lib/queryClient'; // shared across tests
```

**Enforced by:** review. **Source:** [S20](#sources); repo ([CLAUDE.md](../CLAUDE.md)).

### CG-72 No focused or skipped tests; no snapshot-only tests for logic

Do not commit `it.only`, `describe.only`, `it.skip` or `xit`. Test behaviour with assertions,
not with a snapshot of the whole tree.

**Why.** A focused test silently skips the rest of the file; a snapshot passes whatever it
shows after `-u`.

```tsx
// Do
expect(screen.getByText('12 bags')).toBeOnTheScreen();
// Don't
it.only('renders', () => expect(tree).toMatchSnapshot());
```

**Enforced by:** `jest/no-focused-tests`, `jest/no-disabled-tests` (proposed, new package).
**Source:** [S17](#sources).

### CG-73 Behaviour changes come with tests, and tests type-check

Every behaviour change adds or updates a test. Test files pass `npm run typecheck:tests`.

**Why.** A change without a test is lost at the next refactor.

```text
Do:   fix + src/features/grn/__tests__/grnTotals.test.ts covering the case
Don't: fix only, "tested by hand"
```

**Enforced by:** CI (`typecheck:tests`, `npm test`); review. **Source:** repo
([CONTRIBUTING.md](../CONTRIBUTING.md)).

---

## 13. Git and pull requests

### CG-74 Conventional Commits

`type(scope): description` with `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.

**Why.** Readable history and release notes.

```text
Do:   fix(dispatch): keep the GRN picker closed after a failed add
Don't: updates
```

**Enforced by:** review. **Source:** [CONTRIBUTING.md](../CONTRIBUTING.md).

### CG-75 One concern per pull request, all checks green

Branch from `main`; keep a pull request to one change. Before review, `npm run typecheck`,
`npm run typecheck:tests`, `npm run lint` (no new warnings in changed files), `npm test` and
`npm run test:setup` pass. Docs change with the behaviour they describe. Commits are squashed
on merge.

**Why.** Small, green pull requests are reviewed properly and reverted cleanly.

```text
Do:   one PR: "fix(invoice): announce the rate errors"
Don't: one PR mixing a bug fix, a dependency bump and a refactor
```

**Enforced by:** CI (`.github/workflows/ci.yml`); review. **Source:**
[CONTRIBUTING.md](../CONTRIBUTING.md).

### CG-76 Stage files by name; never commit generated or secret files

Stage the files you changed by path. Never commit `node_modules`, `.env`, signing keys, or
the generated `android/` and `ios/` folders.

**Why.** A broad `git add` picks up local files and secrets.

```bash
# Do
git add src/utils/formatters.ts src/utils/__tests__/formatters.test.ts
# Don't
git add -A
```

**Enforced by:** `.gitignore`; review. **Source:** repo ([CLAUDE.md](../CLAUDE.md)).

### CG-77 Formatting is Prettier's job

Run `npm run format` (Prettier, `.prettierrc`) and `npm run lint:fix`; formatting is not
discussed in review.

**Why.** Diffs show changes, not whitespace.

```text
Do:   npm run format before committing
Don't: hand-aligning or a review comment about quotes
```

**Enforced by:** Prettier (`npm run format`); review. **Source:**
[CONTRIBUTING.md](../CONTRIBUTING.md).

---

## Review checklist

For every pull request that changes code under `app/` or `src/` (UI changes also use the
checklist in [STYLE_GUIDE.md §18](STYLE_GUIDE.md#18-review-checklist)):

**Structure**
- [ ] Only routes under `app/`; imports use `@/`; no deep `react-native/Libraries` or
      `@react-navigation/*` imports; no new barrel file (CG-1 to CG-7).

**Types**
- [ ] No `any`, `!`, `@ts-ignore` or deprecated API; type-only imports use `import type`;
      unions are switched exhaustively; every promise is handled (CG-8 to CG-16).

**Components and hooks**
- [ ] Function components at module level; render is pure; keys are ids (CG-17 to CG-22).
- [ ] New components use `ref` as a prop and `Pressable` (CG-20, CG-21).
- [ ] Failing areas sit under an error boundary (CG-25).
- [ ] Hooks at top level with complete dependencies; effects only sync with the outside and
      clean up; user actions in handlers (CG-26 to CG-31).
- [ ] Memoisation only on list rows, `renderItem`, handlers to rows and effect inputs, or
      with a measurement (CG-32).

**Data**
- [ ] Server data through a service and a hook, not copied into state; keys from
      `queryKeys` with every input; one `QueryClient` (CG-34 to CG-37).
- [ ] A write is sent once, invalidates what it changes, and leaves no half state on
      failure (CG-38).

**Lists and performance**
- [ ] Long lists virtualised with stable `keyExtractor`, `renderItem` and rows (CG-40,
      CG-41).
- [ ] Any speed change comes with a release-build measurement (CG-43).

**Platform**
- [ ] No legacy-architecture or removed APIs; sizes from `useWindowDimensions` (CG-47 to
      CG-49).

**Accessibility (mechanics)**
- [ ] Pressables have `accessibilityRole` (never React Native's `role` prop), a label and
      state props as STYLE_GUIDE §11.3 lists; rows grouped, with a second action outside the
      row; `hitSlop` overlaps no neighbour and fits inside its parent; changes announced;
      focus moved with `sendAccessibilityEvent` (CG-51 to CG-54).

**Text**
- [ ] Every visible or spoken text through `t`, in both languages; no joined sentences;
      numbers, dates and identifiers through the formatters (CG-55 to CG-57).

**Errors and security**
- [ ] Logger, not `console`; nothing sensitive logged; every failure shown once in the
      user's language; `showAlert` (CG-58 to CG-61).
- [ ] Facility requests through `gatedFetch`; secrets only in secure storage; route params
      and server data validated; no `eval` (CG-62 to CG-65).
- [ ] New dependencies justified and installed with `npx expo install` (CG-66).

**Tests and git**
- [ ] Behaviour change has a test; every new test uses Testing Library with role queries,
      `findBy` and `userEvent`; no `.only` or `.skip` (CG-67 to CG-73).
- [ ] Conventional Commit message; one concern; all checks green; files staged by path
      (CG-74 to CG-77).

---

## Proposed lint rules

To be switched on in `eslint.config.mjs`, at `warn` first, each with a comment naming its
CG rule. Type-aware rules need `parserOptions.projectService`.

| Rule | CG | Plugin | Package |
|---|---|---|---|
| `no-restricted-imports` patterns `../../*`, `@react-navigation/*`, `react-native/Libraries/*`; names `findNodeHandle`, `requireNativeComponent`, `InteractionManager`, `ImageBackground` from `react-native` | CG-2, CG-3, CG-4, CG-47, CG-48 | ESLint core | installed |
| `no-restricted-syntax` on class components outside the three error boundaries | CG-17 | ESLint core | installed |
| `no-eval`, `no-implied-eval`, `no-new-func` | CG-65 | ESLint core | installed |
| `no-console` at `error` except `src/utils/logger.ts` | CG-58 | ESLint core | installed |
| `react-hooks` `flat.recommended` (`rules-of-hooks`, `exhaustive-deps`, `purity`, `immutability`, `refs`, `globals`, `set-state-in-render`, `set-state-in-effect`, `static-components`, `error-boundaries`, `preserve-manual-memoization` and the rest of the preset) | CG-18, CG-19, CG-25, CG-26, CG-27, CG-28, CG-32 | eslint-plugin-react-hooks 7 | installed |
| `@typescript-eslint` `recommendedTypeChecked` + `stylisticTypeChecked` (includes `no-explicit-any`, `ban-ts-comment`, `no-floating-promises`, `no-misused-promises`, `no-unused-vars`, `only-throw-error`, `prefer-promise-reject-errors`, `prefer-nullish-coalescing`, `prefer-optional-chain`) | CG-6, CG-8, CG-9, CG-11, CG-14, CG-59, CG-60 | typescript-eslint 8 | installed |
| `@typescript-eslint/no-non-null-assertion` | CG-10 | typescript-eslint 8 | installed |
| `@typescript-eslint/switch-exhaustiveness-check` | CG-12 | typescript-eslint 8 | installed |
| `@typescript-eslint/consistent-type-imports` | CG-13 | typescript-eslint 8 | installed |
| `@typescript-eslint/no-deprecated` | CG-16, CG-47, CG-48, CG-53 | typescript-eslint 8 | installed |
| `@tanstack/query/exhaustive-deps`, `stable-query-client`, `no-rest-destructuring`, `no-unstable-deps` | CG-35, CG-36, CG-37 | `@tanstack/eslint-plugin-query` | new package (switched on) |
| `react/no-array-index-key`, `react/no-unstable-nested-components`, `react/jsx-boolean-value` | CG-19, CG-22, CG-23 | `eslint-plugin-react` (these rules only) | new package (not switched on: its latest release, 7.37.5, does not declare ESLint 10 support) |
| `testing-library/prefer-screen-queries`, `prefer-find-by`, `prefer-presence-queries`, `no-wait-for-side-effects`, `no-wait-for-multiple-assertions`, `await-async-queries`, `no-unnecessary-act`, `no-manual-cleanup` (test files) | CG-68, CG-69 | `eslint-plugin-testing-library` | new package (switched on) |
| `jest/no-focused-tests`, `jest/no-disabled-tests` (test files) | CG-72 | `eslint-plugin-jest` | new package (switched on) |

Not proposed: `eslint-plugin-react-perf` (noisy, conflicts with CG-32);
`eslint-plugin-react-native` (overlaps the style-guide guards);
`eslint-plugin-react-native-a11y` (its documentation shows only the legacy config format
and only `accessibilityRole`, so CG-51 to CG-54 stay with review);
`testing-library/prefer-user-event` (documented for DOM events only, so CG-70 stays with
review).

---

## Sources

| # | Source |
|---|---|
| S1 | [React: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) |
| S2 | [React: Rules of React](https://react.dev/reference/rules) |
| S3 | [React 19 release post](https://react.dev/blog/2024/12/05/react-19) |
| S4 | [React Compiler introduction](https://react.dev/learn/react-compiler/introduction) |
| S5 | [eslint-plugin-react-hooks reference](https://react.dev/reference/eslint-plugin-react-hooks) |
| S6 | [React Native: Optimizing FlatList configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration) |
| S7 | [React Native: Performance overview](https://reactnative.dev/docs/performance) |
| S8 | [React Native: Accessibility](https://reactnative.dev/docs/accessibility) |
| S9 | [React Native: About the New Architecture](https://reactnative.dev/architecture/landing-page) |
| S10 | [React Native blog (releases 0.80 to 0.88)](https://reactnative.dev/blog) |
| S11 | [Expo SDK 58 changelog](https://expo.dev/changelog/sdk-58) |
| S12 | [Expo Router: core concepts](https://docs.expo.dev/router/basics/core-concepts/) |
| S13 | [typescript-eslint: shared configs](https://typescript-eslint.io/users/configs) |
| S14 | [typescript-eslint: rules](https://typescript-eslint.io/rules/) |
| S15 | [Testing Library: guiding principles](https://testing-library.com/docs/guiding-principles/) |
| S16 | [React Native Testing Library: queries](https://oss.callstack.com/react-native-testing-library/docs/api/queries) |
| S17 | [Kent C. Dodds: Common mistakes with React Testing Library](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library) |
| S18 | [TanStack Query: query keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys) |
| S19 | [TkDodo: Practical React Query](https://tkdodo.eu/blog/practical-react-query) |
| S20 | [TkDodo: Testing React Query](https://tkdodo.eu/blog/testing-react-query) |
| S21 | [TanStack Query ESLint plugin](https://tanstack.com/query/latest/docs/eslint/eslint-plugin-query) |
| S22 | [Callstack: The Ultimate Guide to React Native Optimization](https://www.callstack.com/ebooks/the-ultimate-guide-to-react-native-optimization) |
| S23 | [Airbnb React/JSX style guide](https://github.com/airbnb/javascript/tree/master/react) |
| S24 | [FlashList documentation](https://shopify.github.io/flash-list/docs/) |
| S25 | [React Native: AccessibilityInfo](https://reactnative.dev/docs/accessibilityinfo) |

"repo" in a Source line means the rule records how this codebase already works; the file
named next to it is the reference.
