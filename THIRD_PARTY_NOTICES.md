# Third-Party Notices

This source repository declares open-source dependencies that are installed by
`npm ci` and remain subject to their respective licenses. GitHub source archives
do not contain `node_modules` or font binaries. See
`docs/ATTRIBUTION_REVIEW.md` for the tracked-material inventory and review scope.

## 1. Icon Fonts (`@expo/vector-icons`)

The application bundles font files for rendering UI icons:

- **Font Awesome 4/5/6 Free**: Fonticons, Inc.; SIL Open Font License 1.1
  for fonts, with the icon wrapper code under MIT.
- **Ionicons**: Ionic; MIT License.
- **Material Icons**: Google; Apache License 2.0.
- **MaterialCommunityIcons**: MaterialDesignIcons.com; Apache License 2.0.
- **Feather**: Cole Bemis and contributors; MIT License.
- **Octicons**: GitHub, Inc.; MIT License.
- **Entypo**: Daniel Bruce; Creative Commons Attribution-ShareAlike 4.0.
- **AntDesign**: Ant Group; MIT License.
- **EvilIcons**: Alexander Madyankin and Roman Shamin; MIT License.
- **Fontisto**: Kenan Gündoğan; MIT License.
- **Foundation**: ZURB, Inc.; MIT License.
- **SimpleLineIcons**: Sabbir and contributors; MIT License.
- **Zocial**: Sam Collins; MIT License.

The installed package supplies its MIT code license at
`node_modules/@expo/vector-icons/LICENSE` and the vendored wrapper license at
`node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/LICENSE`.
Compiled-app distributors must preserve the notices for the exact font sets they
bundle.

## 2. Core Frameworks & Runtime

- **React Native**: MIT License (Copyright Meta Platforms, Inc.)
- **Expo SDK**: MIT License (Copyright 650 Industries, Inc.)
- **Supabase JS Client**: MIT License (Copyright Supabase, Inc.)
- **FlashList**: MIT License (Copyright Shopify Inc.)
- **Gorhom Bottom Sheet**: MIT License (Copyright Mo Gorhom)
- **Sentry React Native**: MIT License (Copyright Sentry)

The repository's MIT license applies to the original warehouse-template code and
maintainer-confirmed artwork and does not alter third-party terms. Primary
runtime package licenses were checked from their installed package files on
2026-09-18; the lockfile is the authoritative dependency inventory.
