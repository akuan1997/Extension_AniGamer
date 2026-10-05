# Anime1 & Jable Sync

Chrome extension for tracking Anime1 titles and filtering Jable videos with one
Supabase-backed account.

## Features

- Adds a numeric counter beside each Anime1 title.
- Adds hide/show and followed toggles beside each Anime1 title.
- Stores Anime1 counters in `chrome.storage.local`.
- Syncs Anime1 hide/show state and saved counts to Supabase by `cat`.
- Supports Supabase sign-in through GitHub OAuth.
- Runs on all `https://jable.tv/*` pages.
- Classifies selected Jable keywords as `神`, `讚`, `觀察`, `假奶`, or
  `難用`; the highest matching category wins.
- Marks an individual Jable video as `已看過` for seven days. This explicit
  video state takes priority over every keyword category.
- Syncs Jable keyword and temporary video preferences between devices.
- Starts with empty V2 Jable storage so preferences can be classified again
  from scratch.

## Supabase Auth Setup

Add the Chrome extension redirect URL to Supabase:

1. Open Supabase Dashboard.
2. Go to Authentication > URL Configuration.
3. Add the extension redirect URL to Redirect URLs.
4. Enable the GitHub OAuth provider.

This project pins the unpacked extension ID with the manifest `key`:

```text
gkglgehedhdfcmofneegigaadgneehha
```

Use this redirect URL in Supabase:

```text
https://gkglgehedhdfcmofneegigaadgneehha.chromiumapp.org/supabase-auth
```

## Supabase Table Setup

Run [supabase.sql](supabase.sql) in the Supabase SQL Editor before syncing
Anime1 or Jable state. The script grants the authenticated role permission to
delete expired Jable video rows. The extension removes those expired rows
whenever it synchronizes.

The extension writes rows to `anime1_visibility` like:

```text
cat | show | count
1886 | hide | 3
1887 | follow | 1
```

Jable keyword preferences are permanent until removed. Individual video
dismissals have an `expires_at` value seven days after they are created. They
stop applying locally at expiry and are deleted from Supabase during cleanup.
The SQL migration deletes rows from the old numeric-level format and the
removed `face` category; rerunning it later preserves supported category rows.

## Installation

1. Open Chrome and go to `chrome://extensions/`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this project folder.
