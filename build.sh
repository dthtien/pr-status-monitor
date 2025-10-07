#!/bin/bash

# Build script for PR Status Monitor GitHub Action

echo "🔨 Building PR Status Monitor Action..."

# Navigate to action directory
cd "$(dirname "$0")"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Run linting
echo "🔍 Running ESLint..."
npm run lint

# Run tests
echo "🧪 Running tests..."
npm run test

# Build the action
echo "🏗️ Building action..."
npm run build

echo "✅ Build completed successfully!"
echo ""
echo "📁 Files created:"
echo "  - dist/index.js (main action file)"
echo "  - dist/index.js.map (source map)"
echo ""
echo "🚀 The action is ready to use!"
