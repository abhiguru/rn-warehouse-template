# Style guide

This guide defines how every screen of the app looks and behaves. It follows SAP Fiori for iOS and Android with the Horizon theme, adapted to React Native. It covers two brands, each in light and dark mode:

| Theme | Brand fill | Use |
|---|---|---|
| Orange light | `#F69000` with dark text | The template's original look, made accessible |
| Orange dark | `#FFA733` with dark text | Same brand in dark mode |
| GCSA light | navy `#2E3192` with white text | Gujarat Cold Storage Association members |
| GCSA dark | navy `#9DA0F0` with dark text | Same brand in dark mode |

The user picks the brand under **Settings → Brand** and the mode under **Settings → Appearance** (System, Light, Dark). A build sets the default brand with `EXPO_PUBLIC_DEFAULT_BRAND=orange|gcsa`.

The source of truth is code, not this document:

| What | Where |
|---|---|
| Raw palettes (reference tokens) | `src/theme/tokens/reference.ts` |
| Role colours for each theme (semantic tokens) | `src/theme/tokens/semantic.ts` |
| Type, spacing, shape, sizes, motion | `src/theme/tokens/metrics.ts` |
| Contrast maths | `src/theme/tokens/contrast.ts` |
| Contrast test for all four themes | `src/theme/tokens/__tests__/contrast.test.ts` |
| Live gallery (development builds) | Settings → Development → Style guide (`app/style-guide.tsx`) |

If this guide and the code disagree, the code wins and this guide is the bug.

**Contents**

1. [Principles](#1-principles)
2. [Using tokens in code](#2-using-tokens-in-code)
3. [Colour](#3-colour)
4. [Typography](#4-typography)
5. [Spacing and layout](#5-spacing-and-layout)
6. [Shape](#6-shape)
7. [Elevation](#7-elevation)
8. [Iconography](#8-iconography)
9. [Motion](#9-motion)
10. [Interaction states](#10-interaction-states)
11. [Accessibility](#11-accessibility)
12. [Content and wording](#12-content-and-wording)
13. [Components](#13-components)
14. [Patterns](#14-patterns)
15. [Platform notes](#15-platform-notes)
16. [Enforcement](#16-enforcement)
17. [Making changes](#17-making-changes)
18. [Review checklist](#18-review-checklist)
19. [Sources](#19-sources)

---

## 1. Principles

These are Fiori's five design principles, applied to a warehouse app used by cold-storage owners, their staff and their customers.

- **Role-based.** Each person sees what their role needs. Customers see their own orders and stock. Staff see the queue they work. Admins see everything. Never show an action a role cannot perform; hide it rather than disabling it.
- **Adaptive.** Every screen works on a small Android phone, a large phone and a tablet, in portrait, in light and dark mode, in both brands, with the largest system font size, and offline where the feature allows.
- **Simple.** One primary action per screen. Show the few fields people need first and put the rest one tap away. Prefer a list with good defaults over a form full of options.
- **Coherent.** The same thing looks and behaves the same everywhere. An order status chip on the order list, the customer page and the report is the same component with the same colours.
- **Delightful.** Fast feedback (pressed state within 100 ms), no dead ends (every error says what to do next), and nothing that looks like developer output.

Three rules follow from these and override local taste:

1. **Colour comes from tokens.** No hex, `rgb()` or named colours outside `src/theme`. See [Migration and enforcement](#16-migration-and-enforcement).
2. **Status meaning is the same in both brands.** Negative, critical, positive, informative and neutral colours are SAP Horizon values and never change with the brand.
3. **Colour is never the only signal.** Every status colour sits beside an icon, a word or both.

---

## 2. Using tokens in code

Fiori defines colours in two layers. **Reference tokens** are raw palettes, such as `orange[600]` or `horizon.light.text`. **Semantic tokens** name a role, such as `text.secondary` or `brand.fill`, and resolve to a reference value for the current brand and mode. Components use semantic tokens only.

```tsx
import { useThemedStyles, useTokens } from '@/hooks/useTheme';
import { radius, space, typography } from '@/theme/tokens';
import type { ThemeTokens } from '@/theme/tokens';

const makeStyles = (t: ThemeTokens) => ({
  card: {
    backgroundColor: t.surface.card,
    borderRadius: radius.card,
    padding: space.lg,
    ...t.shadow[2],
  },
  title: { ...typography.headline, color: t.text.primary },
  meta: { ...typography.subhead, color: t.text.secondary },
});

export function OrderCard() {
  const styles = useThemedStyles(makeStyles); // rebuilt only when brand or mode changes
  const t = useTokens(); // for values passed as props, e.g. icon colours
  // ...
}
```

Rules:

- **Do** build styles with `useThemedStyles(makeStyles)`. It memoises `StyleSheet.create` per brand and mode, so switching theme restyles the whole app with no reload.
- **Do** read `useTokens()` for colours passed as props: icon `color`, `placeholderTextColor`, `ActivityIndicator` colour, chart series, `RefreshControl` tint.
- **Do** get brand and mode from `useTheme()`. It respects the Settings choice.
- **Don't** put colours in a module-scope `StyleSheet.create`. It is evaluated once at load, so it can never follow dark mode or the brand.
- **Don't** call `useColorScheme()` or `Appearance` in components. They ignore the user's Settings choice.
- **Don't** import `reference` palettes in components. If a role is missing, add a semantic token, add it to the contrast test, and document it here.
- **Don't** copy a local `FIORI` or `FIORI_STATIC` object of colours or sizes into a file. Use `metrics.ts`.

There are no other colour APIs: the old palettes and their adapters were removed once every screen used tokens.

---

## 3. Colour

### 3.1 How the palette is built

- **Neutrals, fields, status colours and shadows** are SAP Morning Horizon (light) and Evening Horizon (dark), taken from SAP's published theme parameters (`sap_horizon` and `sap_horizon_dark` in `SAP/theming-base-content`). They are the same in both brands.
- **The brand group** is the only part that changes between Orange and GCSA.
- **Three values differ from Horizon on purpose**, so that text keeps 4.5:1 on pressed rows:

| Token | Horizon value | Our value | Reason |
|---|---|---|---|
| `surface.cardPressed` (light) | `#EAECEE` | `#F2F4F5` | Status text dropped below 4.5:1 on the darker pressed row |
| `status.critical.text` (light) | `#B95100` | `#AA4A00` | 4.42:1 on the pressed row, now 5.0:1 or more |
| `status.informative.text` (light) | `#0070F2` | `#0064D9` | Uses `sapContent_Selected_ForegroundColor`, which meets 4.5:1 as text |

### 3.2 Reference palettes

**Orange** (template brand). `600` is the classic accent.

| Step | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
|---|---|---|---|---|---|---|---|---|---|---|
| Hex | `#FFF4E6` | `#FFE4C0` | `#FFD399` | `#FFC172` | `#FFB04B` | `#FFA733` | `#F69000` | `#DD8200` | `#A85000` | `#924F00` |

Extra values: dark subtle `#3D2510`, dark subtle strong `#4F3015`, secondary yellow `#F6C624` (decoration only).

**GCSA navy**, sampled from the association's logo. `600` is the logo navy.

| Step | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
|---|---|---|---|---|---|---|---|---|---|---|
| Hex | `#EEEFFA` | `#D6D7F2` | `#B3B5E8` | `#9DA0F0` | `#7175D6` | `#4A4EBF` | `#2E3192` | `#262879` | `#1E1F60` | `#161747` |

Extra values: dark subtle `#23254F`, dark subtle strong `#2D3066`.

**GCSA grey**, sampled from the association's logo. `400` is the logo grey.

| Step | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
|---|---|---|---|---|---|---|---|---|---|---|
| Hex | `#F4F4F5` | `#E6E7E8` | `#CFD0D2` | `#B9BBBD` | `#A7A9AC` | `#8C8F93` | `#6E7175` | `#5C5F63` | `#3F4245` | `#26282A` |

**Ink** `#131E29` is Horizon's text colour. It is the text colour on every bright fill.

**Chart palette** (Horizon `sapChart_OrderedColor_1` to `12`). Use the series in order and never pick colours by taste.

| Mode | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Light | `#168EFF` | `#C87B00` | `#75980B` | `#DF1278` | `#8B47D7` | `#049F9A` | `#0070F2` | `#CC00DC` | `#798C77` | `#DA6C6C` | `#5D36FF` | `#A68A5B` |
| Dark | `#3278BE` | `#F2A634` | `#B4CE35` | `#FA4F96` | `#8B47D7` | `#049F9A` | `#0070F2` | `#F31DED` | `#8EA18C` | `#F28585` | `#7858FF` | `#A68A5B` |

**Avatar palette** (Horizon `sapAvatar_1` to `9`). Pick by a stable hash of the person's or customer's id, so the same person always gets the same colour.

| Mode | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| Light | `#FFF3B8` | `#FFD0E7` | `#FFDBE7` | `#FFDCF3` | `#DED3FF` | `#D1EFFF` | `#C2FCEE` | `#EBF5CB` | `#DDCCF0` |
| Dark | `#AE4000` | `#890506` | `#B40569` | `#8700B8` | `#470CF1` | `#0054CC` | `#036573` | `#236C39` | `#4E247A` |

Avatar initials use `text.primary` in light mode and `#FFFFFF` (`overlay.onImage`) in dark mode.

### 3.3 Semantic tokens for all four themes

Generated from `buildTokens()`. Regenerate this section whenever `semantic.ts` changes.


#### brand

| Token | Orange light | Orange dark | GCSA light | GCSA dark |
|---|---|---|---|---|
| `brand.fill` | `#F69000` | `#FFA733` | `#2E3192` | `#9DA0F0` |
| `brand.onFill` | `#131E29` | `#131E29` | `#FFFFFF` | `#131E29` |
| `brand.fillPressed` | `#DD8200` | `#F69000` | `#262879` | `#B3B5E8` |
| `brand.tint` | `#A85000` | `#FFA733` | `#2E3192` | `#9DA0F0` |
| `brand.subtle` | `#FFF4E6` | `#3D2510` | `#EEEFFA` | `#23254F` |
| `brand.subtleStrong` | `#FFD399` | `#4F3015` | `#D6D7F2` | `#2D3066` |
| `brand.secondary` | `#F6C624` | `#F6C624` | `#A7A9AC` | `#A7A9AC` |
| `brand.secondaryText` | `#924F00` | `#F6C624` | `#5C5F63` | `#A7A9AC` |

#### destructive

| Token | Orange light | Orange dark | GCSA light | GCSA dark |
|---|---|---|---|---|
| `destructive.fill` | `#AA0808` | `#FA6161` | `#AA0808` | `#FA6161` |
| `destructive.onFill` | `#FFFFFF` | `#131E29` | `#FFFFFF` | `#131E29` |
| `destructive.fillPressed` | `#8A0606` | `#FF8A8A` | `#8A0606` | `#FF8A8A` |

#### background

| Token | Orange light | Orange dark | GCSA light | GCSA dark |
|---|---|---|---|---|
| `background.base` | `#F5F6F7` | `#12171C` | `#F5F6F7` | `#12171C` |
| `background.grouped` | `#F2F2F7` | `#12171C` | `#F2F2F7` | `#12171C` |
| `background.shell` | `#EFF1F2` | `#12171C` | `#EFF1F2` | `#12171C` |

#### surface

| Token | Orange light | Orange dark | GCSA light | GCSA dark |
|---|---|---|---|---|
| `surface.card` | `#FFFFFF` | `#1D232A` | `#FFFFFF` | `#1D232A` |
| `surface.cardPressed` | `#F2F4F5` | `#222B35` | `#F2F4F5` | `#222B35` |
| `surface.cardActive` | `#DEE2E5` | `#2A3440` | `#DEE2E5` | `#2A3440` |
| `surface.selected` | `#EBF8FF` | `#1D2D3E` | `#EBF8FF` | `#1D2D3E` |
| `surface.field` | `#FFFFFF` | `#161C22` | `#FFFFFF` | `#161C22` |
| `surface.fieldReadOnly` | `#EAECEE` | `#242E38` | `#EAECEE` | `#242E38` |
| `surface.sheet` | `#FFFFFF` | `#1D232A` | `#FFFFFF` | `#1D232A` |
| `surface.header` | `#FFFFFF` | `#1D232A` | `#FFFFFF` | `#1D232A` |
| `surface.tabBar` | `#FFFFFF` | `#1D232A` | `#FFFFFF` | `#1D232A` |
| `surface.inverse` | `#131E29` | `#F5F6F7` | `#131E29` | `#F5F6F7` |

#### text

| Token | Orange light | Orange dark | GCSA light | GCSA dark |
|---|---|---|---|---|
| `text.primary` | `#131E29` | `#F5F6F7` | `#131E29` | `#F5F6F7` |
| `text.secondary` | `#556B82` | `#8396A8` | `#556B82` | `#8396A8` |
| `text.placeholder` | `#556B82` | `#8396A8` | `#556B82` | `#8396A8` |
| `text.disabled` | `rgba(19,30,41,0.6)` | `rgba(245,246,247,0.6)` | `rgba(19,30,41,0.6)` | `rgba(245,246,247,0.6)` |
| `text.inverse` | `#FFFFFF` | `#1D232A` | `#FFFFFF` | `#1D232A` |
| `text.required` | `#BA066C` | `#FF78A4` | `#BA066C` | `#FF78A4` |

#### icon

| Token | Orange light | Orange dark | GCSA light | GCSA dark |
|---|---|---|---|---|
| `icon.primary` | `#131E29` | `#F5F6F7` | `#131E29` | `#F5F6F7` |
| `icon.secondary` | `#758CA4` | `#A9B4BE` | `#758CA4` | `#A9B4BE` |

#### border

| Token | Orange light | Orange dark | GCSA light | GCSA dark |
|---|---|---|---|---|
| `border.divider` | `#E5E5E5` | `#2E3742` | `#E5E5E5` | `#2E3742` |
| `border.separator` | `#D9D9D9` | `#3C4957` | `#D9D9D9` | `#3C4957` |
| `border.field` | `#556B81` | `#A9B4BE` | `#556B81` | `#A9B4BE` |
| `border.fieldFocus` | `#0032A5` | `#9AD3FF` | `#0032A5` | `#9AD3FF` |
| `border.button` | `#BCC3CA` | `#3A4A5A` | `#BCC3CA` | `#3A4A5A` |

#### status

| Token | Orange light | Orange dark | GCSA light | GCSA dark |
|---|---|---|---|---|
| `status.negative.text` | `#AA0808` | `#FA6161` | `#AA0808` | `#FA6161` |
| `status.negative.element` | `#F53232` | `#FA6161` | `#F53232` | `#FA6161` |
| `status.negative.background` | `#FFEAF4` | `#350000` | `#FFEAF4` | `#350000` |
| `status.negative.border` | `#E90B0B` | `#FA6161` | `#E90B0B` | `#FA6161` |
| `status.critical.text` | `#AA4A00` | `#FFDF72` | `#AA4A00` | `#FFDF72` |
| `status.critical.element` | `#E76500` | `#F7BF00` | `#E76500` | `#F7BF00` |
| `status.critical.background` | `#FFF8D6` | `#382700` | `#FFF8D6` | `#382700` |
| `status.critical.border` | `#DD6100` | `#F7BF00` | `#DD6100` | `#F7BF00` |
| `status.positive.text` | `#256F3A` | `#97DD40` | `#256F3A` | `#97DD40` |
| `status.positive.element` | `#30914C` | `#6DAD1F` | `#30914C` | `#6DAD1F` |
| `status.positive.background` | `#F5FAE5` | `#11331A` | `#F5FAE5` | `#11331A` |
| `status.positive.border` | `#30914C` | `#6DAD1F` | `#30914C` | `#6DAD1F` |
| `status.informative.text` | `#0064D9` | `#4DB1FF` | `#0064D9` | `#4DB1FF` |
| `status.informative.element` | `#0070F2` | `#4DB1FF` | `#0070F2` | `#4DB1FF` |
| `status.informative.background` | `#E1F4FF` | `#00144A` | `#E1F4FF` | `#00144A` |
| `status.informative.border` | `#0070F2` | `#4DB1FF` | `#0070F2` | `#4DB1FF` |
| `status.neutral.text` | `#556B82` | `#A9B4BE` | `#556B82` | `#A9B4BE` |
| `status.neutral.element` | `#788FA6` | `#A9B4BE` | `#788FA6` | `#A9B4BE` |
| `status.neutral.background` | `#EFF1F2` | `#242E38` | `#EFF1F2` | `#242E38` |
| `status.neutral.border` | `#788FA6` | `#A9B4BE` | `#788FA6` | `#A9B4BE` |

#### control

| Token | Orange light | Orange dark | GCSA light | GCSA dark |
|---|---|---|---|---|
| `control.thumb` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
| `control.trackOff` | `#788FA6` | `#8396A8` | `#788FA6` | `#8396A8` |

#### interaction

| Token | Orange light | Orange dark | GCSA light | GCSA dark |
|---|---|---|---|---|
| `interaction.focus` | `#0032A5` | `#9AD3FF` | `#0032A5` | `#9AD3FF` |
| `interaction.pressedOverlay` | `rgba(19,30,41,0.08)` | `rgba(245,246,247,0.12)` | `rgba(19,30,41,0.08)` | `rgba(245,246,247,0.12)` |

#### overlay

| Token | Orange light | Orange dark | GCSA light | GCSA dark |
|---|---|---|---|---|
| `overlay.scrim` | `rgba(0,0,0,0.4)` | `rgba(0,0,0,0.6)` | `rgba(0,0,0,0.4)` | `rgba(0,0,0,0.6)` |
| `overlay.onImage` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
| `overlay.onBrandSubtle` | `rgba(255,255,255,0.2)` | `rgba(255,255,255,0.12)` | `rgba(255,255,255,0.2)` | `rgba(255,255,255,0.12)` |
| `overlay.imageBackdrop` | `#000000` | `#000000` | `#000000` | `#000000` |

#### Key contrast pairs

| Token | Orange light | Orange dark | GCSA light | GCSA dark |
|---|---|---|---|---|
| brand.onFill on brand.fill | 7.15:1 | 8.69:1 | 10.66:1 | 7.00:1 |
| destructive.onFill on destructive.fill | 7.64:1 | 5.58:1 | 7.64:1 | 5.58:1 |
| brand.tint on surface.card | 5.51:1 | 8.16:1 | 10.66:1 | 6.58:1 |
| brand.tint on background.base | 5.09:1 | 9.29:1 | 9.85:1 | 7.48:1 |
| brand.secondaryText on surface.card | 6.29:1 | 9.82:1 | 6.42:1 | 6.72:1 |
| text.primary on surface.card | 16.86:1 | 14.64:1 | 16.86:1 | 14.64:1 |
| text.secondary on surface.card | 5.51:1 | 5.20:1 | 5.51:1 | 5.20:1 |
| text.secondary on surface.cardPressed | 4.99:1 | 4.71:1 | 4.99:1 | 4.71:1 |
| status.negative.text on surface.card | 7.64:1 | 5.24:1 | 7.64:1 | 5.24:1 |
| status.critical.text on surface.card | 5.69:1 | 12.10:1 | 5.69:1 | 12.10:1 |
| status.positive.text on surface.card | 6.15:1 | 9.60:1 | 6.15:1 | 9.60:1 |
| status.informative.text on surface.card | 5.49:1 | 6.82:1 | 5.49:1 | 6.82:1 |
| border.field on surface.field | 5.52:1 | 8.14:1 | 5.52:1 | 8.14:1 |

Elevation tokens `shadow[0]` to `shadow[4]`, `interaction.focusWidth` (2), `interaction.disabledOpacity` (0.4), `chart`, `avatar` and `statusBarStyle` (`dark-content` in light mode, `light-content` in dark mode) are also part of every theme.

### 3.4 What each token is for

| Token | Use for | Never use for |
|---|---|---|
| `background.base` | Screen background behind cards and lists | Cards, sheets |
| `background.grouped` | Settings-style grouped lists (light grey in light mode) | Content lists |
| `background.shell` | Area behind the app bar and tab bar when they are not white | Content |
| `surface.card` | Cards, list rows, sections, object headers | Screen background |
| `surface.cardPressed` | A row or card while pressed | Selection |
| `surface.cardActive` | A row held in a long press or being dragged | Hover |
| `surface.selected` | Selected rows in a multi-select list | Brand highlight |
| `surface.field` / `fieldReadOnly` | Editable and read-only input backgrounds | Cards |
| `surface.sheet` / `header` / `tabBar` | Bottom sheets and dialogs, app bars, the tab bar | |
| `surface.inverse` | Snackbars and tooltips, with `text.inverse` | Cards |
| `control.thumb` / `trackOff` | Switch thumb and slider knob; switch track when off (track on is `brand.fill`) | Text |
| `text.primary` | Titles, values, body text | Text on a brand fill |
| `text.secondary` | Labels, secondary lines, timestamps, section headers | Disabled text |
| `text.placeholder` | Input placeholders | Values |
| `text.disabled` | Text of disabled controls | Read-only values (they are `text.primary`) |
| `text.inverse` | Text on an inverse surface such as a snackbar | Text on a brand fill |
| `text.required` | The required-field asterisk only | Errors |
| `icon.primary` | Actionable icons and icons beside primary text | |
| `icon.secondary` | Decorative and non-interactive icons, chevrons | Actionable icons alone |
| `border.divider` | Hairlines between rows | Field outlines |
| `border.separator` | Toolbar and section separators | |
| `border.field` | Input outlines (meets 3:1) | Cards |
| `border.fieldFocus` | Focused input outline | Brand decoration |
| `border.button` | Outline of secondary buttons and segmented controls | |
| `brand.fill` | Primary buttons, selected segment, active step, FAB, switch track on | Large areas, backgrounds, text |
| `brand.onFill` | Text and icons on `brand.fill` | Anything else |
| `brand.fillPressed` | `brand.fill` while pressed | |
| `brand.tint` | Links, tertiary buttons, selected tab, brand icons, active filter text | Status meaning |
| `brand.subtle` | Selected chip or option background, today's date, brand info panels | Status backgrounds |
| `brand.subtleStrong` | Pressed `brand.subtle`, progress track | |
| `brand.secondary` | Decoration, brand rules, borders | Text (fails contrast in light mode) |
| `destructive.fill` / `onFill` / `fillPressed` | Filled button that confirms a destructive action | Status display |
| `brand.secondaryText` | Text and icons in the secondary colour | |
| `status.*.text` | Status words and icons on surfaces (4.5:1) | Fills |
| `status.*.element` | Progress bars, dots, chart marks, icons beside a label (3:1) | Body text |
| `status.*.background` | Tinted container behind status text: banners, message strips, tags | Whole screens |
| `status.*.border` | Border of a status container, invalid field outline | |
| `interaction.focus` | Focus ring, 2 px | |
| `interaction.pressedOverlay` | Overlay on images and custom fills while pressed | Rows (use `surface.cardPressed`) |
| `overlay.scrim` | Dim layer behind dialogs and sheets | |
| `overlay.onImage` | Text and icons over photos and dark gradients | |
| `overlay.onBrandSubtle` | Translucent buttons on a brand-filled header | |
| `overlay.imageBackdrop` | Full-screen photo viewer | Any other background |

### 3.5 Status colours

| Status | Meaning in this app | Examples | Icon (MaterialCommunityIcons) |
|---|---|---|---|
| Negative | Failed, blocked, rejected, out of stock, overdue, error | Cancelled order, failed print job, sensor alarm, invalid field | `alert-circle` |
| Critical | Needs attention soon | Low stock, pending approval, session expiring, sensor near limit | `alert` |
| Positive | Done and good | Dispatched, paid, approved, saved, synced | `check-circle` |
| Informative | Neutral news or in progress | Processing, draft saved on device, a new version available | `information` |
| Neutral | No judgement | Open, new, archived, not started | `circle-outline` |

Rules:

- Status words are always visible. A coloured dot alone is not a status.
- Brand colour never shows status. In the Orange brand, critical status (`#AA4A00`, `#E76500`) and the brand orange are close, so critical items must always carry the critical icon and its word.
- A list shows at most one status per row. Put the most severe one in the row, and the rest on the object page.
- Statuses used in the app map as follows:

| Object | Value | Status | Word on screen |
|---|---|---|---|
| Order | `PENDING`, `OPEN` | Neutral | Open |
| Order | no lines | Neutral | Empty |
| Order line | `partial` (partly dispatched) | Critical | Partly dispatched |
| Order, order line | `DISPATCHED`, `fulfilled`, `completed` | Positive | Dispatched |
| Stock (order lines, items, GRN items) | quantity left ≥ 20% of received | Positive | In stock |
| Stock | quantity left > 0 and < 20% of received (`LOW_STOCK_RATIO` in `src/utils/stockStatus.ts`) | Critical | Low stock |
| Stock of an item someone wants to dispatch | 0 left | Negative | Out of stock |
| GRN, GRN item | 0 left because everything was dispatched | Neutral | Fully dispatched |
| GRN | not invoiced / invoiced | Critical / Positive | Not invoiced / Invoiced |
| Invoice | `pending` / `paid` | Critical / Positive | Pending / Paid |
| Dispatch (activity report) | has quantity / no quantity | Positive / Critical | Complete / Pending |
| Stock age | 0–120 / 121–240 / 241–364 / over 364 days | Positive / Informative / Critical / Negative | 0–120 days … |
| Sensor health | `healthy` / `warning` / `critical` | Positive / Critical / Negative | Healthy / Warning / Critical |
| Sensor battery | `GOOD` / `LOW` / `CRITICAL` | Positive / Critical / Negative | In lists: Battery good / Battery low / Battery critical. In a row labelled Battery: Good / Low / Critical |
| Sensor connection | online / stale / offline | Positive / Critical / Negative | Online / No recent data / Offline |
| Printer | online / busy / offline or error | Positive / Informative / Negative | Online / Busy / Offline |
| Print job | `pending` / `printing` / `completed` / `failed` / `cancelled` | Neutral / Informative / Positive / Negative / Neutral | Waiting / Printing / Printed / Failed / Cancelled |
| Image upload | `pending` / `uploading` / `completed` / `failed` | Neutral / Informative / Positive / Negative | Waiting / Uploading / Uploaded / Upload failed |
| Facility access (enrollment) | requested / approved / rejected / revoked | Critical / Positive / Negative / Negative | Requested / Approved / Not approved / Revoked |
| Customer, item, user | active / inactive | no tag / Neutral | Inactive |
| Operation result | `success` / `error` | Positive / Negative | — |

Show every status with the `StatusTag` component (`@/components/ui`), which pairs the word with the standard icon above.

Not statuses, so never status-coloured by meaning:

- **Categories** such as user roles, price types or packaging: neutral tags (`status="neutral"`, usually `icon={null}`). At most one category in a set may use informative to stand out. Never brand colours.
- **Item details** on cells (weight, rack, mark, photos) are neutral `StatusTag`s with their glyph, worded the same everywhere: "1,250.5 kg", "Rack B-14", "Mark PT", "3 photos". On object pages, contact and metadata facts use `InfoChip`.
- **A row being edited** in a list: `surface.selected` background and an informative "Editing" tag.
- **A row already in the current order**: `brand.subtle` background, a 4 px `brand.tint` bar on the leading edge and an "In order" tag with a check.
- **A value changed from its default**: a "Custom" tag in `brand.subtle` with `brand.tint` text and `pencil-outline`.

A new status value gets a row here before it ships.

### 3.6 Dos and don'ts

- **Do** put dark ink on bright orange. White on `#F69000` is 2.36:1 and fails.
- **Do** use `brand.tint`, not `brand.fill`, for brand text and icons. Orange `#F69000` as text on white is 2.18:1.
- **Do** keep large areas neutral. Brand colour is for the primary action, the selected state and a little identity.
- **Don't** use GCSA grey `#A7A9AC` for text in light mode. It is 2.36:1 on white. Use `brand.secondaryText`.
- **Don't** invent tints with opacity, such as `brand.fill + '20'`. Use `brand.subtle` or the status background.
- **Don't** use pure black or pure white backgrounds. Use `background.base` and `surface.card`.
- **Don't** change status colours per brand or per screen.

---

## 4. Typography

The app uses the system font (San Francisco on iOS, Roboto on Android). Fiori's own typeface "72" is not bundled, and Fiori for iOS and Android allows the platform font. Text styles map one to one onto the platform text styles.

| Style | Size / line height | Weight | Use |
|---|---|---|---|
| `largeTitle` | 34 / 41 | 700 | Large-title navigation bars on top-level screens |
| `title1` | 28 / 34 | 700 | Sign-in title, hero numbers |
| `title2` | 22 / 28 | 700 | Object page title, dialog title |
| `title3` | 20 / 25 | 600 | Section titles, KPI values |
| `headline` | 17 iOS, 16 Android / 22 | 600 | Object cell titles, emphasised row text |
| `body` | 17 iOS, 16 Android / 22 | 400 | Reading text, field values |
| `callout` | 16 / 21 | 500 | Button labels, controls |
| `subhead` | 15 / 20 | 400 | Secondary row text, descriptions |
| `footnote` | 13 / 18 | 400 | Helper and error text, section headers in capitals |
| `caption1` | 12 / 16 | 400 | Timestamps, chip and badge text |
| `caption2` | 11 / 13 | 400 | Tab bar labels; the smallest text allowed |

Weights: regular 400, medium 500, semibold 600, bold 700. Nothing lighter than 400 and nothing heavier than 700, except `typography.wordmark` (800), which only `BrandMark` uses.

Rules:

- **Spread a style, then set the colour.** `{ ...typography.subhead, color: t.text.secondary }`. Never set a bare `fontSize`.
- **Allow font scaling.** Never set `allowFontScaling={false}` on reading text. Cap it with `maxFontSizeMultiplier={1.6}` only on tab labels, chips and badges, where space is fixed.
- **Numbers line up.** Use `fontVariant: ['tabular-nums']` for quantities, weights, money and table columns.
- **Text wraps rather than clips.** Titles get two lines, then an ellipsis. Values such as amounts and IDs never truncate. Let the label wrap instead.
- **Section headers** use `footnote`, capitals, `text.secondary`, letter spacing 0.5.
- **Emphasis** uses weight 600, never colour alone and never italics.

---

## 5. Spacing and layout

### 5.1 Spacing scale

| Token | `none` | `xxs` | `xs` | `s6` | `sm` | `md` | `lg` | `xl` | `xxl` | `xxxl` | `huge` | `giant` | `max` |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| dp | 0 | 2 | 4 | 6 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 64 |

| Spacing | Value |
|---|---|
| Screen side margin, phone | `layout.marginCompact` 16 |
| Screen side margin, tablet | `layout.marginRegular` 20 |
| Card inner padding | `lg` 16 |
| Between cards in a list | `sm` 8 |
| Between sections | `xxl` 24 |
| Between a label and its field | `xs` 4 |
| Between fields in a form | `lg` 16 |
| Between buttons side by side | `sm` 8 |
| Icon to its text | `sm` 8 |
| Chip padding | 6 vertical, 12 horizontal |

### 5.2 Layout

- **Width.** Content is at most `layout.maxContentWidth` (672) wide and centred on tablets. Forms such as sign-in are at most `layout.maxFormWidth` (420).
- **Safe areas.** Every screen uses `SafeAreaView` or safe-area insets. Nothing interactive sits under the status bar, the notch, the home indicator or the Android gesture bar. Bottom action bars add the bottom inset to their padding.
- **Edge to edge.** Android draws behind the system bars. Set the status bar style with `EdgeToEdgeStatusBar` and pass `tokens.statusBarStyle`, never a fixed `dark-content` or `light-content`. A screen with a brand-filled header uses `dark-content` when `brand.onFill` is ink and `light-content` when it is white. A photo header uses `light-content`.
- **Keyboard.** Forms scroll so the focused field and the primary action stay visible. Use `KeyboardAvoidingView` on iOS and `adjustResize` on Android.
- **Rows.** Single-line rows are at least `layout.rowMinHeight` (44). Object cells are at least `layout.objectCellMinHeight` (72).
- **Grids.** KPI cards are two columns on phones and four on tablets. Image grids are three columns on phones.
- **Density.** Phones use the default (cozy) density. Tables may use compact rows of 36 only when every cell is read-only.
- **Orientation.** Phones are portrait. Tablets support both orientations.

---

## 6. Shape

| Token | Radius | Use |
|---|---|---|
| `radius.none` | 0 | Full-width rows in grouped lists, table cells |
| `radius.field` | 4 | Inputs, checkboxes, small tags |
| `radius.button` | 8 | Buttons, segmented controls, banners, message strips |
| `radius.card` | 12 | Cards, KPI tiles, image thumbnails, dialogs |
| `radius.sheet` | 16 | Top corners of bottom sheets, the brand mark panel |
| `radius.pill` | 9999 | Chips, badges, avatars, progress bars, switches |

Borders are hairlines (`StyleSheet.hairlineWidth`) for dividers, 1 for fields and outlined buttons, and 2 for focus and invalid fields.

---

## 7. Elevation

Fiori uses five levels. Spread `t.shadow[n]`, which carries the iOS shadow and the Android `elevation`. Dark mode uses stronger shadows automatically.

| Level | Offset / blur / opacity (light) | Use |
|---|---|---|
| 0 | none | Headers, app bar, rows inside a card, anything on `background.grouped` |
| 1 | 1 / 2 / 0.12 | Raised rows, pressed cards, chips that can be dragged |
| 2 | 2 / 6 / 0.16 | Cards, KPI tiles, the tab bar |
| 3 | 6 / 16 / 0.20 | Snackbars, toasts, menus, the floating action button |
| 4 | 10 / 30 / 0.25 | Bottom sheets, dialogs, popovers |

Rules:

- A card on a card has no shadow. Separate with a divider instead.
- In dark mode, depth also comes from surface colour: `surface.card` is lighter than `background.base`.
- Never draw a shadow under text or icons.

---

## 8. Iconography

- **One set.** Use MaterialCommunityIcons: `import Icon from 'react-native-vector-icons/MaterialCommunityIcons'`. `Button`, `ConfirmDialog` and `ListEmptyState` take MaterialCommunityIcons names.
- **Sizes.** `iconSize.sm` 16 inline with caption text, `md` 20 in rows and inputs, `lg` 24 in toolbars, tabs and buttons, `xl` 32 in empty states and KPI tiles, `hero` 48 in full-screen states.
- **Colour.** `icon.primary` when the icon is the action or carries meaning, `icon.secondary` when it decorates, `brand.tint` for brand actions, `status.*.text` for status, `brand.onFill` on fills.
- **Touch area.** An icon button is at least `touchTarget` square (44 iOS, 48 Android), even if the glyph is 24. Use `hitSlop` when space is tight.
- **Labels.** Every icon-only button has an `accessibilityLabel` that names the action ("Delete item", not "Trash").
- **Style.** Outline glyphs by default, filled glyphs for the selected tab and for a selected state.
- **Tags.** Icons inside caption-sized tags and badges use `iconSize.xs` (12).
- **Back on headerless screens.** Screens that hide the stack header (OTP, customer order page, object pages with hero headers) draw their own back control: the platform glyph (`chevron-left` on iOS, `arrow-left` on Android) in `brand.tint` with the word "Back", at least `touchTarget` in size. Everywhere else, use the stack header's back button.
- **One icon set.** Ionicons is not used; the lint guard rejects `@expo/vector-icons` imports.

Standard glyphs:

| Meaning | Glyph |
|---|---|
| Add | `plus` |
| Edit | `pencil-outline` |
| Delete | `trash-can-outline` |
| Search | `magnify` |
| Filter | `filter-variant` |
| Sort | `sort` |
| Share | `share-variant-outline` |
| Print | `printer-outline` |
| More actions | `dots-vertical` (Android), `dots-horizontal` (iOS) |
| Close | `close` |
| Back | platform back button; on headerless screens see the rule above |
| Next / drill down | `chevron-right` |
| Order | `clipboard-list-outline` |
| GRN (goods received) | `package-down` |
| Dispatch | `truck-delivery-outline` |
| Invoice | `file-document-outline` |
| Customer | `account-outline` |
| Item | `cube-outline` |
| Stock | `warehouse` |
| Rack or chamber | `view-grid-outline` |
| Sensor | `thermometer` |
| Report | `chart-box-outline` |
| Settings | `cog-outline` |
| Facility | `office-building-outline` |
| Offline | `cloud-off-outline` |
| Call | `phone-outline` |

---

## 9. Motion

| Token | Duration | Use |
|---|---|---|
| `motion.fast` | 100 ms | Press feedback, switches, checkboxes |
| `motion.standard` | 200 ms | Expanding sections, chips appearing, snackbars |
| `motion.slow` | 300 ms | Bottom sheets, dialogs, screen transitions |

- Use ease-out for things entering and ease-in for things leaving.
- Use the native stack transitions. Do not build custom screen transitions.
- Respect Reduce Motion. When `AccessibilityInfo.isReduceMotionEnabled()` is true, replace slides and springs with fades and stop skeleton shimmer.
- Haptics: light impact on a successful save or a switch toggle, notification error on a failed save. Never on scroll, tab changes, filter edits, selections, expanding rows or ordinary button presses. The one exception is the A–Z index rail, which ticks as the finger crosses a letter, as the platforms do.
- Nothing animates for longer than 300 ms, and nothing loops except loading indicators.

---

## 10. Interaction states

| State | Rows and cards | Primary button | Secondary and tertiary buttons | Inputs |
|---|---|---|---|---|
| Default | `surface.card` | `brand.fill`, `brand.onFill` | outline `border.button`, text `brand.tint` | `surface.field`, border `border.field` |
| Pressed | `surface.cardPressed` | `brand.fillPressed` | `brand.subtle` background | n/a |
| Focused | 2 px `interaction.focus` ring | 2 px ring outside the button | 2 px ring | border `border.fieldFocus`, 2 px |
| Selected | `surface.selected` plus a check icon | n/a | `brand.subtle` background, `brand.tint` text | n/a |
| Disabled | opacity 0.4, not pressable | opacity 0.4 | opacity 0.4 | opacity 0.4, `text.disabled` |
| Read-only | normal colours, no chevron | n/a | n/a | `surface.fieldReadOnly`, no border, value in `text.primary` |
| Loading | skeleton | spinner in `brand.onFill` plus the loading text, not pressable | spinner in `brand.tint` | spinner at the right edge |
| Error | message strip in `status.negative` | n/a | n/a | border `status.negative.border` 2 px, message in `status.negative.text` with icon |
| Warning | message strip in `status.critical` | n/a | n/a | border `status.critical.border`, message with icon |
| Success | message strip in `status.positive` | n/a | n/a | message in `status.positive.text` with icon |

Rules:

- Pressed feedback shows within 100 ms. Use `Pressable` with a pressed style, not `TouchableOpacity` fading, for rows.
- Disabled controls stay visible only when the user can do something to enable them. Say what, with helper text. Otherwise hide them.
- Never disable the primary button to signal invalid input. Let the user press it, then show every error at once and move focus to the first. The one exception is a bottom sheet with an on-screen number keypad (dispatch lot and item sheets): its Save stays disabled until a quantity is entered, because the sheet has no room for an error message above the keypad.
- Selection always has a non-colour cue: a check icon, a filled radio, or a bold label.


---

## 11. Accessibility

The target is WCAG 2.2 level AA, which is what SAP's Horizon themes meet.

### 11.1 Contrast

| What | Minimum | Checked by |
|---|---|---|
| Text under 18.66 px bold or 24 px regular | 4.5:1 | contrast test |
| Large text | 3:1 | contrast test |
| Icons that carry meaning, field borders, focus rings, selected-state indicators | 3:1 | contrast test |
| Decorative elements, disabled controls | none | n/a |

Every token pair in [3.3](#33-semantic-tokens-for-all-four-themes) is tested in all four themes by `src/theme/tokens/__tests__/contrast.test.ts`. The key pairs:


| Token | Orange light | Orange dark | GCSA light | GCSA dark |
|---|---|---|---|---|
| brand.onFill on brand.fill | 7.15:1 | 8.69:1 | 10.66:1 | 7.00:1 |
| destructive.onFill on destructive.fill | 7.64:1 | 5.58:1 | 7.64:1 | 5.58:1 |
| brand.tint on surface.card | 5.51:1 | 8.16:1 | 10.66:1 | 6.58:1 |
| brand.tint on background.base | 5.09:1 | 9.29:1 | 9.85:1 | 7.48:1 |
| brand.secondaryText on surface.card | 6.29:1 | 9.82:1 | 6.42:1 | 6.72:1 |
| text.primary on surface.card | 16.86:1 | 14.64:1 | 16.86:1 | 14.64:1 |
| text.secondary on surface.card | 5.51:1 | 5.20:1 | 5.51:1 | 5.20:1 |
| text.secondary on surface.cardPressed | 4.99:1 | 4.71:1 | 4.99:1 | 4.71:1 |
| status.negative.text on surface.card | 7.64:1 | 5.24:1 | 7.64:1 | 5.24:1 |
| status.critical.text on surface.card | 5.69:1 | 12.10:1 | 5.69:1 | 12.10:1 |
| status.positive.text on surface.card | 6.15:1 | 9.60:1 | 6.15:1 | 9.60:1 |
| status.informative.text on surface.card | 5.49:1 | 6.82:1 | 5.49:1 | 6.82:1 |
| border.field on surface.field | 5.52:1 | 8.14:1 | 5.52:1 | 8.14:1 |

A new semantic token, a new brand or a changed value must be added to the test, and the test must pass, before merge.

### 11.2 Touch targets and spacing

- Every pressable element has a touch area of at least 44 × 44 pt on iOS and 48 × 48 dp on Android (`touchTarget`).
- Adjacent targets are at least 8 apart, or their touch areas do not overlap.
- Destructive actions are never the nearest target to a common one. Put Delete at the end of a menu or behind a confirmation.

### 11.3 Screen readers

- Every pressable element has `accessibilityRole` (`button`, `link`, `tab`, `switch`, `checkbox`, `radio`, `header`, `image`) and an `accessibilityLabel` when its text is not enough.
- State goes in `accessibilityState`: `selected`, `checked`, `disabled`, `busy`, `expanded`.
- A row reads as one element: "Order 1042, Patel Traders, 120 bags, Pending". Group it with `accessible` and a combined label.
- Section titles have `accessibilityRole="header"`.
- Errors are announced. After a failed submit, call `AccessibilityInfo.announceForAccessibility` with the error count and move focus to the first invalid field.
- Images of documents and goods have a label naming what they show ("Photo of lot mark, GRN 311"). Decorative images are hidden with `accessible={false}` and `importantForAccessibility="no"`.
- Charts have a text summary and a table alternative.

### 11.4 Text size

- All text scales with the system setting. Test at the largest size on both platforms.
- Layouts reflow at large sizes. Two-column key-value rows switch to stacked, and button rows stack vertically.
- Never put text in images.

### 11.5 Colour and motion

- Colour is never the only signal. Status has an icon or word, links are underlined or obviously actions, selected items have a check or a bold label, and chart series have labels.
- Respect Reduce Motion (see [Motion](#9-motion)).
- Respect the device's Bold Text and Increase Contrast settings where React Native exposes them.

---

## 12. Content and wording

### 12.1 Voice

Plain, short and polite. Write for a busy warehouse worker on a phone, many of whom read English as a second language.

- Sentence case for everything: titles, buttons, labels, menus. "Create dispatch", not "Create Dispatch".
- Buttons start with a verb and name the result: "Save GRN", "Send code", "Print invoice". Avoid "OK", "Submit" and "Yes" when a verb fits.
- Use the words of the business: order, GRN, dispatch, invoice, lot, rack, chamber, bags, weight. Do not mix "delivery note" and "dispatch".
- Use "you" for the user. Avoid "please" except when asking a favour, such as "Please wait while the facility approves your access".
- No developer text: no error codes alone, no stack traces, no "null", "undefined", "NaN", HTTP status numbers or JSON. Log those for support instead.

### 12.2 Messages

| Kind | Pattern | Example |
|---|---|---|
| Error | What happened. What to do. | "Couldn't save the GRN. Check your connection and try again." |
| Field error | What is wrong with this field | "Enter a 10-digit mobile number." |
| Empty list | What would be here. How to add one. | "No dispatches yet. Dispatches you create appear here." |
| Empty search | What matched nothing. How to widen. | "No customers match "pat". Try fewer letters." |
| Confirmation | Question naming the object and the consequence | "Delete GRN 311? Its items will be removed from stock." |
| Success | Past tense, the object | "GRN 311 saved." |
| Offline | State plus what still works | "You're offline. Changes are saved on this phone and sent when you reconnect." |

Confirmation buttons repeat the verb: "Delete GRN" and "Cancel", never "Yes" and "No".

### 12.3 Formats

| Data | Format | Example |
|---|---|---|
| Mobile number | +91 prefix shown separately, number grouped 5 + 5 | +91 98765 43210 |
| Money | Indian grouping, rupee sign, two decimals in invoices, none in summaries | ₹1,23,456.50 and ₹1,23,457 |
| Quantity | Number, then unit, singular when 1 | 1 bag, 120 bags |
| Weight | Up to two decimals, unit kg or quintal as the facility sets | 1,250.5 kg |
| Date | Day, short month, year | 9 Oct 2026 |
| Date and time | Date, then 12-hour time | 9 Oct 2026, 4:05 pm |
| Relative time | Under 24 hours only | 5 min ago, 3 h ago, then the date |
| Temperature | One decimal, degree sign, no space | −18.5°C |
| Percent | No decimals except in reports | 85% |
| Document numbers | Type, then number | GRN 311, Invoice 2026-0042 |
| Rack and chamber | Chamber, then rack | Chamber 2 · Rack B-14 |

Use the shared helpers in `src/utils/formatters.ts`; never format by string concatenation or with `toLocaleDateString` (some phones print "Sept" for en-IN).

| Helper | Output |
|---|---|
| `formatDate(d)` | 9 Oct 2026 (details, headers) |
| `formatDate(d, 'short')` | 9 Oct in the current year, else 9 Oct 2026 (list rows) |
| `formatDate(d, 'long')` | 9 October 2026 |
| `formatTime(d)` / `formatDateTime(d)` | 4:05 pm / 9 Oct 2026, 4:05 pm |
| `formatSectionDate(d)` | Today, Yesterday, Tue, 6 Oct |
| `formatMonth(d)` / `'short'` / `'narrow'` | October 2026 (timelines) / Oct 2026 (report rows) / Oct (chart axes) |
| `formatRelativeTime(d)` | 5 min ago, 3 h ago, then the short date |
| `formatMobile(n)` | +91 98765 43210 |
| `formatCount(n, 'item')` | 1 item, 12 items (`formatCount(n, 'dispatch', 'dispatches')`) |
| `formatCurrency(n, { maximumFractionDigits: 0 })` / invoice `formatInvoiceAmount(n)` | ₹1,23,457 in summaries and KPIs / ₹1,23,456.50 on invoices and their rows |
| `formatWeight(n)` | 1,250.5 kg |
| `formatTemperature(n)` | −18.5°C |

Empty values show "—", never "-", "N/A", "null" or "0" for unknown.

Avatars use `Avatar` (or `avatarInitials` and `avatarColors` from `src/utils/avatar.ts`), keyed by the record id, so a person or customer has the same initials and colour on every screen.

---

## 13. Components

Every component below must use semantic tokens and metrics only, follow the states in [Interaction states](#10-interaction-states), and render correctly in all four themes. Paths are under `src/components` unless stated.

### 13.1 Buttons — `ui/Button.tsx`

Anatomy: container, optional left icon, label, optional right icon, optional spinner.

| Type × style | Container | Label and icon | Use |
|---|---|---|---|
| `primary` + `tint` | `brand.fill`, pressed `brand.fillPressed` | `brand.onFill` | The one main action of a screen or dialog |
| `primary` + `negative` | `destructive.fill`, pressed `destructive.fillPressed` | `destructive.onFill` | Confirming a destructive action in a dialog |
| `secondary` + `tint` | transparent, 1 px `border.button` | `brand.tint` | Other actions next to the primary one |
| `secondary` + `normal` | transparent, 1 px `border.button` | `text.primary` | Neutral actions such as Cancel |
| `secondary` + `negative` | transparent, 1 px `status.negative.border` | `status.negative.text` | Destructive actions outside dialogs |
| `tertiary` + `tint` | none | `brand.tint` | Low-emphasis actions, inline links |
| `tertiary` + `negative` | none | `status.negative.text` | Low-emphasis destructive actions |

| Size | Height | Use |
|---|---|---|
| `auto` | 44 iOS / 48 Android, width fits content | Toolbars, inline |
| `compact` | 32, touch area padded to the minimum | Dense rows and chips |
| `standalone` | 48, min width 120 | Forms and dialogs |
| `fullWidth` | 48, full width | The bottom action of a form or sign-in |

Rules: one primary button per view. Label in `callout`, radius `radius.button`. Loading replaces the left icon with a spinner and shows `loadingText`, and the button ignores presses. In a dialog the primary button is on the right on iOS and on the far right on Android; on a full-screen form it is the bottom, full width. The filled negative button uses the `destructive` tokens, not `status.negative.element`: white on Horizon's `#F53232` is only 3.9:1.

React Native Paper buttons and checked controls use Paper's `primary`, which is `brand.fill`. That is a fill colour only: a Paper text-mode button must set `textColor={tokens.brand.tint}`, or orange text fails contrast in Orange light. Prefer `ui/Button`.

### 13.2 Text fields — `ui/Input.tsx`, `GhostTextInput.tsx`, `RemoteAutocompleteInput.tsx`, `form/*`, `FormFieldWrapper.tsx`

Anatomy: label (`FormLabel`), required asterisk, field, optional left and right icons, clear button, helper or error text, optional character count.

| Part | Token |
|---|---|
| Label | `footnote`, `text.secondary`; error `status.negative.text` |
| Asterisk | `text.required` |
| Field background | `surface.field`; read-only `surface.fieldReadOnly` |
| Field border | 1 px `border.field`; focused 2 px `border.fieldFocus`; error 2 px `status.negative.border` |
| Value | `body`, `text.primary` |
| Placeholder | `text.placeholder` |
| Icons | `icon.secondary`; clear button `icon.secondary` |
| Helper | `footnote`, `text.secondary` |
| Error | `footnote`, `status.negative.text`, `alert-circle` icon |
| Character count | `caption1`, `text.secondary`; over the limit `status.negative.text` |

Rules: label above the field, never only a placeholder. Height 44 minimum, radius `radius.field`. Set the right `keyboardType`, `autoComplete`, `textContentType` and `returnKeyType`. Validate on blur and on submit, not on every keystroke. `GhostTextInput` (inline editing in tables) shows its border only when focused. Autocomplete inputs show suggestions in a list under the field or in a bottom sheet with the match highlighted in bold, never in colour alone.

`GhostTextInput` keeps the 1 px field border when it is used as a form field (vehicle registration on the GRN and dispatch headers); it is borderless only inside tables. Editable number cells in tables are borderless `TextInput`s that show a 2 px `border.fieldFocus` border while focused.

### 13.3 Specialised inputs

| Component | Spec |
|---|---|
| `ui/DatePickerInput.tsx` | Looks like a text field with a `calendar-outline` icon; opens the platform picker; shows the date format from [12.3](#123-formats). |
| `DateRangePicker.tsx` | Two date fields, from and to; the to date cannot be before the from date; quick ranges are chips. |
| `ui/CompoundRackInput.tsx` | Rack, floor and chamber pickers side by side, stacked at large text sizes; values shown as "Chamber 2 · Rack B-14". The Android picker dropdown follows the system theme, not the app's. |
| `fiori/StepperInput.tsx` | Minus and plus buttons in `border.button` with `brand.tint` icons, `brand.subtle` while pressed; value in `body` with tabular numbers; the buttons disable at min and max; layouts `stacked`, `inline`, `compact`. |
| `grn/components/item-form/QuantityWeightFields.tsx` | Numeric keypad, unit as a suffix in `text.secondary`, tabular numbers. |
| `grn/components/item-form/RackChamberPicker.tsx` | Floor and chamber are single-choice chips with radio semantics (`brand.subtle` and a check when selected); use a bottom sheet only when there are more than eight options. Wrapping choice chips are at least 36 tall with an 8 gap and `hitSlop` up to `touchTarget`. |
| `grn/components/item-form/ItemSearchField.tsx`, `ItemAutocomplete`, `CustomerAutocomplete`, `UserAutocomplete`, `invoice/components/GRNAutocomplete` | Search field plus suggestion list; recent picks first; empty state "No matches". |
| `grn/components/ImageUploadButton.tsx`, `item-form/MarkImageField.tsx`, `CameraModal.tsx` | Dashed `border.field` tile with `camera-outline` icon and label; upload progress uses `FioriLinearProgress`; failure shows a retry action. |

Sheets with an on-screen keypad (the GRN picker in dispatch) keep the search field directly above the keypad rather than at the top of the sheet.

### 13.4 Selection controls

| Component | Spec |
|---|---|
| `ui/Switch.tsx` | Track on `brand.fill`, off `control.trackOff`; thumb `control.thumb`; label on the left in `body`; the whole row toggles. `useBrandColor={false}` uses `status.positive.element` for a plain on/off. |
| `ui/RadioButton.tsx` (`RadioButton`, `RadioGroup`) | Ring 20 px, 2 px `border.field`; selected ring and dot `brand.tint`; label `body`; the whole row is the target. |
| `SegmentedControl` (same file) | Container `border.button`; selected segment `brand.fill` with `brand.onFill`; others `text.primary`; at most four segments, otherwise use a radio list. |
| `ButtonGroup` (same file) | Like segmented control but allows multi-select; selected options get a check icon. |
| Checkbox | Box `radius.field`, 2 px `border.field`; checked fill `brand.fill`, check `brand.onFill`. |

### 13.5 Chips, badges and indicators

| Component | Spec |
|---|---|
| `FilterChip.tsx` | Pill, `brand.subtle` background, `brand.tint` label in `caption1` weight 600, `close` icon as a 44 px target with label "Remove filter …". |
| `QuickFilterChips.tsx` | Unselected: `surface.card`, 1 px `border.button`, `text.primary`. Selected: `brand.subtle`, `brand.tint`, check icon. Horizontal scroll with 16 side padding. |
| `filters/AppliedFiltersBar.tsx` | Row of `FilterChip`s plus a tertiary "Clear all". |
| `common/overview-tab/InfoChip.tsx` | Neutral tag: `status.neutral.background`, `status.neutral.text`. |
| `ui/StatusTag.tsx` | `status.*.background`, `status.*.text`, the standard icon from [3.5](#35-status-colours) at `iconSize.xs`, `radius.field`, `caption1` weight 600. Use it for every status; do not build local tags. |
| `ui/Fab.tsx` | Floating create button for list reports, see 14.1. |
| `ui/Avatar.tsx` | Initials (first letters of the first two words) on the avatar palette colour for the record id; sizes `sm` 32, `md` 44, `lg` 60. |
| Count badge | A "needs action" count (tab bar items waiting for you) uses `destructive.fill` with `destructive.onFill`. Plain counts (section headers, detail tabs, active filters) use `brand.fill` with `brand.onFill`. Minimum 18 px, `caption2`. |
| `StockIndicator.tsx` | Bar track `brand.subtleStrong`; fill and tag follow the single stock rule in [3.5](#35-status-colours) (in stock, low stock below 20%, out of stock); text "120 of 200 bags" beside it; `flashRed` pulses once, not in a loop. |
| `FioriLinearProgress.tsx` | Height 4 (default) or 8 (prominent), pill radius; track `brand.subtleStrong` or the status background with `coloredTrack`; fill `brand.fill` (`default`) or `status.*.element` (`success`, `warning`, `error`, `info`); percentage in `caption1`. Segmented progress uses chart colours in order. |

### 13.6 Cells, cards and lists

| Component | Spec |
|---|---|
| Object cell (list rows in `list-items/*`, `OrderItemCard`, `DispatchGroupCard`, `DispatchHistoryCard`, `CustomerOrderGroupCard`, `RecentDispatchedOrderCard`, `ReportCustomerCard`, `ItemPricingCard`, `grn/components/SavedItemCard`, `invoice/components/InvoiceItemCard`, `*-details/*ItemCard`, `InvoiceLineItemCard`) | Min height 72. Optional avatar or icon (44). Title `headline` `text.primary`, two lines max. Subtitle `subhead` `text.secondary`. Footnote `footnote` `text.secondary`. Right side: main value (`headline`, tabular), status tag under it. Chevron `icon.secondary` when it drills down. Pressed `surface.cardPressed`. |
| `ui/Card.tsx` | `surface.card`, `radius.card`, `shadow[2]`, padding from `CardPadding` (`compact` 12, `default` 16, `comfortable` 20, `spacious` 24). Header: title `headline`, subtitle `subhead`. `selected` adds a 2 px `brand.tint` border and a check. `error` shows a negative message strip. `loading` shows a skeleton. Shadow sizes map `sm` to 1, `md` to 2, `lg` to 3, `xl` to 4. |
| `fiori/KeyValueCell.tsx` | Key `subhead` `text.secondary`, value `body` `text.primary` (`emphasized` uses 600). `inline` layout: key left, value right; `stacked`: key above value. Actionable values use `brand.tint` and a chevron. Switch to stacked at large text sizes. |
| `ui/SectionHeader.tsx` | `footnote`, capitals, `text.secondary`, 16 side padding, 24 above and 8 below; optional count and a tertiary action on the right. `SectionFooter` uses `footnote` `text.secondary`. |
| `common/overview-tab/SectionHeader.tsx`, `ContactCard`, `NotesSection`, `ActionsSection` | Same rules as above; contact actions (call, message) are icon buttons with `brand.tint`; notes show `text.primary` body text. |
| Lists (`lists/*FlashList`, `list/GenericFilterableList.tsx`, `CustomerList.tsx`, `GRNListFiori.tsx`, `lists/SupervisorOrderQueueList.tsx`) | `background.base` behind; rows on `surface.card`; dividers `border.divider` inset 16 from the left (or past the avatar). Pull to refresh with `RefreshControl` tinted `brand.tint`. Infinite scroll loads 25 to 50 at a time with a footer spinner. Sticky section headers where grouped. |
| `list/ListSkeletonCard.tsx`, `skeletons/*` | Blocks in `surface.cardActive` at the size of real content, `radius.field` for text lines; shimmer off with Reduce Motion. |
| `list/ListEmptyState.tsx`, `reports/ReportEmptyState.tsx` | Centred: icon `iconSize.hero` in `icon.secondary`, title `title3`, subtitle `subhead` `text.secondary`, optional primary or secondary button. Separate wording for "no data yet" and "no match for filters" (with "Clear filters"). |
| `list/LoadingState.tsx` | Use skeletons for lists and object pages; a centred spinner in `brand.tint` only for short unknown waits. |
| `list/ListErrorBoundary.tsx`, `ErrorBoundary.tsx`, `FeatureErrorBoundary.tsx` | Icon `alert-circle-outline` in `status.negative.text`, title "Something went wrong", plain-language cause, "Try again" secondary button. No stack trace outside development builds. |

Swipe actions on rows: each action is at least 72 wide and full row height, with an icon over a `caption1` weight 600 label. The primary action (Edit) and a reversible state action (Activate) use `brand.fill` with `brand.onFill`; others use `surface.cardActive` with `text.primary`; destructive ones (Delete, Deactivate) use `destructive.fill` with `destructive.onFill` and ask for confirmation. Each swipe action is also offered to screen readers as an accessibility action. Destructive and state-changing actions (delete, deactivate) live in swipe actions or on the object page, never as a one-tap icon in the row.

A surcharge (a negative discount) shows with a plus sign in `text.primary`; a discount shows with a minus sign in `status.positive.text`.

### 13.7 Tables — `FioriDataTable.tsx`, `fiori/FioriDataTable.tsx`, `reports/FioriDataTable.tsx`, `grn-details/GRNItemDispatchTable.tsx`, `invoice/components/InvoiceItemsTable.tsx`

The three `FioriDataTable` copies follow one spec and are merged during migration.

- Header row: `footnote` weight 600, `text.secondary`, `background.base` fill, bottom border `border.separator`. Sortable columns show a sort icon and announce the order.
- Body rows: `body` or `subhead`, `text.primary`, min height 44 (36 for read-only compact tables), dividers `border.divider`. Alternate shading is not used.
- Numbers are right-aligned with tabular figures. Text is left-aligned. Status uses a status tag.
- Totals row: weight 600, top border 1 px `border.separator`.
- Rate columns may carry the unit in the header ("Charge (₹)") and show plain grouped numbers in the cells.
- On phones, tables with more than three columns scroll horizontally with the first column pinned, or turn into object cells. Show a fade at the scroll edge.
- Editable cells follow the editable-cell rule in section 13.2.
- Empty cells show "—".
- Pinning the first column and the scroll-edge fade are required for new tables with more than three columns; the existing invoice and dispatch tables scroll as a whole until they are rebuilt.

### 13.8 Headers and navigation

| Component | Spec |
|---|---|
| Stack header (expo-router) | `surface.header`, title `headline` (`title2` large titles on top-level iOS screens), tint `brand.tint` for back and actions, no shadow, hairline `border.divider` bottom. |
| Hero headers (`dispatch-details/DispatchHeroHeader.tsx`, `grn-details/GRNHeroHeader.tsx`, `invoice-details/InvoiceHeroHeader.tsx`, `reports/ReportHeader.tsx`, `grn/components/item-form/HeroBanner.tsx`) | Object page header on `surface.card`: document type `footnote` `text.secondary`, number `title2`, key facts as `KeyValueCell` pairs, status tag, then header actions. A brand-filled header is allowed only on the home screen and uses `brand.fill` with `brand.onFill` text and `overlay.onBrandSubtle` buttons. |
| `FioriTabBar.tsx` | `surface.tabBar`, top hairline `border.divider`, height 49 plus the bottom inset. Selected: filled icon and label in `brand.tint`. Unselected: outline icon and label in `icon.secondary` and `text.secondary`. Labels `caption2`, always visible. Badges per [13.5](#135-chips-badges-and-indicators). At most five tabs. |
| Detail tabs (`common/GenericDetailTabNavigator.tsx`, `*-details/*TabNavigator.tsx`) | Top tabs on `surface.header`; selected label `brand.tint` with a 2 px `brand.tint` underline; unselected `text.secondary`; label `subhead` weight 600; scrollable when more than four. |
| Step indicators (`StepIndicator.tsx`, `GenericStepIndicatorHeader.tsx`, `GRNStepIndicator`, `DispatchStepIndicator`, `InvoiceStepIndicator`) | Circles 28 px. Current: `brand.fill` with `brand.onFill` number. Completed: `brand.tint` outline with a check. Upcoming: `border.field` outline with `text.secondary` number. Connector 2 px, completed `brand.tint`, else `border.divider`. Step names under the circles in `caption1`; on phones show only the current step name. |
| Form chrome (`GRNFormHeader.tsx`, `WizardBottomBar.tsx` (the bottom bar for every wizard), `dispatch/components/DispatchFormHeader.tsx`, `form/FormStepWrapper.tsx`, `SwipeableFormStep.tsx`) | Header shows the step title and progress. The bottom bar sits on `surface.card` with `shadow[3]`, holds Back (secondary) and Next or Save (primary), and adds the bottom inset. |

More header rules:

- Object headers show a status tag only when the object has a status. Dispatches and invoices have none, so their headers show key facts only.
- Key facts in a hero header are compact pairs: label in `footnote` `text.secondary` above the value in `headline`, up to three side by side.
- Search bars in headers: `background.base` fill, `radius.button`, minimum height 44, no border, `magnify` icon in `icon.secondary`.
- Top-level tab list headers use `largeTitle` (or `title1` when actions crowd it); other screens use the stack header's `headline` title. Native-stack `headerTitleStyle` takes only `fontSize`, `fontWeight` and `color` from `typography.headline`.
- Detail tabs share the width when they fit (four on phones) and scroll sideways when they do not.
- Five bottom tabs for every role: Orders, GRN, Dispatch, Invoices, Reports. The order queue is not a tab: warehouse roles switch between Orders and Queue with a segmented control under the Orders header (`app/(tabs)/index.tsx`). A second view of the same object goes in its tab like this, not in a new tab.

### 13.9 Dialogs, sheets and messages

| Component | Spec |
|---|---|
| `ConfirmDialog.tsx`, `PrintRangeDialog.tsx`, `DocumentSuccessDialog.tsx`, `invoice/components/InvoiceSuccessDialog.tsx`, `ForceUpdateModal.tsx`, `UpdatePrompt.tsx` | `surface.sheet`, `radius.card`, `shadow[4]`, over `overlay.scrim`. Optional icon (`warning` uses `status.critical.text`, `danger` uses `status.negative.text`, success uses `status.positive.text`). Title `title3`, message `body` `text.secondary`. Buttons: Cancel secondary, the action primary (negative style when destructive). Max width 420. Back button and tapping the scrim cancel, except for a forced update. |
| Bottom sheets (`ChangeLogBottomSheet`, `common/ItemsSummaryBottomSheet`, `common/SearchableBottomSheet`, `CustomerSearchBottomSheet`, `PrintJobsBottomSheet`, `RolePickerBottomSheet`, `DispatchHistoryFilterSheet`, `filters/AutocompleteBottomSheet`, `dispatch/components/*BottomSheet`, `grn/components/*BottomSheet`) | `surface.sheet`, top corners `radius.sheet`, grab handle 36 × 4 in `border.separator`, `shadow[4]`, scrim behind. Title `headline` with a close or Done action. Content scrolls; actions stay pinned at the bottom with the safe-area inset. Searchable sheets put the search field at the top and keep it visible. |
| Filter screens (`filters/GenericFilterModal.tsx`, `filters/fields/*`, `DispatchFilterOverlay.tsx`, `GRNFilterOverlay.tsx`) | Full-height sheet: fields grouped by section headers, "Reset" tertiary in the header, "Show results" primary at the bottom with the result count when known. |
| Message strip (inline, `fiori/InlineValidation.tsx`) | `status.*.background`, 1 px `status.*.border`, `radius.button`, icon plus text in `status.*.text`. Variants `helper` (no container, `text.secondary`), `success`, `warning`, `error`. |
| Banners (`OfflineBanner.tsx`, `TokenExpiryBanner.tsx`) | Full-width under the header. Offline: `status.neutral.background`, `cloud-off-outline`. Session expiring: `status.critical.background` with a "Sign in again" tertiary action. Never cover content; push it down. |
| Snackbar / toast | `surface.inverse` background with `text.inverse` text (16.86:1 light, 14.64:1 dark), `shadow[3]`, `radius.button`, above the tab bar, 4 seconds. One optional action in `text.inverse`, weight 600, underlined. Never for errors that need action; use a message strip or dialog for those. |
| Full-screen states (`MaintenanceScreen.tsx`, `ConfigErrorScreen.tsx`, `InvalidRouteScreen.tsx`, `BiometricLockScreen.tsx`) | Centred empty-state layout on `background.base` with a hero icon, title, plain message and one primary action. |

More rules:

- **Alerts.** Every alert uses `showAlert` (`src/utils/alert.ts`), which takes the same arguments as `Alert.alert` and is drawn by `AlertHost` as a themed dialog: cancel is a secondary button, destructive uses the destructive fill, the last default button is the primary action; two buttons sit side by side and three or more stack. The lint guard rejects `Alert.alert`.
- **Snackbar text** is a `Text` child in `subhead` with `text.inverse` (Paper's Snackbar does not take a text colour).
- **Full-screen states** have one primary action only when the user can do something (maintenance has none).
- **Offline banner.** It is mounted once in `app/_layout.tsx`, above the navigation stack, and pushes content down. While it shows, the screens below get a zero top inset, because the banner already pads for the status bar.
- **Camera and photo views** use `light-content` status bar icons whatever the mode.
- **Sheet metrics**: grab handle 36 × 4 in `border.separator`; badge minimum 18.

### 13.10 Media

| Component | Spec |
|---|---|
| `CachedImage.tsx` | Placeholder `surface.cardActive` with an `image-outline` icon in `icon.secondary` while loading or on failure. `radius.card` in grids. |
| `grn/components/ImagePreviewGrid.tsx`, `*-details/*ImagesTab.tsx` | Three columns on phones, 4 px gaps, square thumbnails; a remove button on editable grids as a 44 px target with a scrim circle and `overlay.onImage` icon. |
| `ImageOverlay.tsx` | `overlay.imageBackdrop` (photo viewing is the one place pure black is allowed), close and share in `overlay.onImage`, pinch to zoom, swipe down to close. |

### 13.11 Data visualisation

| Component | Spec |
|---|---|
| `reports/KPICard.tsx`, `reports/KPIGrid.tsx` | `surface.card`, `radius.card`, `shadow[2]`. Icon 32 in a 44 circle of `brand.subtle` with `brand.tint` glyph (`primary` and `accent`), status background and text for `success` and `warning`, neutral for `neutral` and `secondary`. Value `title3` tabular, unit `subhead` `text.secondary`, label `footnote` `text.secondary`. Trend: `arrow-up`/`arrow-down` icon plus value in positive or negative text; whether up is good is set per KPI, never assumed. |
| `sensors/SensorHistoryChart.tsx` and other charts | Series colours from `tokens.chart` in order. Thresholds as dashed lines in `status.critical.element` and `status.negative.element` with labels. Axes and grid `border.divider`, axis labels `caption1` `text.secondary`. A text summary and a values table are available. |
| `reports/PeriodSelector.tsx` | Segmented control per [13.4](#134-selection-controls), 36 tall with the touch area padded to `touchTarget`; a custom period is a separate chip. |
| `invoice/components/InvoiceCalculationSummary.tsx`, `invoice-details/InvoiceBreakdownTab.tsx` | Key-value rows, amounts right-aligned with tabular numbers; total in `headline`; discounts in `status.positive.text` with a minus sign; taxes listed separately. |

More rules:

- KPI trends: whether up is good is set per KPI with `upIsGood`; without it the trend shows in `text.secondary`.
- A second series in another unit (humidity next to temperature) gets a secondary axis or its own chart, never the first series' scale.
- Temperature charts take their y range from the readings (cold rooms run below zero) and leave gaps for missing readings rather than drawing zero.

### 13.12 Branding

| Component | Spec |
|---|---|
| `BrandMark.tsx` | Orange brand: the template logo image. GCSA brand: the "GCSA" wordmark (`typography.wordmark`, `brandMark.wordmark`), a 4 px rule (`brandMark.rule`) and "COLD STORAGE ASSOCIATION" in `caption1` (`brandMark.caption`). In dark mode the GCSA mark sits on `brandMark.panel` (white) with `radius.sheet` so the logo navy is kept. The association's own logo file replaces the wordmark once the association approves its use. |
| App name | `EXPO_PUBLIC_APP_NAME`, shown under the mark on sign-in in `subhead` `text.secondary`. |

### 13.13 Other components

| Component | Spec |
|---|---|
| `ItemCatalogBrowser.tsx`, `RecentItemsQuickAdd.tsx`, `RecentDispatchesSection.tsx`, `RecentDispatchedOrdersSection.tsx`, `CustomerOrderSummary.tsx`, `DispatchHistorySummary.tsx`, `OrderManagement.tsx` | Composed of the cells, chips, section headers and cards above; no local colours. Quick-add tiles use `brand.subtle` with `brand.tint` text. |
| `OrderRefreshAction.tsx` | Header icon button `refresh` in `brand.tint`; spins during refresh; label "Refresh orders". |
| `OperatorServerSelection.tsx` | Facility list pattern, see [14.8](#148-sign-in-and-facility-selection). |
| `AppStateManager.tsx`, `EdgeToEdgeStatusBar.tsx` | No visible UI; the status bar style comes from tokens. |

---

## 14. Patterns

### 14.1 List report

The main pattern for orders, GRNs, dispatches, invoices, customers, items and users.

1. Header with title, search and a filter button with an active-filter count badge.
2. Quick filter chips under the header (period or status).
3. Applied filters bar when any filter is set.
4. The list of object cells, newest first, with pull to refresh and infinite scroll.
5. A primary create action: the shared `ui/Fab` (`brand.fill` with a `plus` in `brand.onFill`, `shadow[3]`, 56 px, bottom right above the tab bar, label "Create GRN" and so on) for the roles that can create, hidden for others; the list adds `FAB_CLEARANCE` to its bottom padding. Customers create their own orders, so the Orders button shows for every role. Lists with an A–Z index rail (customers, items) put Create in the header instead, because a floating button would cover the rail.
6. Empty, filtered-empty, loading (skeleton), error and offline states.

### 14.2 Object page

For one order, GRN, dispatch, invoice, customer, item or sensor.

1. Hero header: document type, number, status tag, two to four key facts, header actions (edit, print, share, more).
2. Detail tabs: Overview first, then Items, related documents (GRNs, Dispatches, Invoices), Images, History.
3. Overview: key-value sections, contact card, notes, actions section.
4. Edits open the form flow. After saving, return to the object page with a success snackbar.

### 14.3 Wizard (multi-step form)

GRN, dispatch and invoice creation.

- A step indicator at the top; step names are nouns ("Customer", "Items", "Review").
- One topic per step. The last step is always Review, with an edit link per section.
- Every step has the same bottom bar on `surface.card` with `shadow[3]` and the bottom inset, laid out below the scrolling content (it never floats over it): the first step shows Next, middle steps Back and Next, the review step Back and the save action ("Create GRN", "Save dispatch"). Next validates only the current step. Swiping between steps is a shortcut, never the only way.
- Section edit links on the review step are tertiary "Edit" buttons in `brand.tint`.
- Drafts are kept on the phone. Leaving with unsaved changes asks "Discard this GRN?".
- After saving, show a success dialog with the document number and actions (Print, Share, View, Create another).

### 14.4 Forms (single page)

Customer, item, pricing, user and profile forms.

- Fields in one column, grouped by section headers, in the order people fill them.
- Required fields marked with the asterisk; optional fields not marked.
- The save action is the primary button at the bottom, or Save in the header on iOS.
- Show all errors on save; scroll to the first.

### 14.5 Filter and sort

- Filters open in a full-height sheet (pattern [13.9](#139-dialogs-sheets-and-messages)).
- Lists that sort in place use the shared `list/SortBar` under the header: "Sort by", a segmented control of fields, a direction button and an optional expand-all button. Give each sort option its `kind` (`date`, `number` or `text`) so the direction button names the order in matching words: "newest first", "highest number first" or "Z to A". Lists that sort on the server put sort in the filter sheet as a radio list.
- Filters persist per list during the session and show as chips.

### 14.6 Search

- Search fields search as the user types, after 300 ms, with at least two characters.
- Recent searches show when the field is empty.
- Results highlight the match in bold.
- Server search shows a spinner in the field and a clear message when offline.

### 14.7 Master–detail on tablets

On tablets in landscape, list reports show the list on the left (360 wide) and the object page on the right. The selected row uses `surface.selected`.

### 14.8 Sign-in and facility selection

The app has one central sign-in that only proves who the user is, then facility selection, and each facility separately authorises data access.

1. **Sign-in** (`app/login.tsx`): brand mark, app name, the title "Sign in", the subtitle "Enter your mobile number to get a one-time code.", a "MOBILE NUMBER" section with a fixed +91 prefix and 5 + 5 grouping, and the full-width primary "Send code". The facility row above shows the current facility and host with a "Change" link.
2. **Code entry** (`app/otp.tsx`): six boxes or one field with `textContentType="oneTimeCode"` and `autoComplete="sms-otp"`, auto-submit on the sixth digit, a resend link with a countdown, and "Wrong number?" back.
3. **Facility selection** (`app/operator-server.tsx`): association member facilities as object cells (name, town, status tag). Status: Approved (positive), Requested (critical), Not requested (neutral), Revoked (negative). "Request access" on facilities without access.
4. **Waiting for approval** (`app/pending-enrollment.tsx`, `app/enrollment-review.tsx`): what was requested, from which facility, and what happens next. No data from the facility is shown until it approves.
5. **Revoked or expired**: sign the user out of that facility, explain why in plain words, and return to facility selection. Never show a raw "401".

### 14.9 Offline

- The offline banner shows within two seconds of losing the connection.
- Lists show cached data with "Last updated 10:42 am".
- Actions that need the server are hidden or explain that they need a connection. Drafts save on the phone.

### 14.10 Reports

- Period selector, then KPI grid, then charts, then detail tables.
- Every number links to the list behind it where possible.
- Export and print actions in the header.

### 14.11 Maintenance, forced update and errors

- Full-screen states per [13.9](#139-dialogs-sheets-and-messages).
- Forced update blocks the app with one "Update" action. Optional updates show a dismissible prompt once per version.

### 14.12 Settings

- Grouped list on `background.grouped`.
- Sections, in order: profile card, App features, Appearance (System, Light, Dark), Brand (Orange, GCSA navy, each with two swatches drawn from that brand's own tokens), Account (Delete account last), About, and Development (development builds only, with the style guide gallery). A Security section joins when the app gets a lock setting.

---

## 15. Platform notes

| Topic | iOS | Android |
|---|---|---|
| Body text | 17 | 16 |
| Touch target | 44 pt | 48 dp |
| Back | Swipe from the left edge and the header back button | System back gesture and button; must close sheets and dialogs first |
| Dialog buttons | Side by side, action on the right | Right-aligned text buttons, action on the far right |
| More menu glyph | `dots-horizontal` | `dots-vertical` |
| Pull to refresh | Native | Native, tinted `brand.tint` |
| Status and navigation bars | Status bar style from tokens | Edge to edge; navigation bar buttons follow the mode |
| Haptics | Light impact on toggle and save | Same, via `expo-haptics` |
| Pickers | Native date picker in a sheet | Native date picker dialog |

**Build-time colours.** The splash screen background and the launcher icon come from `app.json` and the Android resources (`colorPrimary`). They are fixed per build and cannot follow the brand chosen in Settings. A build for the association sets them to GCSA navy; the template build keeps the current values.

**Splash before the store loads.** The JavaScript splash shown before preferences are restored uses the build's splash colour from `app.json` (read through `Constants.expoConfig`), never a token, so it matches the native splash.

**Native pickers.** The Android picker dropdown and the date picker dialog follow the system theme, not the app's.

**Paper and navigation themes.** `app/_layout.tsx` builds the React Native Paper MD3 theme and the navigation theme from the tokens for the current brand and mode, so Paper components and native headers follow the brand.

---

## 16. Enforcement

All screens use the tokens; the six older colour systems and their adapters are gone. `eslint.config.mjs` keeps it that way. In `app/` and `src/` (except `src/theme/` and tests) these are lint errors:

| Rule | Use instead |
|---|---|
| Hex and `rgb()`/`rgba()` colour literals | Semantic tokens |
| `fontSize` with a literal number | A `typography` style |
| `Alert.alert` | `showAlert` from `src/utils/alert.ts` |
| `toISOString().split('T')[0]` and similar (UTC: yesterday before 5:30 am in India) | `toLocalISODate()` from `src/utils/formatters.ts` |
| `useColorScheme` or `Appearance` from react-native | `useTheme()` (only `src/hooks/useTheme.ts` reads the system scheme) |
| `@expo/vector-icons` | `react-native-vector-icons/MaterialCommunityIcons` |
| The old colour modules (`listColors`, `fioriColors`, `useListColors`, `fioriDesignTokens`, overview-tab `FioriTokens`) and `colors`/`getThemeColors` from `@/theme` | Semantic tokens |

The contrast test (`src/theme/tokens/__tests__/contrast.test.ts`) checks every token pair in all four themes, and render tests draw each area of the app in all four themes.

---

## 17. Making changes

### 17.1 A new screen or component

1. Write styles as a module-level `const makeStyles = (t: ThemeTokens) => ({ ... })` and call `useThemedStyles(makeStyles)` in the component. Colours passed as props come from `useTokens()`.
2. Spread `typography.*` for text; use `space`, `radius`, `iconSize`, `touchTarget` and `layout` from `@/theme/tokens`; spread `t.shadow[n]` for elevation.
3. Build from the shared parts before writing new ones: `ui/Button`, `ui/Input`, `ui/Card`, `ui/StatusTag`, `ui/Avatar`, `ui/Fab`, `ui/HeaderBackButton`, `ui/SectionHeader`, `fiori/KeyValueCell`, `list/ListEmptyState`, `list/SortBar`, `WizardBottomBar`, `ConfirmDialog`, `showAlert`, the bottom sheets in `common/`, `FioriDataTable`.
4. Format every date, time, number, weight, phone number and count with `src/utils/formatters.ts`; ask with `showAlert`.
5. Pick the pattern in section 14 and follow it, including loading, empty, error and offline states.
6. Add a render test that draws it in all four themes (`BRANDS × ['light','dark']`, mocking `@/store/hooks` as in `src/components/__tests__/StyleGuideScreen.test.tsx`).
7. Check it on a device in all four themes and at the largest font size.

### 17.2 A new colour role

1. If no semantic token fits, add one to `ThemeTokens` and `buildTokens()` in `src/theme/tokens/semantic.ts`, with a value for each brand and mode (raw values go in `reference.ts`).
2. Add its pairs to the contrast test.
3. Add it to the tables in 3.3 and 3.4 and to the gallery (`app/style-guide.tsx`).

### 17.3 A new status value

Add a row to the table in 3.5 (object, value, status, word on screen) and show it with `StatusTag`.

### 17.4 A new brand

1. Add a reference palette in `reference.ts` and a branch in `brandGroup()` (and `brandMark`) in `semantic.ts`. Neutrals and status colours stay Horizon.
2. Add the brand to `Brand`, `BRANDS` and `BRAND_LABELS`. The Settings picker and the gallery list it automatically.
3. Run the contrast test; fix every failing pair before anything else.
4. Add its column to the tables in section 3.

### 17.5 Changing this guide

Change the code first, then this guide in the same pull request. Regenerate the tables in 3.3 from `buildTokens()` when tokens change.

---

## 18. Review checklist

Before merging any UI change:

- [ ] `npm run lint` shows no style-guard errors; no module-scope colours.
- [ ] Text uses `typography` styles; spacing uses `space`; radii use `radius`.
- [ ] Checked in Orange light, Orange dark, GCSA light and GCSA dark.
- [ ] Checked at the largest font size and with a screen reader.
- [ ] Every pressable element is at least 44 or 48 and has a role and label.
- [ ] Status has a word or icon as well as colour.
- [ ] Loading, empty, error and offline states exist.
- [ ] Wording follows [Content and wording](#12-content-and-wording); no developer text; dates and numbers use the shared formatters; alerts use `showAlert`.
- [ ] Contrast test passes if tokens changed.
- [ ] `npm test`, `npm run typecheck` and `npm run lint` pass.

---

## 19. Sources

- SAP Fiori for iOS Design Guidelines: colour, design tokens, typography, layout. https://experience.sap.com/fiori-design-ios/
- SAP Fiori for Android Design Guidelines: colour, design tokens, typography, elevation. https://experience.sap.com/fiori-design-android/
- SAP Fiori Design Guidelines (web): Horizon theme, colours, semantic colours, shadows, corner radius. https://experience.sap.com/fiori-design-web/
- SAP theming base content, Morning Horizon and Evening Horizon parameters (`sap_horizon`, `sap_horizon_dark`). https://github.com/SAP/theming-base-content
- Web Content Accessibility Guidelines (WCAG) 2.2. https://www.w3.org/TR/WCAG22/
- Apple Human Interface Guidelines: typography, layout, accessibility. https://developer.apple.com/design/human-interface-guidelines/
- Material Design 3: touch targets, elevation. https://m3.material.io/
- Gujarat Cold Storage Association, source of the navy and grey brand colours. https://gcsa.in/
