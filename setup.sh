#!/bin/bash

# Automated first-run setup for rn-warehouse-template
# Usage: bash setup.sh

set -e

echo ""
echo "==================================="
echo "  rn-warehouse-template Setup"
echo "==================================="
echo ""

# Check Node.js version
NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 18 ]; then
  echo "ERROR: Node.js 18+ is required (found: $(node -v 2>/dev/null || echo 'not installed'))"
  echo "Install Node.js from: https://nodejs.org"
  exit 1
fi
echo "Node.js: $(node -v) (OK)"

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install

# Copy .env.example
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
else
  echo ".env already exists (skipping)"
fi

# Try to fetch Supabase keys from Docker
echo ""
echo "Attempting to fetch Supabase keys from Docker..."
if docker inspect supabase-kong &>/dev/null; then
  npm run update-supabase-keys && echo "Supabase keys updated!" || echo "WARNING: Could not update Supabase keys"
else
  echo "NOTE: Supabase Docker not running."
  echo "Start supabase-warehouse-template first, then run: npm run update-supabase-keys"
fi

echo ""
echo "==================================="
echo "  Setup Complete!"
echo "==================================="
echo ""
echo "Next steps:"
echo "  1. Start supabase-warehouse-template (if not running)"
echo "  2. npm start"
echo "  3. Scan QR code with Expo Go"
echo ""
echo "For physical devices, update EXPO_PUBLIC_CONFIG_API_URL in .env"
echo "with your LAN IP (e.g., http://192.168.1.x:8000)"
echo ""
