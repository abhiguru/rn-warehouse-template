# Ownership and third-party attribution review

## Development-artifact follow-up — 2026-09-22

A fresh Android debug APK and Android JavaScript export were inspected. The APK
contained Expo Updates' public `assets/expo-root.pem` certificate and no private
key, environment/database file, service-role text, or workstation path. Its
development bundle is served by Metro, so it contained no font entries. The
separate export contained the expected `@expo/vector-icons` font set already
reconciled below and in `THIRD_PARTY_NOTICES.md`. This closes the local
development-artifact inventory only; distributors must repeat the audit on the
final release AAB/APK and iOS archive.

Review date: **2026-09-18**. Release scope: **`v0.2.2-demo` source-only prerelease**.

## Maintainer attestation

The repository maintainer, `abhiguru`, confirms that they hold the rights needed
to redistribute the original mobile application source, documentation, and
tracked artwork in this repository under its MIT license. The attestation covers
the warehouse application code and the nine PNG files under `assets/` introduced
with the initial open-source commit. It does not claim ownership of third-party
packages, icon fonts, trademarks, or upstream projects.

This is the maintainer's scoped factual confirmation for release review. It is
not a blanket legal certification and does not replace third-party license terms.

## Tracked-material inventory

| Material | Provenance | License / permission | License or notice location |
| --- | --- | --- | --- |
| Application source, scripts, tests, and documentation | Original project work confirmed by the maintainer | MIT | `LICENSE` |
| `assets/*.png` (nine paths, four unique images) | Original project artwork confirmed by the maintainer; first tracked in the initial open-source commit | Included in the maintainer MIT grant | `LICENSE`; file hashes are recorded below |
| Package manifests and lockfile | Original dependency selection and npm-generated lock data | Repository MIT for original selection; packages keep their own terms | `package-lock.json` plus each installed package's license metadata/file |
| Post-install compatibility adapters under `scripts/` | Original project scripts; they patch installed public packages but do not copy package source into the repository | MIT | `LICENSE` |

Tracked artwork SHA-256 groups:

- `cc6c92338686f6aa11bfb6a4e5c8e21c8d2da0cd93e91f0e39b51d59ed41ccd1`:
  `adaptive-icon.png`, `icon-1024.png`, `icon.png`.
- `84ecaae5c19bc4e22ecb25adab5af68a2657763979b1a35e807c290517e5a5b1`:
  `icon-512.png`, `logo.png`.
- `ef7ada8ad5931bb1ba89db27d2b8682986c56d7994f9b60c285f3e85706cd233`:
  `feature-graphic.png`, `splash-icon-1024.png`, `splash-icon.png`.
- `24272cdaeff82cc5facdaccd982a6f05b60c4504704bbf94c19a6388659880bb`:
  `favicon.png`.

No font file, copied third-party image, or generated native directory is tracked
in this source tree.

## Third-party dependency review

`npm ci` installs the exact dependency graph in `package-lock.json`; dependencies
are not included in GitHub's source archive. The installed packages carry their
own license files. The review checked the actual installed files for the primary
runtime components, including React Native (MIT, Meta Platforms), Expo and
`@expo/vector-icons` (MIT, 650 Industries/Joel Arvidsson), Supabase JS (MIT,
Supabase), FlashList (MIT, Shopify), Gorhom Bottom Sheet (MIT, Mo Gorhom), and
Sentry React Native (MIT, Sentry).

`@expo/vector-icons`/`react-native-vector-icons` supplies icon glyph maps and font
files only after dependency installation. Its bundled-set inventory identifies
AntDesign, Entypo, EvilIcons, Feather, Font Awesome 4/5/6 Free, Fontisto,
Foundation, Ionicons, Material Icons, MaterialCommunityIcons, Octicons,
SimpleLineIcons, and Zocial. Their upstream attribution and varying MIT,
Apache-2.0, CC BY-SA 4.0, and SIL OFL terms are summarized in
`THIRD_PARTY_NOTICES.md`; package license files are installed at
`node_modules/@expo/vector-icons/LICENSE` and its vendored
`react-native-vector-icons/LICENSE`. A distributor that publishes a compiled app
must recheck the exact fonts actually bundled and carry forward the applicable
font notices. This release publishes source archives only.

## Review conclusion

No unresolved provenance item blocks this source-only prerelease. Future added
assets, vendored files, dependency replacements, or native binaries require a
new review; this record must not be reused as blanket approval.
