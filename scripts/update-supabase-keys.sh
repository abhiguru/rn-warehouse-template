#!/bin/bash

# Script to update Supabase API keys from Docker container
# Run this when you get invalid auth errors due to key changes
# Usage: npm run update-supabase-keys or bash scripts/update-supabase-keys.sh

set -e

echo "Fetching Supabase keys from Docker Kong container..."

# Get ANON_KEY and SERVICE_KEY from Kong container environment
ANON_KEY=$(docker inspect supabase-kong 2>/dev/null | grep -o '"SUPABASE_ANON_KEY=[^"]*' | cut -d= -f2 | head -1)
SERVICE_KEY=$(docker inspect supabase-kong 2>/dev/null | grep -o '"SUPABASE_SERVICE_KEY=[^"]*' | cut -d= -f2 | head -1)

if [ -z "$ANON_KEY" ] || [ -z "$SERVICE_KEY" ]; then
  echo "ERROR: Failed to fetch Supabase keys from Docker"
  echo "Make sure the Supabase Docker containers are running"
  echo "See: https://github.com/your-org/supabase-warehouse-template"
  exit 1
fi

echo "Successfully retrieved keys from Docker"

# Update .env file
ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
  echo "No .env file found. Creating from .env.example..."
  if [ -f ".env.example" ]; then
    cp .env.example "$ENV_FILE"
    echo "Created .env from .env.example"
  else
    echo "ERROR: No .env.example found either"
    exit 1
  fi
fi

# Update EXPO_PUBLIC_SUPABASE_ANON_KEY if present, otherwise append
if grep -q "EXPO_PUBLIC_SUPABASE_ANON_KEY" "$ENV_FILE"; then
  sed -i "s|^EXPO_PUBLIC_SUPABASE_ANON_KEY=.*|EXPO_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY|" "$ENV_FILE"
else
  echo "EXPO_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY" >> "$ENV_FILE"
fi

echo "Updated EXPO_PUBLIC_SUPABASE_ANON_KEY in .env"
echo ""
echo "Supabase keys updated successfully!"
echo "Restart your dev server: npm start"
