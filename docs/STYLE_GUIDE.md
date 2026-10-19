# Style guide

This guide defines how every screen of the app looks and behaves. It follows SAP Fiori for iOS and Android with the Horizon theme, adapted to React Native. Tables are built with TanStack Table and drawn by the app's own renderer in the same style ([13.7](#137-tables)).

### Themes at a glance

The app has **two theme axes**, and every screen supports every combination of them:

| Axis | Values | Chosen under | What it changes | Rules |
|---|---|---|---|---|
| **Brand** | Orange, GCSA navy | Settings → Preferences → App colours. A build sets the default with `EXPO_PUBLIC_DEFAULT_BRAND=orange\|gcsa`. | The brand colour group only: primary fills, tints, selected states, the brand mark | [3.7](#37-the-brand-axis) |
| **Mode** | Light, dark | Settings → Preferences → Appearance (System, Light, Dark) | Neutrals, status colours, shadows, table edges, charts and avatars | [3.8](#38-the-mode-axis) |

Together they make four themes:

| Theme | Brand fill | Use |
|---|---|---|
| Orange light | `#F69000` with dark text | The template's original look, made accessible |
| Orange dark | `#FFA733` with dark text | Same brand in dark mode |
| GCSA light | navy `#2E3192` with white text | Gujarat Cold Storage Association members |
| GCSA dark | navy `#9DA0F0` with dark text | Same brand in dark mode |

Status colours, type, spacing, shape and touch sizes are the same in all four ([3.9](#39-what-the-axes-never-change)). A component is designed once, in tokens, and checked in all four.

### Source of truth

The source of truth is code, not this document:

| What | Where |
|---|---|
| Raw palettes (reference tokens) | `src/theme/tokens/reference.ts` |
| Role colours for each theme (semantic tokens) | `src/theme/tokens/semantic.ts` |
| Type, spacing, shape, sizes, motion | `src/theme/tokens/metrics.ts` |
| Contrast maths | `src/theme/tokens/contrast.ts` |
| Contrast test for all four themes | `src/theme/tokens/__tests__/contrast.test.ts` |
| Table setup and renderer | `src/components/table/appTable.ts`, `src/components/table/DataTable.tsx`, styles and sizing in `src/components/common/DetailTable.tsx` |
| Live gallery (development builds) | Settings → Development → Style guide (`app/style-guide.tsx`) |

If this guide and the code disagree, the code wins and this guide is the bug.

**This is the app's only style guide.** Use this file as it stands on `main`. Older material does not apply to this app:

- Earlier versions of this file in other checkouts, archives or audit copies.
- The removed `FioriDataTable` rules.
- Material Design 3 or Guru Cold Storage brand guidelines, including skills built on them.

A design question this guide does not answer is a gap to fill here ([17.5](#175-changing-this-guide)), not a reason to use another guide.

### Contents

1. [Principles](#1-principles)
2. [Using tokens in code](#2-using-tokens-in-code)
3. [Colour and themes](#3-colour-and-themes)
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
- **Adaptive.** Every screen works on a small Android phone, a large phone and a tablet, in portrait, in both brands and both modes, with the largest system font size, and offline where the feature allows.
- **Simple.** One primary action per screen. Show the few fields people need first and put the rest one tap away. Prefer a list with good defaults over a form full of options.
- **Coherent.** The same thing looks and behaves the same everywhere. An order status chip on the order list, the customer page and the report is the same component with the same colours.
- **Delightful.** Fast feedback (pressed state within 100 ms), no dead ends (every error says what to do next), and nothing that looks like developer output.

Three rules follow from these and override local taste:

1. **Colour comes from tokens.** No hex, `rgb()` or named colours outside `src/theme`. See [Enforcement](#16-enforcement).
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

There are no other colour APIs.

---

## 3. Colour and themes

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

#### table

A shadow does not show on the dark page, so a table card is outlined, and in dark mode its
heading row is lighter than its rows rather than darker. `table.accent` is the brand tint.

| Token | Orange light | Orange dark | GCSA light | GCSA dark |
|---|---|---|---|---|
| `table.outline` | `#E5E5E5` | `#4A5868` | `#E5E5E5` | `#4A5868` |
| `table.headerFill` | `#EFF1F2` | `#2A3440` | `#EFF1F2` | `#2A3440` |
| `table.headerText` | `#556B82` | `#A9B4BE` | `#556B82` | `#A9B4BE` |
| `table.divider` | `#E5E5E5` | `#3C4957` | `#E5E5E5` | `#3C4957` |
| `table.separator` | `#D9D9D9` | `#4A5868` | `#D9D9D9` | `#4A5868` |
| `table.insetFill` | `#F0F3F6` | `#242E38` | `#F0F3F6` | `#242E38` |
| `table.accent` | `#A85000` | `#FFA733` | `#2E3192` | `#9DA0F0` |

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
| `table.*` | Tables (§13.7): card outline, heading row, row dividers, header and totals separators, an open row's panel and its accent bar | Lists of cards, which use `surface.card` and `border.divider` |
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
| GRN, GRN item | 0 left because everything was dispatched | Neutral | Fully dispatched. The GRN list's Stock filter uses the same words: All, In stock, Low stock, Fully dispatched (per line, backend migration 98). Low stock is offered only once the facility's list has answered in receipts (migration 98); a facility without it would answer it wrongly. Under a filter on lines (Stock other than All, Item, Weight each, Package, search text) a GRN card shows only the matching lines: its item count reads "3 matching items" and it adds the footnote "Only the items that match the filters are shown.", because its bags and tag are those of those lines. |
| GRN | not invoiced / invoiced | Critical / Positive | Not invoiced / Invoiced |
| Invoice | `pending` / `paid`, as the facility answers | Critical / Positive | Pending / Paid |
| Invoice (invoice history report) | a balance over ₹0.50 / nothing owed, worked out from the payments recorded | Critical / Positive | Pending / Paid. A part-paid invoice stays Pending: its card adds one footnote line under the cell, "Paid: ₹4.00 · Pending: ₹10.00" |
| Dispatch (activity report) | has quantity / no quantity | Positive / Critical | Complete / Pending |
| Stock age | 0–120 / 121–240 / 241–364 / over 364 days | Positive / Informative / Critical / Negative | 0–120 days … |
| Sensor health | `healthy` / `warning` / `critical` | Positive / Critical / Negative | Healthy / Warning / Critical |
| Sensor battery | `GOOD` / `LOW` / `CRITICAL` | Positive / Critical / Negative | In lists: Battery good / Battery low / Battery critical. In a row labelled Battery: Good / Low / Critical |
| Sensor connection | online / stale / offline | Positive / Critical / Negative | Online / No recent data / Offline |
| Printer | online / busy / offline or error | Positive / Informative / Negative | Online / Busy / Offline |
| Print job | `pending` / `printing` / `completed` / `failed` / `cancelled` | Neutral / Informative / Positive / Negative / Neutral | Waiting / Printing / Printed / Failed / Cancelled |
| Image upload | `pending` / `uploading` / `completed` / `failed` | Neutral / Informative / Positive / Negative | Waiting / Uploading / Uploaded / Upload failed |
| Facility access (enrollment) | requested / approved / rejected / revoked | Critical / Positive / Negative / Negative | Requested / Approved / Not approved / Revoked |
| Facility on My facilities (central login) | `approved` / `requested` / `revoked` / `link_needed` / `unavailable` | Positive / Critical / Negative / Neutral / Neutral | Approved / Requested / Revoked / Confirm number / Unavailable |
| Facility in the association's catalogue (Add facility, central login) | reached at the service's last check / not reached / no app server (`origin: null`) / not reported (a catalogue before central 0.8.0) | Positive / Negative / Neutral / no tag | Online / Offline, with "Last seen …" / No app server yet, the row greyed with `text.secondary` and `icon.secondary` / — |
| Customer, item, user | active / inactive | no tag / Neutral | Inactive |
| Operation result | `success` / `error` | Positive / Negative | — |

Show every status with the `StatusTag` component (`@/components/ui`), which pairs the word with the standard icon above.

Not statuses, so never status-coloured by meaning:

- **Categories** such as user roles, price types or packaging: neutral tags (`status="neutral"`, usually `icon={null}`). At most one category in a set may use informative to stand out. Never brand colours.
- **Item details** on cells (weight, rack, mark, photos) are neutral `StatusTag`s with their glyph, worded the same everywhere: "50 kg each", "Rack B-14", "Mark PT", "3 photos". A weight is always the weight of one bag, box or crate and always says "each" (`formatWeightEach`); a line with no weight has no weight tag. A header over several lots (a group on the invoice form, which is an item and a mark) has one weight tag for each distinct weight, lightest first ("25 kg each", "50 kg each"), never one lot's weight for all of them. On object pages, contact and metadata facts use `InfoChip`.
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

### 3.7 The brand axis

The brand changes one token group and the brand mark. Everything else is the same in Orange and GCSA.

| | Orange | GCSA navy |
|---|---|---|
| `brand.fill`, light / dark | `#F69000` / `#FFA733` | `#2E3192` / `#9DA0F0` |
| `brand.onFill` (text and icons on the fill) | ink `#131E29` in both modes | white in light mode, ink in dark mode |
| `brand.tint` (links, selected tab, active filter, `table.accent`) | `#A85000` / `#FFA733` | `#2E3192` / `#9DA0F0` |
| `brand.secondary` | yellow `#F6C624`, decoration only | grey `#A7A9AC`, decoration only |
| Brand mark (`BrandMark.tsx`) | The template logo image | The GCSA wordmark; on a white panel in dark mode ([13.12](#1312-branding)) |

Rules:

- **Use the brand tokens and nothing else.** A component never checks the brand to pick a colour. The brand is read in one place only: `BrandMark.tsx` reads it to choose which mark to draw. The colours themselves are switched in `brandGroup()` and `brandMark` in `semantic.ts`.
- **Never assume the ink on a fill.** `brand.onFill` is white in GCSA light and dark ink in the other three themes. Draw text and icons on `brand.fill` with `brand.onFill`, and choose a brand-filled header's status bar style from it ([5.2](#52-layout)).
- **Brand never carries status** ([3.5](#35-status-colours)). Orange's fill and critical status are close, so a critical item always carries its icon and word.
- **Build-time colours do not follow the brand.** The splash screen and the launcher icon are fixed per build ([15](#15-platform-notes)).
- Settings shows each brand choice with two swatches drawn from that brand's own tokens ([14.12](#1412-settings)). A new brand follows [17.4](#174-a-new-brand).

### 3.8 The mode axis

The mode changes the neutrals and everything that depends on how a surface reads against the page.

| What | Light | Dark |
|---|---|---|
| Page and cards | `background.base` `#F5F6F7`, cards white | `background.base` `#12171C`, cards `#1D232A`, lighter than the page |
| Depth | Shadows (`shadow[n]`) | Shadows at twice the opacity (capped at 0.6), plus the surface step. A table card adds a 1 dp `table.outline`; a list card may add a 1 dp `border.separator` so neighbouring cards stay apart ([7](#7-elevation)). |
| Table heading row | `table.headerFill` darker than the rows | Lighter than the rows, so it never reads as a gap in the card ([13.7](#137-tables)) |
| Status colours | SAP Morning Horizon | SAP Evening Horizon: brighter text on darker backgrounds |
| Filled destructive button | White on `#AA0808` | Dark ink on `#FA6161` |
| Charts and avatars | `tokens.chart` and `tokens.avatar` light series; avatar initials `text.primary` | Dark series; avatar initials white (`overlay.onImage`) |
| Overlays | Scrim 40 % black; pressed overlay 8 % ink | Scrim 60 % black; pressed overlay 12 % near-white |
| Status bar icons | `dark-content` (`tokens.statusBarStyle`) | `light-content` |

Rules:

- **Appearance has three choices.** System follows the phone, and a phone that reports no preference counts as light. Light and Dark override it. Components read the result through `useTheme()` and never call `useColorScheme()` or `Appearance` ([2](#2-using-tokens-in-code)).
- **A component never checks the mode to pick a colour.** The exceptions are avatar initials (`avatarColors` in `src/utils/avatar.ts`), the Paper and navigation themes, and the Android navigation bar (`app/_layout.tsx`).
- **Never carry a light value into dark mode.** A tint made with opacity, a fixed white or a hand-picked grey is right in one mode and wrong in the other ([3.6](#36-dos-and-donts)).
- **Some things do not follow the app's mode:**
  - The Android picker dropdown and the date picker dialog follow the phone's theme.
  - The splash screen follows the build.
  - The photo viewer is always black (`overlay.imageBackdrop`).
  - Camera views always use `light-content` status bar icons.
  - The GCSA mark sits on a white panel in dark mode, so the logo keeps its navy.

### 3.9 What the axes never change

- **The same in all four themes:**
  - Status meaning, and status colours across brands (they change with the mode only).
  - Typography, spacing, shape and the elevation levels (shadows only get stronger in dark mode).
  - Icons, touch targets, motion and wording.
- **Every component is written once, in semantic tokens.** A component spec in [13](#13-components) adds a **Brand and mode** line only when something changes beyond its tokens resolving for the theme.
- **Both axes are checked by the same tests:**
  - The contrast test checks every token pair in all four themes.
  - Render tests draw each area of the app in `BRANDS × ['light', 'dark']`.
  - The live gallery switches brand and mode in place.
  - A UI change is checked on a device in all four themes before merge ([18](#18-review-checklist)).

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
  A Modal is not resized by `adjustResize` while edge to edge is on: a dialog or sheet with a field sets `statusBarTranslucent` and `navigationBarTranslucent`, wraps its content in `KeyboardAvoidingView` with `behavior="padding"` on both platforms and `keyboardVerticalOffset` of minus the bottom inset, and pads its overlay by the top and bottom insets itself, so the keyboard is counted once (`ConfirmInputDialog.tsx`). A bottom sheet that pads its own bottom edge by the bottom inset instead (`SheetFrame.tsx`) uses `behavior="padding"` with no offset.
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

Fiori uses five levels. Spread `t.shadow[n]`, which carries the iOS shadow and the Android `elevation`. In dark mode the same levels use twice the opacity, capped at 0.6 ([3.8](#38-the-mode-axis)).

| Level | Offset / blur / opacity (light) | Use |
|---|---|---|
| 0 | none | Headers, app bar, rows inside a card, anything on `background.grouped` |
| 1 | 1 / 2 / 0.12 | Raised rows, pressed cards, chips that can be dragged |
| 2 | 2 / 6 / 0.16 | Cards, KPI tiles, the tab bar |
| 3 | 6 / 16 / 0.20 | Snackbars, toasts, menus, the floating action button |
| 4 | 10 / 30 / 0.25 | Bottom sheets, dialogs, popovers |

Rules:

- A card on a card has no shadow. Separate with a divider instead.
- In dark mode, depth also comes from surface colour: `surface.card` is lighter than `background.base`. A table card also gets a 1 dp `table.outline` in both modes, because the dark page shows neither the shadow nor the small step in colour clearly. A table on a FlatList has the outline and no shadow ([13.7](#137-tables)).
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
- **Back on headerless screens.** Screens that hide the stack header (OTP, customer order page, object pages with hero headers) draw their own back control: the platform glyph (`chevron-left` on iOS, `arrow-left` on Android) in `brand.tint` with the word "Back", at least `touchTarget` in size. Screens with a stack header put `HeaderBackButton` (`ui/HeaderBackButton.tsx`) in `headerLeft`, so the word Back shows and is translated; never the icon-only native back.
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
- Respect Reduce Motion. When `AccessibilityInfo.isReduceMotionEnabled()` is true, replace slides and springs with fades and stop skeleton shimmer. An indeterminate progress line (`FioriLinearProgress`, the header's busy line) stops sliding and shows a still bar, half the track wide and centred.
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
| Weight | The weight of one bag, box or crate, in kg, up to two decimals, then "each". The entry field is labelled "Weight each" with kg as its suffix; a narrow column is headed "Kg each" and holds the plain number. Over lots of different weights every weight is given, lightest first. Total weights are not shown. | 50 kg each |
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
| `formatWeightEach(n)` | 50 kg each; nothing (`null`) for a weight that is missing, is not a finite number, or rounds to zero or less |
| `formatWeight(n)` | 1,250.5 kg (the number and unit inside `formatWeightEach`; nothing else calls it but the style gallery, for one sample) |
| `formatTemperature(n)` | −18.5°C |

Empty values show "—", never "-", "N/A", "null" or "0" for unknown.

Avatars use `Avatar` (or `avatarInitials` and `avatarColors` from `src/utils/avatar.ts`), keyed by the record id, so a person or customer has the same initials and colour on every screen. The initials are the first letter or digit of each of the first two words that have one, so a name that starts with an emoji or a symbol ("🧊 Ice Depot") gives "ID", never half of a character.

---

## 13. Components

Every component below must use semantic tokens and metrics only, follow the states in [Interaction states](#10-interaction-states), and render correctly in both brands and both modes. A **Brand and mode** line says what changes beyond the tokens; a component without one looks the same in every theme apart from its token values ([3.9](#39-what-the-axes-never-change)). Paths are under `src/components` unless stated.

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

**Brand and mode:** the primary label is ink in three themes and white in GCSA light (`brand.onFill`). The filled destructive button is white on dark red in light mode and dark ink on light red in dark mode.

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

Rules: label above the field, never only a placeholder. A tap places the cursor; a field that opens with a value meant to be replaced (a rate or weight on the rate editor) passes `selectTextOnFocus` so typing replaces it. Height 44 minimum, radius `radius.field`. Set the right `keyboardType`, `autoComplete`, `textContentType` and `returnKeyType`. Validate on blur and on submit, not on every keystroke. `GhostTextInput` (inline editing in tables) shows its border only when focused. Autocomplete inputs show suggestions in a list under the field or in a bottom sheet with the match highlighted in bold, never in colour alone.

`GhostTextInput` keeps the 1 px field border when it is used as a form field (vehicle registration on the GRN and dispatch headers); it is borderless only inside tables. Editable number cells in tables are borderless `TextInput`s that show a 2 px `border.fieldFocus` border while focused. (The invoice Items step's line table is the exception: its editable cells are input boxes at rest, owner decision 2026-10-19, §13.7.)

### 13.3 Specialised inputs

| Component | Spec |
|---|---|
| `ui/DatePickerInput.tsx` | Looks like a text field with a `calendar-outline` icon; opens the platform picker; shows the date format from [12.3](#123-formats). |
| `features/filters/components/editors/DateRangeEditor.tsx` | Quick ranges as chips (Today, Yesterday, Last 7 days, This month, Last month), then From and To date fields; "To" covers the whole of its day. |
| `ui/CompoundRackInput.tsx` | Rack, floor and chamber pickers side by side, stacked at large text sizes; values shown as "Chamber 2 · Rack B-14". The Android picker dropdown follows the system theme, not the app's. |
| `fiori/StepperInput.tsx` | Minus and plus buttons in `border.button` with `brand.tint` icons, `brand.subtle` while pressed; value in `body` with tabular numbers; the buttons disable at min and max; layouts `stacked`, `inline`, `compact`. |
| `grn/components/HorizontalItemForm.tsx` | Numeric keypad, unit as a suffix in `text.secondary`, tabular numbers. The weight field is labelled "Weight each". The fields are one sideways row, so a save that was refused brings the row to its first field with an error (`revealField`). |
| `grn/components/item-form/RackChamberPicker.tsx` | Floor and chamber are single-choice chips with radio semantics (`brand.subtle` and a check when selected); use a bottom sheet only when there are more than eight options. Wrapping choice chips are at least 36 tall with an 8 gap and `hitSlop` up to `touchTarget`. |
| `grn/components/item-form/ItemSearchField.tsx`, `ItemAutocomplete`, `invoice/components/GRNAutocomplete` | Search field plus suggestion list; recent picks first; empty state "No matches". |
| `grn/components/ImageUploadButton.tsx`, `item-form/MarkImageField.tsx`, `CameraModal.tsx` | Dashed `border.field` tile with `camera-outline` icon and label; upload progress uses `FioriLinearProgress`; failure shows a retry action. |

Sheets with an on-screen keypad (the GRN picker in dispatch) keep the search field directly above the keypad rather than at the top of the sheet.

**Brand and mode:** native pickers (the date picker dialog, the rack and chamber dropdowns on Android) follow the phone's theme, not the app's ([3.8](#38-the-mode-axis)).

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
| `features/filters/components/FilterBarChip.tsx` | Pill, 36 px high, drawn centred in a pressable that is `touchTarget` tall (44 iOS, 48 Android), not a hitSlop. Idle (a fast filter that is off): `surface.card`, 1 px `border.button`, `text.primary`, chevron when it opens a sheet. Active (a filter that is on): `brand.subtle`, `brand.tint` label in weight 600, and a separate `close` target labelled "Remove filter …", a whole `touchTarget` square (the pill grows to hold it). Action ("Filters" with its count badge, the sort chip). Text ("Clear all"). |
| `features/filters/components/ChoiceChips.tsx` | A radio group of pills. Unselected: `surface.card`, 1 px `border.button`, `text.primary`. Selected: `brand.subtle`, `brand.tint`, check icon. |
| `features/filters/components/FilterBar.tsx` | One row that scrolls sideways, in this order: Filters (opens the full page), the sort chip, active filters, unused fast filters, "Clear all". Its height never changes, so the list below does not jump. |
| `common/overview-tab/InfoChip.tsx` | Neutral tag: `status.neutral.background`, `status.neutral.text`. |
| `ui/StatusTag.tsx` | `status.*.background`, `status.*.text`, the standard icon from [3.5](#35-status-colours) at `iconSize.xs`, `radius.field`, `caption1` weight 600. One line with "…" when narrow; `wrap` lets the label wrap instead (the GRN Review step's narrow table columns). Use it for every status; do not build local tags. |
| `ui/Fab.tsx` | Floating create button for list reports, see 14.1. |
| `ui/Avatar.tsx` | Initials (first letter or digit of each of the first two words that have one) on the avatar palette colour for the record id; sizes `sm` 32, `md` 44, `lg` 60. |
| Count badge | A "needs action" count (tab bar items waiting for you) uses `destructive.fill` with `destructive.onFill`. Plain counts (section headers, detail tabs, active filters) use `brand.fill` with `brand.onFill`. Minimum 18 px, `caption2`. |
| `StockIndicator.tsx` | Bar track `brand.subtleStrong`; fill and tag follow the single stock rule in [3.5](#35-status-colours) (in stock, low stock below 20%, out of stock); text "120 of 200 bags" beside it; `flashRed` pulses once, not in a loop. |
| `FioriLinearProgress.tsx` | Height 4 (default) or 8 (prominent), pill radius; track `brand.subtleStrong` or the status background with `coloredTrack`; fill `brand.fill` (`default`) or `status.*.element` (`success`, `warning`, `error`, `info`); percentage in `caption1`. Segmented progress uses chart colours in order. |

**Brand and mode:** a plain count badge is `brand.onFill` on `brand.fill`, so its number is white in GCSA light and ink elsewhere. Avatar initials are ink in light mode and white in dark mode (`avatarColors`).

### 13.6 Cells, cards and lists

| Component | Spec |
|---|---|
| Object cell (list rows in `list-items/*`, `OrderItemCard`, `CustomerOrderGroupCard`, `RecentDispatchedOrderCard`, `ReportCustomerCard`, `ItemRateRow`, `grn/components/SavedItemCard`, `invoice/components/InvoiceItemCard`, `reports/StockItemCard`) | Min height 72. Optional avatar or icon (44). Title `headline` `text.primary`, two lines max. Subtitle `subhead` `text.secondary`. Footnote `footnote` `text.secondary`. Right side: main value (`headline`, tabular), status tag under it. Chevron `icon.secondary` when it drills down. Pressed `surface.cardPressed`. |
| `ui/Card.tsx` | `surface.card`, `radius.card`, `shadow[2]`, padding from `CardPadding` (`compact` 12, `default` 16, `comfortable` 20, `spacious` 24). Header: title `headline`, subtitle `subhead`. `selected` adds a 2 px `brand.tint` border and a check. `error` shows a negative message strip. `loading` shows a skeleton. Shadow sizes map `sm` to 1, `md` to 2, `lg` to 3, `xl` to 4. |
| `fiori/KeyValueCell.tsx` | Key `subhead` `text.secondary`, value `body` `text.primary` (`emphasized` uses 600). `inline` layout: key left, value right; `stacked`: key above value. Actionable values use `brand.tint` and a chevron. Switch to stacked at large text sizes. |
| `ui/SectionHeader.tsx` | `footnote`, capitals, `text.secondary`, 16 side padding, 24 above and 8 below; optional count and a tertiary action on the right. The badge may show other text than the count (`countText`, e.g. "20+" while more pages remain to load) with its spoken form in `countLabel` ("more than 20 orders"). `SectionFooter` uses `footnote` `text.secondary`. |
| `common/overview-tab/SectionHeader.tsx`, `ContactCard`, `NotesSection`, `ActionsSection` | Same rules as above; contact actions (call, message) are icon buttons with `brand.tint`; notes show `text.primary` body text. |
| Lists (`lists/*FlashList`, `app/customers.tsx`, `GRNListFiori.tsx`, `lists/SupervisorOrderQueueList.tsx`) | `background.base` behind; rows on `surface.card`; dividers `border.divider` inset 16 from the left (or past the avatar). Pull to refresh with `RefreshControl` tinted `brand.tint`. Infinite scroll loads 25 to 50 at a time with a footer spinner. Sticky section headers where grouped. |
| `list/ListSkeletonCard.tsx`, `skeletons/*` | Blocks in `surface.cardActive` at the size of real content, `radius.field` for text lines; shimmer off with Reduce Motion. |
| `list/ListEmptyState.tsx`, `reports/ReportEmptyState.tsx` | Centred: icon `iconSize.hero` in `icon.secondary`, title `title3`, subtitle `subhead` `text.secondary`, optional primary or secondary button. Separate wording for "no data yet" and "no match for filters" (with "Clear filters"). |
| `list/LoadingState.tsx` | Use skeletons for lists and object pages; a centred spinner in `brand.tint` only for short unknown waits. |
| `list/ListErrorBoundary.tsx`, `ErrorBoundary.tsx`, `FeatureErrorBoundary.tsx` | Icon `alert-circle-outline` in `status.negative.text`, title "Something went wrong", plain-language cause, "Try again" secondary button. No stack trace outside development builds. |

Invoices list card (owner decision, 2026-10-19): the object cell without an object icon (the icon is optional above). The title is the invoice number alone (`formatIdentifier`, "1", not "Invoice 1") in `headline`; this is an exception to §12.3 "Document numbers: Type, then number", because the screen is titled Invoices, with the total and the chevron at the end of the same line; if they do not fit one line, the total goes under the number at the end, and neither is cut. Under it, over the full card width: the customer (`subhead`, two lines), then the date and the GRN on one line, each with its small icon, separated by their icons only (no dot), in English and Gujarati alike. They wrap to two lines only when the card cannot hold both, and the GRN then wraps whole. The card's spoken label still starts "Invoice 1".

Swipe actions on rows: each action is at least 72 wide and full row height, with an icon over a `caption1` weight 600 label. The primary action (Edit) and a reversible state action (Activate) use `brand.fill` with `brand.onFill`; others use `surface.cardActive` with `text.primary`; destructive ones (Delete, Deactivate) use `destructive.fill` with `destructive.onFill` and ask for confirmation. Each swipe action is also offered to screen readers as an accessibility action. Destructive and state-changing actions (delete, deactivate) live in swipe actions or on the object page, never as a one-tap icon in the row.

A surcharge (a negative discount) shows with a plus sign in `text.primary`; a discount shows with a minus sign in `status.positive.text`.

A pin is the exception to the one-tap rule: it changes nothing but the person's own view and is undone by the same tap, so a star may sit at the end of a row as a one-tap control. It is a separate target beside the row's own (not inside it), at least `touchTarget` square with 8 between the two, a button with `accessibilityState={{ selected }}` and a whole-sentence label ("Pin GRN activity to the top" / "Unpin GRN activity"). Pinned shows the filled `star` in `brand.tint`; not pinned shows `star-outline` in `icon.primary`, so the glyph, not colour alone, carries the state. Used by `reports/ReportHubRow.tsx` on the Reports tab.

### 13.7 Tables

Every table is a TanStack Table v9 built with the app's one setup and drawn by the app's one renderer. A new table does not bring its own renderer.

| Part | Where | What it does |
|---|---|---|
| Setup | `table/appTable.ts`: `useAppTable`, `createAppColumnHelper<Row>()` | Row expanding, sorting on the columns that set `enableSorting: true` (one at a time), and the column meta below |
| Renderer | `table/DataTable.tsx`: `DataTable`, `useDefaultOpen` | Draws the header group, rows, open-row panels and footer as Views in the shared table styles |
| Styles and sizing | `common/DetailTable.tsx`: `makeTableStyles`, `HeaderCell`, `RowChevron`, `OpenBar`, `useTableLayout`, `numberColumnWidth`, `crowded`, `ONE_LINE`, `CUT_LINE`, `nb()` | The look of every table and the width and stacking rules below |

#### Building a table

1. Describe the columns with `createAppColumnHelper<Row>()` and make the table with `useAppTable`.
2. Set each column's `meta`:

   | Meta | Meaning |
   |---|---|
   | `width` | `'grow'` takes the rest of the row (the item column); a number is a fixed width in dp; `'auto'` is the width of its text |
   | `numeric` | A right-aligned number column; its heading is right-aligned too |
   | `marginLeft` | Space before the column, for a muted column set off from the one before it |
   | `headerOnly` | A heading with no cell: its figure is drawn inside another cell (an amount moved under the item at large text) |
   | `headerOneLine` | The heading stays on one line and shrinks rather than wraps (the default in a nested table) |
   | `label` | The column's name for TalkBack when its heading is not plain text |

3. Draw it with `DataTable`, choosing the variant:

   | Use | Props |
   |---|---|
   | A tab of an object page with a long list | `variant="card"` `list="flat"`: the table is the tab's FlatList |
   | A table inside a scrolling screen (reports, the Review step, rate screens) | `variant="card"` `list="map"` |
   | A table inside an open row's details, or inside a form | `variant="nested"` |

4. Add the parts the table needs: `footer` for the totals row, `renderDetail` for rows that open, `onRowPress` for rows that open another screen, `rowLabel` and `rowHint` so each row reads as one element, `rowActions` for links inside a row, and `useDefaultOpen` when rows start open because of their data (the first line with dispatches, a lone group).

The Monthly breakdown of Invoice history (`app/reports/invoice-history.tsx`) is the model for a sortable report table with totals.

#### Anatomy

| Part | Spec |
|---|---|
| Card | `surface.card`, `radius.card`, `shadow[2]` and a 1 dp `table.outline`. A table on a FlatList is drawn in parts (`cardTop` round the header row, `cardSides` on every row, `cardBottom` round the totals) with no shadow. The space round it is padding on the list content (`content`), never margins, because Android leaves a content container's margins out of the scroll range. |
| Header row | `footnote` weight 600 in `table.headerText` on `table.headerFill`, a 1 dp `table.separator` under it. |
| Body rows | `subhead` (or `body`) in `text.primary`, at least `touchTarget` tall, a one-line row centred in that height, a 1 dp `table.divider` between rows. A read-only table may pass a compact row of 36 (`rowStyle`, [5.2](#52-layout)). No alternate shading. |
| Cells | Numbers right-aligned with tabular figures; text left-aligned; status as a `StatusTag`; an empty cell shows "—". A rate column may carry its unit in the heading ("Charge (₹)") and plain grouped numbers in the cells. |
| Totals row | Weight 600, a 1 dp `table.separator` above it. It is always the total of every row, whatever the sort. |
| Note | A note about a table's figures sits inside its card, under the totals. |
| Open row | The row and its details are one panel on `table.insetFill`, closed by a `table.separator`, with a 3 dp `table.accent` bar at the start (`OpenBar`, its own view laid over the panel) and the chevron in `table.accent`. The details use the full width of the panel, starting in line with the chevron. |
| Nested table | Rows on `surface.card`, `radius.field`, a 1 dp `table.outline`, heading row on `table.headerFill`. It follows the same width rules on its own row. |

**Brand and mode:** `table.accent` is the brand tint, so the open-row bar and chevron are orange or navy. In dark mode the outline is lighter (`#4A5868`), so the card keeps a visible edge on the dark page, and the heading row is lighter than the rows, never darker, so it does not read as a gap ([3.8](#38-the-mode-axis)).

#### Rows that open, and links

- A row with details opens under itself on a tap, with a chevron at the start of the row (`chevron-right` closed, `chevron-down` open). Opening and closing animates the layout once (`easeInEaseOut`).
- A row that opens another screen uses `onRowPress`. In a table whose rows open something, a row that cannot (no dispatches yet, an invoice without an id) is drawn as a disabled button (`rowPressable`).
- A link inside a row is a separate target of at least `touchTarget`, and is also offered to screen readers as an action on the row (`rowActions`).
- Each row reads as one element (`rowLabel`), and an open row says it is expanded.

#### Sorting

- Only a column that sets `enableSorting: true` sorts. Its heading is a button of at least `touchTarget` height with an arrow at `iconSize.xs`: `swap-vertical` in `icon.secondary` while not sorted, `arrow-up` or `arrow-down` in `brand.tint` while sorted.
- A tap moves through not sorted → ascending → descending → not sorted, one column at a time. TalkBack names the column and whether it is sorted.
- Sorted today: GRN → Items, Dispatch → Items, the Invoices tab of a GRN or dispatch, and Reports → Invoice history → Monthly breakdown.

#### Fitting a phone

A table fits the screen and never scrolls sideways, whatever its number of columns (two exceptions, by the owner's decisions of 2026-10-19: the line table of the invoice's Items step, and the same table, read-only, in the opened lots of Invoice → Line items; both below).

- **Design edge.** Design and test for quantities and their totals up to 9,999 bags and amounts and their totals up to ₹99,999.00. Column widths at font scale 1 fit these (the invoice amount column, 84 dp, fits "₹99,999.00" in weight 600), so at the edge a table keeps its columns at font scale 1.3 on a 411 dp phone. Larger numbers may fall out of place; the stacking rules below are their fallback.
- **One width per number column.** Each number column has one width for the whole table: its width at font scale 1 grown with the text, or its widest value or total if that is wider (`numberColumnWidth`). Numbers line up from row to row and never split.
- **Stacking.** From font scale 1.5 (`TABLE_STACK_SCALE`), or when the number columns would leave the first column less than 25 % of the row or less than 5 em of its text (`crowded`), the middle columns move under the first. Ordinary data keeps its columns.
- **The last column alone.** If even the last column would crowd the first, or would take more than 45 % of a stacked row (a large amount at large text), its value goes on its own line under the first column, right-aligned.
- **Wide screens.** On phones a date goes under its number. From 600 dp (`TABLE_WIDE_WIDTH`) it gets its own column, and so does the GRN page's Dispatches column, whose heading is wider than its counts. On a phone that count goes under the item.
- **One line.** A cell sized to its text may shrink a little to stay on one line (`ONE_LINE`). Text the column is not sized for, such as a package mark under GRN/Received, is cut with "…" at the normal size (`CUT_LINE`), because Android ignores `minimumFontScale` and would shrink it until it cannot be read. The full text is shown elsewhere (the GRNs tab, the row's screen-reader label). In the nested line tables of the GRN and Dispatch cards, and the amounts table of the Invoices list card, the figures are not shrunk at all (`numberOfLines={1}` only, columns drawn `space.xs` wider than the estimate) because Android's auto-size measured one row wrongly and drew its figures tiny (phone run GL, 2026-10-18); the package mark there is cut with `CUT_LINE` and the weight sits on its own line under it.
- **No-break units.** A number keeps its unit and a label keeps its amount at a line break ("50 kg each", "21 months", "Tax 18%"): `nb()` puts no-break spaces there and leaves the breaks around "·".
- The Monthly breakdown shows Month | Invoices | Amount | Paid | Pending when it fits, else the count under the month, else only Amount as a column.

#### Editable tables

Editable cells follow the editable-cell rule in [13.2](#132-text-fields--uiinputtsx-ghosttextinputtsx-remoteautocompleteinputtsx-form-formfieldwrappertsx). Two editable tables draw their own rows with the shared styles and sizing, because their cells are text inputs: the invoice form's items (`invoice/components/items/InvoiceItemsEditor.tsx`, a keyboard-aware, virtualized FlashList) and the rate box of Item pricing (`item-pricing/components/BandsTable.tsx`). The invoice's items use the cell `table/EditableNumberCell.tsx` (the rate box draws its own cells for now) and describe the columns of an open card's line table with the TanStack setup (`createAppColumnHelper`, `useAppTable`, `invoice/components/items/lineColumns.ts`: headings, widths and which cells a row has come from the column meta); the rows are not drawn by `DataTable` but are parts of the page's virtualized list, so an open card never draws all its lines at once. The rate box is the model:

- One card in the object-page style: the heading row of units ("Up to (kg) | Rent (₹) | Labour (₹) | Tax (%)"), the hint "Tap a figure to change it." under it, and a row per record.
- Each figure is a borderless `TextInput`: `subhead`, right-aligned tabular numbers, `selectTextOnFocus`, a number or decimal pad, at least `touchTarget` tall, `maxFontSizeMultiplier` 1.3 so a column sized to its text never splits a figure.
- The cell being typed in has the 2 px `border.fieldFocus` ring, and a wrong one the 2 px `status.negative.border` ring. Nothing else marks a cell as a field.
- Each cell has its own `accessibilityLabel` ("Rent, 0 to 100 kg, rupees per bag, per month": field, record, unit), with its row's error in the `accessibilityHint`. The same error is a line under the row. The Next key walks the cells row by row, and its key says what it does: "next" while another field follows, "done" on the last field of the page. In the card fallback the field keeps this same spoken label (the visible label is only the heading).
- Add and remove controls sit in or under the card. Figures shared by every row (labour and tax when the bands do not differ) are rows under the records, not columns.
- From font scale 1.3, or when the columns would leave the first column less than it needs, the table is not drawn: the same fields are cards, one per record (`BandsEditor`), so large text and narrow screens share one fallback.

The invoice's Items step (Invoice → "Step 2 of 3 · Items") applies the same rules to a page of cards:

- One card for each item and mark, with its total in the heading (name, the mark on up to two lines with the full mark in the spoken label, no chip for a missing mark, the weights; "120 of 150 bags dispatched" is a line of its own under the name and total, across the heading's width, each number kept with the words beside it (`nb`: "120 of 150 bags" stays whole), never cut, so it fits one line at large text sizes and wraps, if ever, only before "dispatched" (Gujarati: between નંગ, જાવક and થયા). It is part of the heading's screen-reader element). The heading's total is the card's total: there is no separate total row and no pricing pencil (owner decision, 2026-10-19; prices are changed in Settings → Item pricing). The parts of the card, top to bottom: the heading, the part for what all lines share (below), a toggle, and, while the group is open, the lines. The dispatch lines are closed by default, behind a full-width toggle at the bottom of the card (at least `touchTarget` tall): a chevron in `table.accent` at the start (`chevron-right` closed, `chevron-down` open) and "Show dispatch details (N)" or "Hide dispatch details", N being the number of lines. It is a button with `accessibilityState.expanded` and a spoken label with the item, the mark and N. Open, the lines are the sideways-scrolling table described below (`Dispatch | Date | Months | Days | Qty | Charge (₹) | Labour (₹) | Tax (%) | Amount`, Dispatch pinned, Tax read-only), with the hint "Swipe the table sideways to see more" under the heading row when the columns are wider than the screen. Every group starts closed when the step is first drawn (coming back from Review keeps the groups as the user left them), except a group of exactly one line, which starts open: it has no "(all lines)" Charge row, so its charge could not be changed otherwise. In table mode no group shows "Tap a figure to change it." (the input boxes show which figures can be changed); cards show it under the heading in both states. A closed group whose lines hold refused text says so under its toggle, in `status.negative.text` ("1 figure to fix", "2 figures to fix"), and in the toggle's spoken label; the count follows the fields as they are typed, settled or fixed. Next counts refused text in every group, closed ones too; if the first wrong figure is in a closed group the group opens, and the page scrolls to the figure and focuses it. Closing a group with a focused cell leaves the cell first (its text is settled and its error shown). Opening and closing has no animation, because the rows are virtualized: a card of hundreds of lines draws only the rows on screen. The card is one card in both states: the last part, the toggle when closed and the last line when open, draws the bottom edge.
- Under the heading, one part for what all lines share, in both modes: "Charge (₹)" for 2 or more lines, "Labour (₹)" for 2 or more lines (not for a one-time GRN; one line has its own Labour cell) and "Tax (%)", which is always shown (owner decision, 2026-10-19: tax is set here only, so the field says "Mixed" rather than going away), headed "All dispatches" (in both modes) for 2 or more lines. The fields stand side by side in one row of equal columns (1 to 3, gap `space.sm`), each with its short label, the field, its notes and, under it, + then − buttons (the order of the GRN rate sheet, §13.9). Each button fills its share of the column: a 36 dp tall outlined box (`border.button`, `brand.tint` icon, `brand.subtle` while pressed) inside a touch area at least `touchTarget` wide and tall, the look of the GRN rate sheet's buttons. These three fields have no clear button, because the columns are narrow (`selectTextOnFocus` replaces it). A press steps the figure by 0.25 (Charge, Labour) or 1 (Tax), rounds it to the field's precision, holds it from 0 to the field's maximum and applies it as if it had been typed in the field and accepted (lines with a figure typed on the line keep theirs); a focused field is left first and no keyboard opens; there is no press-and-hold repeat. Both buttons are disabled while Labour or Tax shows "Mixed", while every line keeps its own charge or labour (there is nothing to set), or while the field holds refused or unfinished text (".", for example), − at 0 and + at the maximum; Charge under an average steps from the rate shared by the lines without their own charge (below). Each has `accessibilityRole="button"`, a spoken label with the amount, the item and its mark ("Raise the tax by 1%, Example Potatoes, mark A12"; "Lower the charge by ₹0.25, …"), and the new value is announced after a press with the field name and unit in words ("Charge 5.25 rupees", "Tax 3.5 percent"). A burst of presses holds the layout and re-measures it once, a moment after the last press, as after typing. The buttons are not in the Next key's walk. The cells use `maxFontSizeMultiplier` 1.3; when a column would be narrower than its widest figure or two touch targets (about 104 dp), or from font scale 1.5, the same parts stack one under the other, full width, each field with its buttons (decided from the layout that is held while a field has the focus, as table or cards is). Labour and Tax are empty with "Mixed" while the lines without their own figure differ among themselves and no group figure has been applied; where some lines keep their own labour (typed on the line, or saved differently on an edited invoice) and the others share one figure, the field shows that figure with the note "N lines keep their own labour", and its + / − step from it and set the lines without their own only; after a shared entry, the field shows the applied figure while lines with their own keep theirs. Emptying a field that showed "Mixed" (or Charge's average) puts the lines back as they were and applies nothing (it is not 0), so the placeholder returns and the + / − do not step from 0. **Charge never says "Mixed" (owner decision, 2026-10-19):** while its lines differ it shows their average charge weighted by bag-months, Σ(charge × qty × months) / Σ(qty × months) over all the lines (for a one-time GRN weighted by bags, Σ(charge × qty) / Σ(qty); the plain mean when the weights add up to 0), rounded to 2 decimals: the one charge that, on every line, gives the same storage total (the rule of `calculateItemAmounts`). A note under it, in `text.secondary`, says "Average of 5 lines", and the note below counts the lines that keep a figure of their own, typed on the line or saved differently ("2 lines keep their own charge", a second line of the same note). Its spoken label says it is an average. A figure typed or stepped there is applied as before, to every line that has no charge typed on the line; the field then shows the new average of the group, and while it has the focus it shows what is typed. + and − do not step from the shown average, because a press sets only the lines without their own charge and those would jump by more than 0.25: they step (± 0.25, held in 0 to 9999.99) from the rate that the lines without their own charge (none typed on the line) all share, and apply the result like a typed figure. They are disabled when those lines share no single rate and when every line keeps its own charge (on an edited invoice a free line in the minority of its weight set is marked as its own, so + / − set the others). While the field has the focus with valid typed text, a press steps from that text; once the field is left, from the shared rate. The announcement states the figure actually set: "Charge 4.75 rupees set on the lines without their own charge". The average equals the storage total of the lines up to the 2-decimal rounding of the rate. The average is a value, not structure: the plan of the page does not change with it.  A Labour typed on a line (below) is that line's own: the lines without one still take the figure typed or stepped here, and the note "N lines keep their own labour" counts the others. Tax has no line figure to edit, so a figure typed or stepped here sets every line's tax. **When an invoice is opened for editing (owner decision, 2026-10-19),** saved per-dispatch exceptions are marked for Charge and Labour (never Tax). Lines are compared within each set of one card, one item and one bag weight (a card can hold weight bands priced differently on purpose), on the rounded figure. A set marks only on a strict majority, one figure held by more lines than any other; the lines with another figure are recorded in `itemOverrides` like typed ones, so an "All dispatches" entry skips them and the note "N lines keep their own labour" counts them. On any tie, and for a set of one line, nothing is marked (so the order of the lines never matters), and the card then shows "Mixed" for Labour as on a new invoice. A new invoice starts with no marks; changing the GRN of an edit starts with none, and choosing the saved GRN again marks its lines the same way.
- **The line table (open "Show dispatch details").** One table for the lines of the card, drawn the same at every text size and width (`InvoiceItemsEditor`, `LineRow`, `ColumnHeadings`, `SidewaysViewport`), described with the app's TanStack setup (`createAppColumnHelper`, `lineColumns.ts`).
  - **Columns, left to right:** Dispatch (the dispatch number, weight 600; **pinned**: it stays on the left while the rest scrolls, behind a 1 dp `table.divider`), Date (the dispatch date as DD/MM/YY, "01/06/23", in the language's digits, `formatDateShort`; the line card keeps "9 Oct"), Months (the number alone, "1" or "1.6", in the language's digits; "One-time" for a one-time GRN; the line card keeps "1.6 months"), Days, Qty, Charge (₹), Labour (₹) (not for a one-time GRN), Tax (%) and Amount. **Tax is read-only (owner decision, 2026-10-19):** a plain figure after Labour, right-aligned like the money columns, in the tax text format ("5", "2.5") and the language's digits, sized for its widest figure or its heading plus the gap; it has no box and cannot be typed (the line card has no Tax field either). **The Labour box is sized for "999.99"** (Charge's for "9999.99") **or the widest stored Labour figure on the invoice (the layout is shared by all cards), whichever is wider,** so a stored figure is never clipped; its heading may wrap to two lines so the column is only as wide as the box or the heading's longest word. The entry limit of Labour is unchanged. The texts are the ones the line card uses (`lineText.ts`), in the language's digits (dispatch numbers keep 0-9).
  - **Widths:** each column is as wide as its widest text and heading at the current text size: the guide's `numberColumnWidth` for the figures, Date estimated from character widths, the widest dispatch number for the pinned column, plus `space.lg` before each column (one even gap between all columns, owner decision 2026-10-19); Charge and Labour also hold the cell's input box (ring or frame and padding), and Amount `space.md` after it. **Months is sized to its widest figure** (at least the width of a three-digit figure) **plus `space.xs` padding each side**, not to its heading: the heading shrinks a little (`ONE_LINE`) to stay on one line, in Gujarati too. There is no crowding check and no switch to cards because of width or text size. The widths are worked out once per layout (`itemsLayout.ts`), from the snapshot the editor holds while a cell is focused, not per row, so no column moves under a finger.
  - **Alignment (owner decision, 2026-10-19, this table only):** Date, Months, Days and Qty are **centred** in their columns, with centred headings; the money columns (the Charge and Labour input boxes, Tax, Amount) stay right-aligned, headings too, so decimals line up; the pinned Dispatch column is left-aligned. The gap before an input box column is the same `space.lg`, so a figure never touches a box. The focus reveal (`scrollToReveal`), the edge cues and the heading row use these widths and gaps.
  - **Editing:** the Charge is typed in its cell (`EditableNumberCell`: the same validation, the 9999.99 entry limit, refused text kept and shown when the cell is left, the focus ring, `selectTextOnFocus`, amounts following the keys, the layout held while focused). **Owner decision, 2026-10-19, for this table only: an editable cell is an input box at rest**, not a borderless figure: a 1 dp `border.field` frame on `surface.field` with `radius.field` (the look of §13.2 and of the "All dispatches" fields), the 2 dp `border.fieldFocus` or `status.negative.border` ring taking one dp from the padding so the cell never changes size, at least `touchTarget` tall; read-only figures stay plain text, so it is clear at a glance which columns can be changed. This overrides "Each figure is a borderless `TextInput`" above for the invoice's line table; the Item pricing rate box keeps its borderless cells. **Labour is an input box on every line (a per-dispatch labour exception; not in a one-time GRN, which has no labour):** it is typed, validated (its own limit) and walked by Next exactly as the Charge, and a typed labour is recorded on the line like a typed charge (`itemOverrides`), so the line keeps it when "All dispatches" Labour is typed or stepped. The Next key walks Charge, then Labour, line by line. Tax is shown in its own read-only column and is set from the "All dispatches" part only. **A line has no + / − buttons** in the table; those belong to the "All dispatches" part and to the line cards.
  - **One sideways position for the card:** the heading row and every line row of one open card move together, so the columns always line up and Dispatch stays pinned. The position is one shared value for the card (Reanimated). Each row draws the pinned Dispatch cell and a clipped viewport (`overflow: hidden`) whose row of cells is moved by `translateX: -offset` on the UI thread. A horizontal pan (react-native-gesture-handler, `activeOffsetX` 10 dp, `failOffsetY` 10 dp, so an up-down swipe fails the pan and scrolls the page) covers the whole heading row and every whole line row, the pinned Dispatch cell included (only the scrolling part moves), and sets the offset, held between 0 and the scrolling columns' width less the visible width, and a fling ends with a decay clamped the same. The rows remain parts of the page's virtualized list, so a card of 307 lines still draws only the rows on screen; the table is never one horizontal scroll view.
  - **Edge cues:** when columns are off to the left or to the right, the edge shows a short fade into the card (one gradient from the row's fill to clear) and a ◂ or ▸ in `text.secondary`; each fades out as the table reaches that end. Under the heading row the hint, when the columns are wider than the screen, is "Swipe the table sideways to see more". The hint "Tap a figure to change it." is not drawn for this table (the input boxes show which figures can be changed); it stays on line cards, where it is the only cue besides the boxes.
  - **Focus reveal:** a cell that takes the focus, by a tap or by the Next key, and is partly hidden sideways, moves the position (200 ms) so the cell is fully visible, with room beside it: `space.xs` more than the cue's width on a side that has columns beyond it (the cell is clear of the fade and the ◂ ▸), 8 dp on a side that has none; Next with a wrong figure (`checkAll`) opens the card, brings the cell into view and focuses it.
  - **Touches:** the view around a cell's input ignores touches (the rule below), so a tap on a cell inside the moved row hits that cell where it is drawn; a vertical swipe that starts on the table scrolls the page, a horizontal one scrolls the table.
  - **While a screen reader (TalkBack) is on,** the lines are line cards instead, because a sideways pan and a cell whose wrapper ignores touches are not reachable by explore-by-touch. In a card each editable figure is a short input sized for the largest figure expected ("9999.99", or the group's widest stored figure, whichever is wider, at the field's text size, with no clear button) with + then − side by side right after it (each a `touchTarget` square with a 36 x 40 dp outlined box inside, `border.button`, `brand.tint` icon, `brand.subtle` while pressed). The steps are 0.25 (Charge, Labour), rounded and held in 0 to the field's maximum: Charge 0 to 9999.99 (the owner's limit of 2026-10-19 on typing and on the steppers, for the line and the "(all lines)" figure alike; the server still accepts more, and Next and Save check the server's range, so a stored figure above 9999.99 is kept and passes, and − brings it to 9999.99 in one press, spoken "Lower the charge to ₹9999.99" while + stays disabled), Labour 0 to 999999. A press equals typing and accepting that figure in that line's field, so the line keeps its own figure (the shared Charge then shows the average of the lines instead of the rate they had, and the "N lines keep their own charge" note counts it); a focused field is left first, no keyboard opens. Both buttons are disabled while the field holds refused or unfinished text, − at 0 and + at the maximum; the labels are spoken with the dispatch ("Raise the charge by ₹0.25, dispatch I0042") and the new value is announced as for the shared buttons. The buttons are not in the Next key's walk.
  - A row is a touch target tall with `space.xs` above and below; an error line under it makes it taller. Rows are measured by the list, so a taller row moves the parts below it.
- **Owner decision, 2026-10-19: this section's table scrolls sideways; every other table follows "never scrolls sideways" (§13.7).** The exception covers the line table of an open card of the invoice's Items step, and (owner decision, 2026-10-19) the same table, read-only, in the opened lots of Invoice → Line items. They are the only tables that scroll sideways, and only because they have nine columns that all matter to the person pricing the lines (Step 2) or checking what was billed (Line items).
- The page is one list of card parts (head, the shared part, toggle and, while open, column headings and one row per line). Each part has its own type and a key that follows its record, not its place, so a change to one part (an error line, the "Mixed" note) changes the parts of that group only. A part's height is not fixed: an error line, a note or the hint makes it taller and moves the parts below it.
- The layout (the column widths) never changes while a field is focused, so the keyboard is never taken from a field in the middle of typing; it is looked at again a moment after the field is left. The group total in the heading goes under the name, in full, when it would not fit beside it. A card field is at least `touchTarget` tall.
- The focus ring, the selection and the text of a cell belong to the cell of that line and field (the cell is keyed by it), never to a list row the list reuses for another line. A touch over a table cell always belongs to the list (the view around the input ignores touches), so a vertical swipe over the table scrolls the page and a horizontal one scrolls the line table; a tap, on the cell's `Pressable`, scrolls the row into the upper part of the screen and focuses the cell, and a second tap on the focused cell selects all its text. The layout is held from the touch down until the cell is left. While a screen reader is on the lines are cards (the only case), because TalkBack's explore-by-touch does not reach a cell whose wrapper ignores touches. When the keyboard hides (the Android Back key) the focused cell is left, so its error shows and the next tap selects its text again.
- A valid figure is applied as it is typed, so the amounts follow the keys. A refused figure (out of range, more than 2 decimals, a minus sign, not a number) is kept in the cell but the form holds the value the cell had when it gained focus, so no total ever shows a refused or partial value. The error shows when the cell is left; Next announces how many figures are wrong, scrolls to the first and focuses it, and the step does not go on. While a cell is focused it shows the text exactly as typed ("5", "5.", "5.5"); once it is left charge and labour show two decimals ("12.50") and tax is shown as stored ("5", "2.5"). Tax is one figure for each item and mark (the shared "All dispatches" part); Labour is that figure too unless a line has its own typed in the table.

#### Where tables are used

- **On `DataTable`:**
  - GRN → Items, Dispatches, Invoices; Dispatch → Items, GRNs, Invoices; Invoice → Line items; GRN → Overview → Rates.
  - Invoice → Line items: the summary rows (Item | Bags | Amount) are on `DataTable`; the opened lot shows the same sideways table as the invoice form's Step 2 "Show dispatch details", read-only (`invoice/components/items/ReadOnlyLineTable.tsx`; owner decision, 2026-10-19): Dispatch pinned (a link that opens the dispatch) | Date | Months | Days | Qty | Charge (₹) | Labour (₹, not in a one-time lot) | Tax (%) | Amount, with the same alignment, shared sideways offset per lot, edge cues and the hint. Structure: the rows are not virtualized (the lot is a `DataTable` detail panel) so they are kept light: the heading and the body are two sideways viewports sharing one offset, the body being one viewport with a pinned column of all the Dispatch cells and one column of all the rows' cells, one fade per edge for its full height and one ◂ / ▸; every row has the same fixed height (a touch target, or the text's line height at the current text size, plus `space.xs` above and below) and every cell is one line, so the two parts line up. The column widths are sized over every line of the whole invoice, not one lot, so the columns line up from lot to lot. With a screen reader on, each line is still one element: the cells are hidden from it and one transparent element per line, a row high, reads the whole line (the date as "10 May") and opens the dispatch with the activate action; the swipe hint is not drawn.
  - The GRN form's Review step (Items and Rates).
  - The Invoice form's Review step (`invoice/screens/InvoiceReviewStep.tsx`, `invoice/components/review/InvoiceReviewItemsTable.tsx`, `variant="nested"`, Item | Qty | Amount, in the same folding card: INVOICE DETAILS, ITEMS, CHARGES; CHARGES is open first and opens again after a refused save). One row per item group, widths and stacking as in the invoice page's Items table (Qty under the item from font scale 1.5 or when the columns crowd it, the amount too when it would still crowd); the total row has the bags and the sum of the groups.
  - The Dispatch form's Review step (`dispatch/screens/DispatchReviewStep.tsx`, `variant="nested"`, Item | GRN/Received | Qty, in the same folding card as the GRN Review: DETAILS, PHOTOS on a new dispatch, ITEMS). The item cell holds the name, the mark and tags for the weight, the rack ("Rack —" without one) and the stock ("35 left" in a new dispatch, "90 in stock" or "Checking stock" in an edit); when the columns crowd the item, or from font scale 1.5, the GRN text moves under it, and a Qty that would still crowd it goes under it too, right-aligned. The total row has the item lines, the GRNs and the bags; in an edit the hint is the note under it.
  - The rate screens' reference tables and the Old/New figures of "Change the rate?".
  - Item pricing's default rates, its changes table and the read-only band list.
  - Reports → Invoice history → Monthly breakdown.
  - The table views of the stock trend and the sensor history charts.
  - The amounts of the Invoices list card (`list-items/MemoizedInvoiceItem.tsx`, `variant="nested"`, `hideHeader`, label | amount, no heading row): one row per amount in the order and wording of the invoice's Breakdown tab (Net before tax; Discount (included) or Surcharge (included), only when there is one; Labour (included), only when there is some; Tax), then a Total in the footer in weight 600 under a separator. Net before tax is the total less the tax, so Net + Tax = Total; the discount and labour rows say what the net already contains and are not added. A discount has a minus sign in `status.positive.text`, a surcharge a plus sign in `text.primary`. A missing amount is 0 (as on the details screen), and a row with nothing in it is left out: an invoice with no tax has no Tax row, and its Net before tax equals the Total. The rows are the compact 36 dp rows of the read-only tables (`space.sm` above and below), the Total included; the table takes the card's colour, so it follows the card's pressed state. The table is read-only and hidden from screen readers (`importantForAccessibility="no-hide-descendants"` and `accessibilityElementsHidden`): the card is one button whose label reads the same rows in the same order and wording ("Discount (included) -₹100.00") as one block after the Total. The amount column is sized to its widest value and the Total (`numberColumnWidth`), the figures on one line (`numberOfLines={1}`, never shrunk). At large text, when `lastColumnAlone` says the amount column would crowd the label, the table keeps one column: the label with its amount on its own line under it, at the end, and the Total row the same way (as the GRN review's `totalStacked`); at font scale 1.3 on a 411 dp phone it keeps two columns.
  - The lines of an open card on the GRN tab (`variant="nested"`, Item | Bags | Kg each | Stock). When the columns crowd the item, "Kg each" moves under it; if Bags and Stock still crowd it, Bags moves too; and a Stock that would still crowd the item, or take more than 45 % of the row, goes on its own line under it, right-aligned. A line that is not In stock has its status tag under the item.
  - The lines of an open card on the Dispatch list (`list-items/MemoizedDispatchItem.tsx`, `variant="nested"`, Item | Kg each | GRN | Qty). When the columns crowd the item, or from font scale 1.5, "Kg each" and the GRN text move under it, leaving Item | Qty; a Qty that would still crowd the item, or take more than 45 % of the row, goes on its own line under it, right-aligned. The GRN text is left-aligned, as on Dispatch → Items; the figures and the GRN text in its column are sized to their values (capital letters counted wide, W and M widest) and stay on one line; under the item the GRN text may wrap instead of ending in "…". The layout counts the 4 dp margin the columns are drawn with, so on 392 dp at font scale 1 the lines already stack to Item | Qty. The searched words are bold in the GR number. The row's spoken label has the full package mark. On both tables "Kg each" has 72 dp at font scale 1, room for its Gujarati heading on one line.
- **Not on `DataTable` yet:** the small item tables inside list cards. These are the order queue (`list-items/CustomerOrderGroupCard.tsx`) and recent dispatched orders (`list-items/RecentDispatchedOrderCard.tsx`). They still draw their own header and rows, without the `table.*` tokens or the width rules. A change to one of them moves it onto `DataTable` with `variant="nested"`.

### 13.8 Headers and navigation

| Component | Spec |
|---|---|
| Stack header (expo-router) | `surface.header`, title `headline` (`title2` large titles on top-level iOS screens), tint `brand.tint` for back and actions, no shadow, hairline `border.divider` bottom. |
| Hero headers (`dispatch-details/DispatchHeroHeader.tsx`, `grn-details/GRNHeroHeader.tsx`, `invoice-details/InvoiceHeroHeader.tsx`, `reports/ReportHeader.tsx`, `grn/components/item-form/HeroBanner.tsx`) | Object page header on `surface.card`: document type `footnote` `text.secondary`, number `title2`, key facts as `KeyValueCell` pairs, status tag, then header actions. A brand-filled header is allowed only on the home screen and uses `brand.fill` with `brand.onFill` text and `overlay.onBrandSubtle` buttons. |
| `FioriTabBar.tsx` | `surface.tabBar`, top hairline `border.divider`, height 49 plus the bottom inset. Selected: filled icon and label in `brand.tint`. Unselected: outline icon and label in `icon.secondary` and `text.secondary`. Labels `caption2`, always visible. Badges per [13.5](#135-chips-badges-and-indicators). At most five tabs. |
| Detail tabs (`common/GenericDetailTabNavigator.tsx`, `*-details/*TabNavigator.tsx`) | Top tabs on `surface.header`; selected label `brand.tint` with a 2 px `brand.tint` underline; unselected `text.secondary`; label `subhead` weight 600; scrollable when more than four. |
| Step indicators (`StepIndicator.tsx`, `GenericStepIndicatorHeader.tsx`, `GRNStepIndicator`, `DispatchStepIndicator`, `InvoiceStepIndicator`) | Circles 28 px, each with a `touchTarget`-wide touch target (the connector is `touchTarget` less 28 wide, so the targets meet). Current: `brand.fill` with `brand.onFill` number. Completed: `brand.tint` outline with a check. Upcoming: `border.field` outline with `text.secondary` number. Connector 2 px, completed `brand.tint`, else `border.divider`. Step names under the circles in `caption1`; on phones show only the current step name. |
| Form chrome (`GRNFormHeader.tsx`, `WizardBottomBar.tsx` (the bottom bar for every wizard), `dispatch/components/DispatchFormHeader.tsx`, `form/FormStepWrapper.tsx`, `SwipeableFormStep.tsx`) | Header shows the step title and progress. The bottom bar sits on `surface.card` with `shadow[3]`, holds Back (secondary) and Next or Save (primary). Every wizard uses it. It adds the bottom inset on iOS only (the root stack already pads Android screens by it), and from font scale 1.5 the two buttons stack with the primary one on top and first in the reading and focus order. The step header's title wraps to two lines before it is cut. |

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
| `ConfirmDialog.tsx`, `PrintRangeDialog.tsx`, `DocumentSuccessDialog.tsx`, `invoice/components/InvoiceSuccessDialog.tsx`, `ForceUpdateModal.tsx`, `UpdatePrompt.tsx` | `surface.sheet`, `radius.card`, `shadow[4]`, over `overlay.scrim`. Optional icon (`warning` uses `status.critical.text`, `danger` uses `status.negative.text`, success uses `status.positive.text`). Title `title3`, message `body` `text.secondary`. Buttons: Cancel secondary, the action primary (negative style when destructive). Max width 420. Back button and tapping the scrim cancel, except for a forced update. While the action runs (`busy`) the action shows a spinner, both buttons are disabled, and Back and the scrim do nothing. |
| `ConfirmInputDialog.tsx` (a confirmation with a field, or with a long message) | Looks like `ConfirmDialog`. The body (icon, title, message, field, error) scrolls with `keyboardShouldPersistTaps="handled"`; Cancel and the action sit below it, outside the scroll, and stay visible above the keyboard (keyboard rule in [5.2](#52-layout)). The dialog is at most the height left above the keyboard. An error under the field is a live region. The field's return key is Done and never confirms. |
| Bottom sheets (`ChangeLogBottomSheet`, `common/ItemsSummaryBottomSheet`, `common/SearchableBottomSheet`, `CustomerSearchBottomSheet`, `PrintJobsBottomSheet`, `RolePickerBottomSheet`, `OrderBusinessSheet`, `dispatch/components/*BottomSheet`, `grn/components/*BottomSheet`) | `surface.sheet`, top corners `radius.sheet`, grab handle 36 × 4 in `border.separator`, `shadow[4]`, scrim behind. Title `headline` with a close or Done action. Content scrolls; actions stay pinned at the bottom with the safe-area inset. Searchable sheets put the search field at the top and keep it visible. |
| Full-screen form over a step (`grn/rates/GrnRateSheet.tsx`) | A `Modal` with `presentationStyle="fullScreen"`, padded by the insets, `KeyboardAvoidingView` as in [5.2](#52-layout). Header: close at the start, a `footnote` line of facts over the object in `headline`, each one line. Fields in the order they are filled; short numbers side by side as `Input`s (stacked from font scale 1.3) with + and − under each (36 drawn, `touchTarget` with hitSlop, 8 apart, disabled at their limits); a short choice is a `SegmentedControl` (chips at large text) under a full-width line, in the main text colour with an accent chevron, that says what the choice does and opens the explanation in an outlined panel. A fixed fact is a full-width filled pill; a section that opens is a full-width outlined pill that opens into the same box. A wrong field turns red with its limit in its label (`invalid`). The primary action is pinned at the bottom above the keyboard, disabled until something changed when editing; leaving with changes asks "Discard changes?". |
| Filter screens (`app/list-filters.tsx`, `features/filters/components/SingleFilterSheet.tsx`) | The page "Sort and filter": one card per filter under a section heading, close at the start of the header, "Reset" at its end, and one primary button at the bottom that names the result ("Show 34 items", "No items match"; the GRN list counts GRNs: "Show 9 GRNs"). The button is disabled only while something is still to be entered (both days of a required period); a value that is wrong (a range the wrong way round) leaves it pressable, and a press announces what to fix, applies nothing, and moves focus to the first wrong field's error (the page also scrolls that field into view). The header's close, Reset and Done are whole `touchTarget` targets, never text with a hitSlop. Long choices (customers, items) open inside the page with Back. A chip opens a short sheet for that one filter with the same button. The button stays above the keyboard. Closing the page with changes asks first. |
| Message strip (inline, `fiori/InlineValidation.tsx`) | `status.*.background`, 1 px `status.*.border`, `radius.button`, icon plus text in `status.*.text`. Variants `helper` (no container, `text.secondary`), `success`, `warning`, `error`. |
| Banners (`OfflineBanner.tsx`, `TokenExpiryBanner.tsx`) | Full-width under the header. Offline: `status.neutral.background`, `cloud-off-outline`. Session expiring: `status.critical.background` with a "Sign in again" tertiary action. Never cover content; push it down. |
| Snackbar / toast | `surface.inverse` background with `text.inverse` text (16.86:1 light, 14.64:1 dark), `shadow[3]`, `radius.button`, above the tab bar, 4 seconds. One optional action in `text.inverse`, weight 600, underlined. Never for errors that need action; use a message strip or dialog for those. `showToast` (`src/utils/toast.ts`) and `ToastHost` (mounted once in `app/_layout.tsx`) are the one way to show it. |
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
| `reports/AgingBucketBar.tsx` | Stock-age buckets, youngest first. Each row: `StatusTag` for the bucket, then the share (`subhead` 600, tabular, right) and the quantity with its unit (`footnote` `text.secondary`, tabular, right) on a line that wraps. Below, a full-width track (`brand.subtleStrong`, `space.sm` high) filled with `status.*.element` to the bucket's share of the total, so the bars add up to 100%. The group is one accessible element with one sentence per bucket; an all-zero set says "No stock yet". |
| `invoice/components/InvoiceCalculationSummary.tsx`, `invoice-details/InvoiceBreakdownTab.tsx` | Key-value rows, amounts right-aligned with tabular numbers; total in `headline`; discounts in `status.positive.text` with a minus sign; taxes listed separately. |

More rules:

- KPI trends: whether up is good is set per KPI with `upIsGood`; without it the trend shows in `text.secondary`.
- A second series in another unit (humidity next to temperature) gets a secondary axis or its own chart, never the first series' scale.
- Temperature charts take their y range from the readings (cold rooms run below zero) and leave gaps for missing readings rather than drawing zero.

**Brand and mode:** `tokens.chart` and `tokens.avatar` are separate series for light and dark mode, and are the same in both brands. Use the series of the current mode, in order.

### 13.12 Branding

| Component | Spec |
|---|---|
| `BrandMark.tsx` | Orange brand: the template logo image. GCSA brand: the "GCSA" wordmark (`typography.wordmark`, `brandMark.wordmark`), a 4 px rule (`brandMark.rule`) and "COLD STORAGE ASSOCIATION" in `caption1` (`brandMark.caption`). In dark mode the GCSA mark sits on `brandMark.panel` (white) with `radius.sheet` so the logo navy is kept. The association's own logo file replaces the wordmark once the association approves its use. |
| App name | `EXPO_PUBLIC_APP_NAME`, shown under the mark on sign-in in `subhead` `text.secondary`. |

### 13.13 Other components

| Component | Spec |
|---|---|
| `ItemCatalogBrowser.tsx`, `RecentItemsQuickAdd.tsx`, `RecentDispatchesSection.tsx`, `RecentDispatchedOrdersSection.tsx`, `CustomerOrderSummary.tsx`, `DispatchHistorySummary.tsx`, `OrderManagement.tsx` | Composed of the cells, chips, section headers and cards above; no local colours. Quick-add tiles use `brand.subtle` with `brand.tint` text. |
| `ItemCatalogBrowser.tsx` (the Add items picker of an order) | Closing with selections that were not added asks "Discard selections?" first, whichever way it is closed (Cancel, Back, a tap outside, a swipe down); with none it closes at once. "Keep editing" leaves the sheet on screen, also when a swipe had taken it away. Add waits for the server ("Saving 1 of 3…"), closes when every lot was saved and otherwise keeps the lots that were not, listed first, each with its reason. The picker has no way out while Add saves, so the save (`OrderManagement.tsx`) must not wait on a dead connection: a refusal is an answer and the next lot is sent, the first call without an answer (a timeout, no connection) ends the save with the lots not sent marked not saved, and the read of the order that follows any call is waited for only when every call was answered. The number on Add counts unsaved changes. |
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
5. A primary create action: the shared `ui/Fab` (`brand.fill` with a `plus` in `brand.onFill`, `shadow[3]`, 56 px, bottom right above the tab bar, label "Create GRN" and so on) for the roles that can create, hidden for others; the list adds `FAB_CLEARANCE` to its bottom padding. Customers create their own orders, so the Orders button shows for every role: warehouse roles get the customer search sheet, a customer account with one business goes straight to its order, and one with several picks the business in the bottom sheet `OrderBusinessSheet` (name and city; loading, failed with "Try again", and "No business linked"). Lists with an A–Z index rail (customers, items) put Create in the header instead, because a floating button would cover the rail.
6. Empty, filtered-empty, loading (skeleton), error and offline states.

Customers, Items and Users: the stack header carries the title only; `common/MasterListHeader` under it holds the search field, the count line and the refresh-failed strip.

### 14.2 Object page

For one order, GRN, dispatch, invoice, customer, item or sensor.

1. Hero header: document type, number, status tag, two to four key facts, header actions (edit, print, share, more).
2. Detail tabs: Overview first, then Items, related documents (GRNs, Dispatches, Invoices), Images, History.
3. Overview: key-value sections, contact card, notes, actions section.
4. Edits open the form flow. After saving, return to the object page with a success snackbar.
5. Tabs by page: GRN (Overview, Items, Dispatches, Images, Invoices), dispatch, invoice, and customer (Overview | Pricing, managers only: with one tab there is no bar; `CustomerTabNavigator`, icon `tag`; the Pricing tab is a list of the customer's own item rates whose rows open a rate box).

### 14.3 Wizard (multi-step form)

GRN, dispatch and invoice creation.

- A step indicator at the top; step names are nouns ("Customer", "Items", "Review").
- One topic per step. The last step is always Review, with an edit link per section.
- Every step has the same bottom bar on `surface.card` with `shadow[3]` and the bottom inset, laid out below the scrolling content (it never floats over it): the first step shows Next, middle steps Back and Next, the review step Back and the save action ("Create GRN", "Save dispatch"). Next validates only the current step. Swiping between steps is a shortcut, never the only way.
- An item in a step's entry form that was not checkmarked is never dropped without a word. GRN Items asks first ("Save this item?", or "Save changes to this item?" for a correction: Keep editing, Discard, Save) on every way out: Next, Back, both step circles, the phone's Back key and opening another saved item. An item that was opened and not changed is not asked about. "Discard changes" leaves a saved item as it is stored, its photos included.
- Dispatch Items asks nothing before it saves: Next and the Review circle save a valid item in the form, and stop on a correction that cannot be saved. A correction always has a way out: the strip above the form ("Editing item", with "Stop editing this item") shows whenever a saved item is in the form, in a new dispatch and in an edited one. Its ways back (Back, the Details circle, a swipe right, the Back key) ask "Go back to details?" when there are saved items or a valid item in the form.
- The GRN and Dispatch stacks, new and edit, switch the edge swipe off for all their steps (`gestureEnabled: false`): on iOS it would take the Items step away without its question.
- The Review step is the shared folding card (`review/ReviewSections.tsx`): one outlined card whose sections open one at a time, a closed section shows a one-line summary under its heading, and each section's Edit is the icon-only pencil (`pencil-outline`, `touchTarget` square) beside the chevron, its own target. Closed bodies stay mounted. A closed body may be drawn a moment after the screen appears (the invoice Review's Items), so the screen shows first; it then stays mounted. Key-value rows stack label over value from font scale 1.5. A long text (notes, an address) is a `ReviewKeyBlock`: label above, value below, left-aligned, at every size. The next dialog (the success dialog, an error alert) opens only after the busy confirm has finished closing: `ConfirmDialog.onDismissed` on iOS, once it is hidden on Android.
- Drafts are kept on the phone. Leaving with unsaved changes asks "Discard this GRN?".
- After saving, show a success dialog with the document number and actions (Print, Share, View, Create another).

### 14.4 Forms (single page)

Customer, item, pricing, user and profile forms.

- Fields in one column, grouped by section headers, in the order people fill them.
- Required fields marked with the asterisk; optional fields not marked.
- The save action is the primary button at the bottom, or Save in the header on iOS.
- Show all errors on save; scroll to the first.
- Leaving a form asks only when something changed, once, on every way out (header Back, the phone's Back key, swipe), with `useLeaveGuard`; it never asks when nothing changed. Create forms ask "Discard this <thing>?", edit forms the default "Discard changes?". After saving, go back and show a success snackbar with `showToast`.

### 14.5 Filter and sort

Every list with filters uses the parts in `src/features/filters` and one configuration in `src/features/filters/configs`. Do not build a filter sheet, chip row or sort control for one screen.

- **Header**: title row, search field, filter bar (`FilteredListHeader`). It is shown in every state of the list (loading, error, nothing found), so a search or filter can always be changed or cleared. While new results load over the rows on screen (a filter, sort or search was changed), `busy` draws a moving line over the filter bar's bottom edge; it takes no space, so nothing below moves.
- **Filter bar**: one row that scrolls sideways: "Filters" with the number applied, the sort chip, the filters that are on (each with its own remove target), the fast filters that are off, and "Clear all". It returns to its start when the filters change.
- **One tap, one sheet**: a chip opens a short sheet for that filter only. A choice or the sort applies on the tap. Anything typed or picked is a draft until the button, which names the result: "Show 34 items", or "No items match". Never open a sheet from a sheet.
- **A range that always has a value** (a report's period; `required` on the field): its chip comes after the sort chip, shows the range in effect and has no remove target. It is not counted in "Filters", and "Clear all" leaves it alone. Its quick ranges apply on the tap, like a choice (`applyPresetOnTap`); days chosen by hand are a draft until the button, which needs both days. Reports offer their own quick ranges (`REPORT_DATE_PRESETS`): the last 120, 240, 364 and 420 days, this month, last month and this financial year (April to March).
- **No count**: a list that has nothing to count its results with leaves `fetchCount` out, and the button reads "Show results".
- **Sort and filter page** (`app/list-filters.tsx`): every filter of the list on one page, for the filters that have no chip and for setting several at once. Nothing applies until its button. Customers and items are chosen inside the page.
- **Sort**: give each sort option its `kind` (`date`, `number` or `text`) so the direction reads "Newest first", "Highest number first" or "A to Z". Changing the field keeps the direction. A list sorted by anything but date shows no date headings.
- **Apply with a wrong value** (§10, §11.3): the button stays pressable. A press announces the message, applies nothing, brings the first wrong field into view (the page scrolls to its section) and moves screen-reader focus to its error text (`ApplyFiltersButton` `onBlockedPress`).
- **A choice offered only sometimes**: a choice option may carry `visibleTo(ctx)` (the GRN list's Low stock is offered only to a facility known to page by receipt, `FilterContext.pagesByReceipt`). A stored value that is not offered counts as no filter and is not sent.
- **A filter that is shown must work.** `toRequest` in the list's configuration is the only place a value becomes a request parameter, and `configs.test.ts` fails if a visible field does not change the request.
- **Session only**: filters, search and sort last until the app is closed, and are cleared on sign-out and a facility switch. "Clear all" clears the current list only and keeps its sort. A report keeps two of them longer: its period and its sort are remembered per facility and account and survive closing the app (one period for every report, a sort per report). Its search and other filters stay session-only, and "Clear all" leaves the period and the sort alone. The customer last opened in a report is remembered until sign-out or a facility switch.
- Lists assembled in the app for customer accounts (dispatches, invoices) apply the same filters with the same meaning as the backend; their tests share the backend's cases.

### 14.6 Search

- Search fields search as the user types, after 300 ms, with at least two characters.
- Recent searches show when the field is empty.
- Results highlight the match in bold.
- Server search shows a spinner in the field and a clear message when offline.
- List search (`ListSearchField`) matches every typed word, each in any of the list's columns, whatever its case. When the match is inside a collapsed card, the card shows a short line naming it.
- A date or a number range typed in a list search ("7 Oct", "A0010-A0020", "FY 2026") becomes a filter chip with a search icon. Removing that chip searches for the same words as plain text.
- When nothing matches, the empty state names the search text and offers "Clear search and filters".

### 14.7 Master–detail on tablets

On tablets in landscape, list reports show the list on the left (360 wide) and the object page on the right. The selected row uses `surface.selected`.

### 14.8 Sign-in and facility selection

The app has one central sign-in that only proves who the user is, then facility selection, and each facility separately authorises data access.

1. **Sign-in** (`src/components/auth/PhoneSignInForm.tsx`, used by `app/central-login.tsx` and `app/login.tsx`): brand mark, app name, the title "Sign in", the subtitle "Enter your mobile number to get a one-time code.", a "MOBILE NUMBER" section with a fixed +91 prefix and 5 + 5 grouping, and the full-width primary "Send code". The central sign-in adds the line "One sign-in for every member cold storage." and, on a first sign-in, a terms checkbox per [13.4](#134-selection-controls); "Send code" is disabled until it is ticked. A facility's own sign-in shows the facility row above (facility and host with a "Change" link) instead.
2. **Code entry** (`src/components/auth/CodeEntryForm.tsx`, used by `app/central-otp.tsx`, `app/otp.tsx` and `app/facility-link.tsx`): six boxes or one field with `textContentType="oneTimeCode"` and `autoComplete="sms-otp"`, auto-submit on the sixth digit, a resend link with a countdown, and "Wrong number?" back. The linking step gives it a heading that says why a code is asked for: "Confirm your number at <facility> once".
3. **Facility selection** (`app/facilities.tsx`, "My facilities", with central login; `app/operator-server.tsx`, the server address, without): the person's facilities as object cells (name, town, status tag), newest-opened first. Status: Approved (positive), Requested (critical), Revoked (negative), Confirm number and Unavailable (neutral). One primary "Add facility" at the bottom opens the association's catalogue (`app/facility-catalogue.tsx`: search by name, town or district; loading, empty, no-match and error states with "Try again"; pull to refresh, whose failure keeps the rows and adds one `status.negative.text` line under the search field), which also offers "Enter address". Each catalogue row is an object cell with the name, "Town, District" and one status tag under them (Online, Offline with "Last seen …", No app server yet; none when the catalogue reports nothing), ordered online, offline, no app server, each by name; a row already on the person's list adds a footnote "On your list" with a check. A member with no app server yet is greyed with `text.secondary` and `icon.secondary` (never opacity), ends in `information-outline` instead of the chevron, and a tap only explains in a dialog why it cannot be added. Opening a facility is how access is requested; there is no separate "Request access".
4. **Waiting for approval** (`app/pending-enrollment.tsx`, `app/enrollment-review.tsx`): what was requested, from which facility, and what happens next. No data from the facility is shown until it approves.
5. **Revoked or expired**: sign the user out of that facility, explain why in plain words, and return to facility selection. Never show a raw "401".
6. **Inside a facility** (central login): Settings and Profile show the same account actions from `src/features/account/useAccountActions.ts`, with the same wording and cleanup. Profile shows the sign-out actions; deleting the account is in Settings only, last in Account. Signed in to the association: "Leave this facility" (its subtitle names the facility and says the association sign-in stays; it asks first, then returns to My facilities) and "Sign out of this phone" (ends the association sign-in and the facility, as "Sign out" on My facilities does). Without the association sign-in (a facility opened with its own SMS sign-in): one "Sign out" through the same facility cleanup, whose dialog says a code is needed to sign in again. Without central login: one "Sign out" that opens the sign-in screen. The dialogs are `ConfirmDialog` with `busy`. "Delete my account at <facility>" deletes the account at that facility only; both steps name the facility and say that the association sign-in, the other facilities, the records and this phone's appearance, language and report preferences stay. The account copy never says "erased" or "permanently deleted" (the facility anonymises and deactivates the profile).

### 14.9 Offline

- The offline banner shows within two seconds of losing the connection.
- Lists show cached data with "Last updated 10:42 am". On Orders, Dispatch and Invoices the line sits under the first heading (at the top of the list when the list has no headings, as when sorted by number); on the order queue and the GRN list it is at the top of the list. It shows while the phone is offline (`lists/ListLoadErrors` `LastUpdatedLine`).
- A failed refresh of a list that still shows rows is a critical message strip that says when the rows were loaded and offers "Try again" (`StaleListStrip`); it stays until a refresh works. A failed next page is the list's last row with "Try again" (`LoadMoreErrorFooter`). A list with no rows shows `ErrorStateView`, and so does a failed new search or filter, whose rows on screen answer the old one. None of these is a snackbar (§13.9). Orders, the order queue, and the GRN, Dispatch and Invoice lists use these parts. A lasting fact about a list (a customer account's capped Dispatch history) is a footnote line above the list, not a snackbar; it is drawn outside the list so it also shows in the empty and filtered-empty states, where "no match" would otherwise read as covering the whole history.
- Actions that need the server are hidden or explain that they need a connection. Drafts save on the phone.

### 14.10 Reports

- The Reports tab lists, each under a `ui/SectionHeader`: Pinned (the reports this account pinned, in pin order), Recent (up to three opened last, most recent first, none that is pinned), then Stock, Movement, Financial and Operations from each report's `category` in the registry, in registry order. A report stays in its category when it is also pinned or recent; a section with nothing to show is left out. Every report, including a stored pinned or recent id, passes its role gate when the tab is drawn. Pins and recents are kept per facility and account (`useReportPrefs`); opening a report from the tab notes it as recent.
- Built with `ReportScaffold` (`src/components/reports`), which owns the layout and every state: first load, failed, failed with earlier rows still shown, nothing there, nothing matching. Top to bottom: header (title, whose data, at most one export action) → search → filter bar with sort, period and filters → figures → status line "dates · showing X of Y · last updated" → charts, if any → rows. The figures cover the whole period, not the rows a search leaves.
- Whose data comes from `useReportScope`. A warehouse role starts on every customer and opens one as a route parameter (the same route pushed with `?customerId=`), so the phone's back button and the header's agree. A customer account with several customers chooses one first (`ReportCustomerPicker`) and can change it from the header. Create order on the Orders tab asks the same question in a bottom sheet (`OrderBusinessSheet`, §14.1); both draw their rows with `common/CustomerChoiceRows`. While no search is typed, the customers list offers the customer opened last as one row above it. The name under a report's title is the facility's own (`customerNames.ts`: the tapped row, the picker's list, the account's assigned customers, or one lookup by id); a route's `customerName` is never shown, and the title has no name until the facility has answered.
- The period is the filter bar's period chip (§14.5). All eight reports use `ReportScaffold`.
- Date headings between rows only while the rows are sorted by date, drawn by `ReportDateHeading`. A customer account with no customer linked sees `ReportNoCustomer`: the report's title over one wording ("No customer linked", "No customer is linked to your account. Ask your facility to link one.") on every report.
- When a period report has nothing in its period, its empty state offers "Show last 420 days" (`longestPeriodAction`, which sets the period chip to that preset) until the longest period is chosen; then it offers nothing and no longer suggests a longer period.
- A failure the facility did not refuse shows the screen's own words ("Couldn't load GRN activity. Check your connection and try again."), never the service's "Failed to fetch …".
- Every number links to the list behind it where possible.
- The export action ("Share PDF", `useReportExport`, built by `exportHeaderActions`) is the header's one action, present on every report with a PDF (all but the operations dashboard, at both levels) and hidden when the facility's backend cannot make it.

### 14.11 Maintenance, forced update and errors

- Full-screen states per [13.9](#139-dialogs-sheets-and-messages).
- Forced update blocks the app with one "Update" action. Optional updates show a dismissible prompt once per version.

### 14.12 Settings

- Grouped list on `background.grouped`.
- The header button that opens Settings is the cog, spoken "Tools and settings".
- Sections, in order: profile card; Warehouse tools (the role's rows from `settingsFeatureRows`, `src/config/roles.ts`; none for a customer); Preferences; Account; Help and about (Help, which opens `/help`, then Terms of service and Privacy policy; in Gujarati the footer says the two pages are in English); Development (development builds only, with the style guide gallery); then `AppVersionFooter`. A Security section joins when the app gets a lock setting.
- Rows and sections are `SettingsSection` and `SettingsRow` (`src/features/settings/components/SettingsList.tsx`). A row may show its current value before the chevron and is read as "label, value, subtitle".
- Preferences are three rows with their current value: Appearance (System, Light, Dark), Language on this phone (Phone language, English, ગુજરાતી) and App colours (Orange, GCSA navy; the row and each choice lead with two swatches drawn from that brand's own tokens). Each opens a `PreferenceSheet` on `SheetFrame`: a radio group with a check on the chosen row; a tap applies the choice at once and keeps the sheet open; Done closes it. The sheet's note says what the choice does. A language change rebuilds the navigation tree, so the language sheet is noted in `preferenceSheetMemory.ts` and opens again on the rebuilt Settings.
- Account: "Change warehouse server" without central login, then the actions of `useAccountActions` (§14.8 item 6), then deletion last. "Change warehouse server" shows "Now using <facility>" as its subtitle and opens with Back and an "In use now" card.

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

`eslint.config.mjs` keeps every screen on the tokens. In `app/` and `src/` (except `src/theme/` and tests) these are lint errors:

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
3. Build from the shared parts before writing new ones: `ui/Button`, `ui/Input`, `ui/Card`, `ui/StatusTag`, `ui/Avatar`, `ui/Fab`, `ui/HeaderBackButton`, `ui/SectionHeader`, `fiori/KeyValueCell`, `list/ListEmptyState`, the filter parts in `features/filters` ([14.5](#145-filter-and-sort)), `WizardBottomBar`, `ConfirmDialog`, `showAlert`, the bottom sheets in `common/`, `table/DataTable` with `useAppTable`.
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
- [ ] Checked on both theme axes: Orange light, Orange dark, GCSA light and GCSA dark. Nothing checks the brand or the mode to pick a colour ([3.7](#37-the-brand-axis), [3.8](#38-the-mode-axis)).
- [ ] Checked at the largest font size and with a screen reader.
- [ ] Every pressable element is at least 44 or 48 and has a role and label.
- [ ] Status has a word or icon as well as colour.
- [ ] Tables are drawn by `DataTable` with `useAppTable`, fit a phone at the design edge without scrolling sideways (the two line tables, the invoice Items step's and, read-only, Invoice → Line items' opened lots, are the exceptions, §13.7), and keep their totals over every row ([13.7](#137-tables)).
- [ ] Loading, empty, error and offline states exist.
- [ ] Wording follows [Content and wording](#12-content-and-wording); no developer text; dates and numbers use the shared formatters; alerts use `showAlert`.
- [ ] Contrast test passes if tokens changed.
- [ ] `npm test`, `npm run typecheck`, `npm run typecheck:tests` and `npm run lint` pass.

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
