# rn-warehouse-template

An open-source React Native starter for warehouse management operations. Built with Expo, Supabase, and Redux Toolkit.

**Companion to**: [supabase-warehouse-template](https://github.com/abhiguru/supabase-warehouse-template) — the backend

---

## Quick Start (<10 minutes)

### Prerequisites

- Node.js 20.19+
- [supabase-warehouse-template](https://github.com/abhiguru/supabase-warehouse-template) running locally (Docker)
- iOS: Xcode 15+ / Android: Android Studio

### Steps

```bash
# 1. Clone and install
git clone https://github.com/abhiguru/rn-warehouse-template.git
cd rn-warehouse-template
npm install

# 2. Configure environment
cp .env.example .env

# 3. Fetch Supabase keys from local Docker
npm run update-supabase-keys

# 4. Start the dev server
npm start
```

Scan the QR code with Expo Go (iOS/Android) or press `i` for iOS simulator.

### Physical Device Setup

If using a physical device, update `EXPO_PUBLIC_CONFIG_API_URL` in `.env` to use your LAN IP:

```bash
EXPO_PUBLIC_CONFIG_API_URL=http://192.168.1.x:8000
```

Find your IP: `ipconfig getifaddr en0` (Mac) or `ip addr show` (Linux)

---

## Features

| Feature | Description |
|---|---|
| GRN Management | Goods Receipt Note creation, editing, image upload |
| Dispatch Tracking | Dispatch operations with customer assignment |
| Invoice Management | Invoice creation and history |
| Customer Orders | Order queue and management |
| Stock Management | Inventory levels and stock aging |
| Reports | Stock summary, dispatch activity, GRN activity |
| Sensor Monitoring | Temperature & humidity sensor data |
| Role-Based Access | Supervisor/Admin vs Customer views |

---

## Architecture

- **Routing**: [Expo Router](https://expo.github.io/router/) (file-based, like Next.js)
- **State**: [Redux Toolkit](https://redux-toolkit.js.org/) + redux-persist
- **Data Fetching**: [TanStack Query](https://tanstack.com/query)
- **UI**: [React Native Paper](https://reactnativepaper.com/) (Material Design 3) + SAP Fiori patterns
- **Backend**: [Supabase](https://supabase.com/) (PostgreSQL + Edge Functions + Auth)
- **Auth**: Custom phone OTP via Supabase RPC

```
src/
├── config/         # Supabase, Sentry, env config
├── store/          # Redux slices and hooks
├── services/       # API service layer
├── components/     # Reusable UI components
├── features/       # Feature modules (GRN form, etc.)
├── hooks/          # Custom React hooks
├── types/          # TypeScript types
├── theme/          # Material Design 3 theme
└── utils/          # Utilities

app/                # Expo Router pages
├── (tabs)/         # Main tab screens
├── (auth)/         # Login/OTP screens
├── grn-form/       # Multi-step GRN creation
├── grn-edit/       # Multi-step GRN editing
├── reports/        # Report screens
└── ...
```

---

## Configuration

All configuration is via environment variables in `.env`:

| Variable | Default | Description |
|---|---|---|
| `EXPO_PUBLIC_CONFIG_API_URL` | `http://localhost:8000` | Supabase API base URL |
| `EXPO_PUBLIC_APP_NAME` | `Warehouse Manager` | App display name |
| `EXPO_PUBLIC_COMPANY_NAME` | `Your Company Name` | Company name for legal pages |
| `EXPO_PUBLIC_APP_SCHEME` | `warehousemanager` | Deep link URL scheme |
| `EXPO_PUBLIC_ANDROID_PACKAGE` | `com.example.warehousemanager` | Android package ID |
| `EXPO_PUBLIC_SENTRY_DSN` | (empty = disabled) | Sentry/GlitchTip DSN |

---

## Customization Guide

### App Name & Brand

1. Update `.env`:
   ```bash
   EXPO_PUBLIC_APP_NAME=My Warehouse App
   EXPO_PUBLIC_COMPANY_NAME=Acme Corp
   ```

2. Update `app.json`:
   - `name`, `slug`, `scheme`
   - `ios.bundleIdentifier`, `android.package`

3. Replace `assets/` placeholder images with your brand assets:
   - `icon-1024.png` — App icon (1024x1024)
   - `splash-icon-1024.png` — Splash screen (1024x1024)
   - `logo.png` — Logo shown in tabs header

### Theme Colors

Edit `src/theme/index.ts` to change the color palette. The default uses:
- Primary: `#f69000` (orange)
- Background: `#11222c` (dark navy)

---

## Native Builds

The `ios/` and `android/` directories are excluded from this repo. Generate them:

```bash
# Generate native projects
npx expo prebuild

# Build for iOS (requires Mac + Xcode)
npm run ios

# Build for Android
npm run android
```

### EAS Build (cloud)

```bash
npm install -g eas-cli
eas login
eas build --platform all
```

Update `eas.json` with your Apple/Google credentials before submitting.

---

## Backend

This app requires [supabase-warehouse-template](https://github.com/abhiguru/supabase-warehouse-template) as the backend.

The backend provides:
- `get-public-config` edge function (bootstraps the app on startup)
- Phone OTP authentication RPC
- All warehouse management data (GRN, dispatch, stock, etc.)

---

## Development

```bash
npm run lint          # Check for linting errors
npm run lint:fix      # Fix linting errors
npm run format        # Format with Prettier
npm run typecheck     # TypeScript type check
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (enforced by commitlint).

### Test Credentials (local dev)

- Phone: any 10-digit number
- OTP: `123456`

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow.

---

## License

MIT — see [LICENSE](LICENSE)
