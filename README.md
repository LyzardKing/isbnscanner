# ISBN Book Scanner

A simple web app to look up books by ISBN and build a personal collection.

## Features

- Manual ISBN entry
- Barcode scanning (camera)
- Auto-fetch book metadata from Google Books + Open Library
- Local collection storage
- Export/Import collection (JSON)

## Tech Stack

- **HTML/CSS/JS** - Vanilla, no frameworks
- **html5-qrcode** - Barcode scanning (open source, CDN)
- **Google Books API** - Primary book data source (free, no auth)
- **Open Library API** - Backup source (open data)
- **Service Worker Cache** - Collection stored in cache (survives refresh)

## Why These Choices

- **No backend** - Runs entirely in browser, easy to host anywhere
- **localStorage** - Simple persistence without setup; export/import for sharing
- **Modular providers** - Easy to add more book APIs (see `providers` array in bookLookup.js)
- **No build step** - Just open index.html in a browser

## Usage

1. Open `index.html` in a browser
2. Enter ISBN manually or click "Scan Barcode" to use camera
3. Click "Add to Collection" to save
4. Use Export/Import to backup or share collection

Note: Camera requires HTTPS or localhost.

## Updating the App

To update the UI while keeping the collection intact, bump `CACHE_NAME` in `sw.js` (e.g., `isbn-scanner-v1` → `isbn-scanner-v2`). The collection stays in the old cache and persists across updates.