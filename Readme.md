# Anime1 Sync

Chrome extension for adding lightweight tracking controls to Anime1 list pages.

## Features

- Adds a numeric counter beside each Anime1 title.
- Adds a hide/show toggle beside each Anime1 title.
- Stores Anime1 counters in `chrome.storage.local`.
- Syncs Anime1 hide/show state and saved counts to Supabase by `cat`.
- Supports Supabase sign-in through GitHub OAuth.

## Supabase Auth Setup

Add the Chrome extension redirect URL to Supabase:

1. Open Supabase Dashboard.
2. Go to Authentication > URL Configuration.
3. Add the extension redirect URL to Redirect URLs.
4. Enable the GitHub OAuth provider.

## Supabase Table Setup

Run [supabase.sql](supabase.sql) in the Supabase SQL Editor before syncing hide/show state.

The extension writes rows to `anime1_visibility` like:

```text
cat | show | count
1886 | hide | 3
```

## Installation

1. Open Chrome and go to `chrome://extensions/`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this project folder.
