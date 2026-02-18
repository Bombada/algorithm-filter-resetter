# Algorithm Reset Buddy

A Chrome extension (Manifest v3) that helps users break out of repetitive recommendation loops on feed-based platforms.

## MVP Features

- **Repetition detection engine**
  - Content script collects visible feed text (titles/tags/hashtags), tokenizes it, and calculates a bubble index.
  - If the index is higher than the configured sensitivity threshold, the feed is classified as repetitive.
- **Automatic response behavior**
  - When repetitive mode is detected, the extension performs a delayed auto-scroll.
  - If the viewport does not meaningfully change after scrolling, it attempts to move to the next item.
- **Bubble index visualization**
  - Extension badge shows the current bubble index percentage.
  - Popup displays a gauge, repetitive state message, and dominant terms.
  - In-page floating indicator shows when analysis is running and updates on scroll-triggered recalculation.
- **Interest expansion input**
  - Users can input comma-separated keywords.
  - "Explore now" opens a search on the active platform (YouTube/TikTok) or Google fallback.
- **Live keyword trend stats**
  - Stores detected dominant keywords in `chrome.storage.local` as you browse.
  - Popup can summarize trends for the last 1 hour, 24 hours, or up to 7 days.
- **Control panel settings**
  - Auto exploration toggle
  - Interest expansion toggle
  - Sensitivity slider (50% ~ 95%)

## Project Structure

- `manifest.json`: MV3 metadata, permissions, popup, background, content script.
- `background.js`: receives analysis, updates badge, triggers auto-explore, opens keyword search tabs.
- `content.js`: DOM text extraction, similarity-based repetition scoring, auto-scroll/next action.
- `popup.html` / `popup.css` / `popup.js`: UI for bubble index, settings, and keyword-driven exploration.

## Local Run

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this repository folder.
4. Open YouTube/TikTok (or another feed page) and click the extension icon.

## Notes

- MVP logic is heuristic and designed for quick validation.
- Platform-specific selectors can be expanded in `content.js` for better precision.
