# Brand packs

A build's name-and-colours come from an optional brand pack: a folder with a `brand.json`,
named by `WAREHOUSE_BRAND_PACK` at build time. With no pack the app is "Cold Storage" in the
Orange colours. `sample-teal/` is a fictional sample that tests and the style guide use.
The format and the contrast rule are in `docs/STYLE_GUIDE.md`, "Adding your own brand".

A build that sets `EXPO_PUBLIC_LEGAL_TEXT=association` must also have a pack whose `brand.json`
names the association (`association.name`); otherwise `app.config.js` stops the build.
