# Protein Tracker

A single-page daily protein tracker: 130 g target split across four eating windows (breakfast, midday, dinner, evening), with quick-add foods, a 14-day history chart, streaks, and a weekly waist check.

## Run

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Notes

- Outside Claude, data is saved to the browser's `localStorage` (this device only).
- AI estimates from text/photos and cross-device sync use the Claude artifact runtime (`window.claude`) and only work when the page is hosted as a Claude artifact. Quick add, history and waist tracking work anywhere.
- Photo timestamps are read from EXIF via [exifr](https://github.com/MikeKovarik/exifr).
