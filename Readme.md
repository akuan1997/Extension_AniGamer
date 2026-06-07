# Anime1 Sync

Chrome extension for adding lightweight tracking controls to Anime1 list pages.

## Features

- Adds a numeric counter beside each Anime1 title.
- Adds a hide/show toggle beside each Anime1 title.
- Stores Anime1 state in `chrome.storage.local`.
- Supports Supabase sign-in through OAuth or enterprise SSO.

## Supabase Auth Setup

The popup shows the extension redirect URL after loading. Add that URL to Supabase:

1. Open Supabase Dashboard.
2. Go to Authentication > URL Configuration.
3. Add the extension redirect URL to Redirect URLs.
4. Enable the OAuth provider or enterprise SSO provider you want to use.

## Installation

1. Open Chrome and go to `chrome://extensions/`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this project folder.
