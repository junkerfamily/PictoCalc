#!/bin/sh
# Copy just the public files into dist/ for Cloudflare Pages
# (keeps server.js, package.json, .env etc. off the web).
set -e
cd "$(dirname "$0")"
rm -rf dist
mkdir dist
cp index.html admin.html config.json favicon.ico dist/
cp -R images dist/images
