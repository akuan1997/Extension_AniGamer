const JABLE_KEYWORDS_STORAGE_KEY = "jableKeywordPreferencesV2";
const JABLE_VIDEOS_STORAGE_KEY = "jableVideoDismissalsV2";
const JABLE_PENDING_STORAGE_KEY = "jablePendingOperationsV2";
const JABLE_VIDEO_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const JABLE_CATEGORIES = {
  god: { label: "神", priority: 5, className: "jable-category-god" },
  like: { label: "讚", priority: 4, className: "jable-category-like" },
  observe: {
    label: "觀察",
    priority: 3,
    className: "jable-category-observe",
  },
  fake_boobs: {
    label: "假奶",
    priority: 2,
    className: "jable-category-fake-boobs",
  },
  hard_to_use: {
    label: "難用",
    priority: 1,
    className: "jable-category-hard-to-use",
  },
};
const JABLE_CATEGORY_ORDER = [
  "god",
  "like",
  "observe",
  "fake_boobs",
  "hard_to_use",
];

let jableKeywordPreferences = {};
let jableVideoDismissals = {};
let jableApplyScheduled = false;
let jableSelectionText = "";
let jableSelectionPopup = null;
let jableExpirationTimer = null;
let jableLastRemotePullAt = 0;

function normalizeJableText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getJableStorage(defaults) {
  return new Promise((resolve) => {
    chrome.storage.local.get(defaults, resolve);
  });
}

function setJableStorage(values) {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, resolve);
  });
}

function removeJableStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, resolve);
  });
}

async function clearLegacyJableState() {
  await removeJableStorage([
    "jableKeywordPreferences",
    "jableVideoDismissals",
    "jablePendingOperations",
    "jableLegacyMigrationV1",
  ]);
  try {
    ["likedTexts", "dislikedTexts", "dislikedVideos"].forEach((key) => {
      localStorage.removeItem(key);
    });
  } catch {
    // Site storage can be unavailable when cookies are blocked; V2 storage still works.
  }
}

function isActiveJableDismissal(dismissal, now = Date.now()) {
  return Number(dismissal?.expiresAt) > now;
}

async function removeExpiredJableDismissals() {
  const now = Date.now();
  const expiredVideoIds = Object.entries(jableVideoDismissals)
    .filter(([, dismissal]) => !isActiveJableDismissal(dismissal, now))
    .map(([videoId]) => videoId);
  const nextDismissals = Object.fromEntries(
    Object.entries(jableVideoDismissals).filter(([, dismissal]) =>
      isActiveJableDismissal(dismissal, now)
    )
  );

  if (
    Object.keys(nextDismissals).length !==
    Object.keys(jableVideoDismissals).length
  ) {
    jableVideoDismissals = nextDismissals;
    await setJableStorage({
      [JABLE_VIDEOS_STORAGE_KEY]: jableVideoDismissals,
    });
    for (const videoId of expiredVideoIds) {
      await sendJableMutation(`video:${videoId}`, {
        type: "jable:preferenceDelete",
        preferenceType: "video",
        preferenceKey: videoId,
      });
    }
  }

  scheduleJableExpirationCheck();
}

function scheduleJableExpirationCheck() {
  if (jableExpirationTimer) clearTimeout(jableExpirationTimer);

  const now = Date.now();
  const nextExpiry = Object.values(jableVideoDismissals)
    .map((dismissal) => Number(dismissal?.expiresAt))
    .filter((expiresAt) => Number.isFinite(expiresAt) && expiresAt > now)
    .sort((left, right) => left - right)[0];

  if (!nextExpiry) return;
  const delay = Math.min(nextExpiry - now + 1000, 2147483647);
  jableExpirationTimer = setTimeout(async () => {
    await removeExpiredJableDismissals();
    scheduleApplyJableFilters();
  }, delay);
}

async function loadJableState() {
  const result = await getJableStorage({
    [JABLE_KEYWORDS_STORAGE_KEY]: {},
    [JABLE_VIDEOS_STORAGE_KEY]: {},
  });
  jableKeywordPreferences = result[JABLE_KEYWORDS_STORAGE_KEY] || {};
  jableVideoDismissals = result[JABLE_VIDEOS_STORAGE_KEY] || {};
  await removeExpiredJableDismissals();
}

function injectJableStyles() {
  if (document.getElementById("jable-filter-styles")) return;

  const style = document.createElement("style");
  style.id = "jable-filter-styles";
  style.textContent = `
    #jable-selection-popup {
      position: fixed;
      display: none;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      max-width: min(520px, calc(100vw - 16px));
      padding: 8px;
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 9px;
      background: rgba(17, 24, 39, 0.97);
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
      color: #f9fafb;
      font: 13px/1.3 system-ui, sans-serif;
      z-index: 2147483647;
    }
    #jable-selection-popup .jable-selection-label {
      flex: 1 0 100%;
      overflow: hidden;
      color: #d1d5db;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #jable-selection-popup button {
      width: auto;
      margin: 0;
      padding: 5px 8px;
      border: 1px solid #6b7280;
      border-radius: 6px;
      background: #1f2937;
      color: #f9fafb;
      cursor: pointer;
      font: 600 12px/1.2 system-ui, sans-serif;
    }
    #jable-selection-popup button[data-category="god"] { border-color: #f59e0b; }
    #jable-selection-popup button[data-category="like"] { border-color: #ec4899; }
    #jable-selection-popup button[data-category="observe"] { border-color: #eab308; }
    #jable-selection-popup button[data-category="fake_boobs"] { border-color: #94a3b8; }
    #jable-selection-popup button[data-category="hard_to_use"] { border-color: #ef4444; }
    #jable-selection-popup button[aria-pressed="true"] {
      background: #f9fafb;
      color: #111827;
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.22);
    }
    .jable-category-god img {
      outline: 4px solid #f59e0b !important;
      outline-offset: -4px;
      filter: saturate(1.15) !important;
    }
    .jable-category-like img {
      outline: 4px solid #ec4899 !important;
      outline-offset: -4px;
    }
    .jable-category-observe img {
      outline: 3px solid #eab308 !important;
      outline-offset: -3px;
      opacity: 0.82 !important;
    }
    .jable-category-fake-boobs img,
    .jable-category-hard-to-use img,
    .jable-video-dismissed img {
      filter: grayscale(100%) !important;
      opacity: 0.1 !important;
    }
    .jable-filter-badge {
      position: absolute;
      top: 6px;
      left: 6px;
      z-index: 20;
      max-width: calc(100% - 48px);
      padding: 3px 7px;
      border-radius: 999px;
      background: rgba(17, 24, 39, 0.88);
      color: #fff;
      font: 700 11px/1.25 system-ui, sans-serif;
      pointer-events: none;
    }
    .jable-dismiss-button {
      position: absolute;
      top: 5px;
      right: 5px;
      z-index: 21;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      margin: 0;
      padding: 0;
      border: 1px solid rgba(255, 255, 255, 0.55);
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.68);
      color: #fff;
      cursor: pointer;
      font: 700 15px/1 system-ui, sans-serif;
    }
    .jable-dismiss-button[aria-pressed="true"] {
      background: #b91c1c;
      border-color: #fecaca;
    }
  `;
  document.head.appendChild(style);
}

function setupJableSelectionPopup() {
  if (document.getElementById("jable-selection-popup")) return;

  const popup = document.createElement("div");
  popup.id = "jable-selection-popup";
  popup.setAttribute("role", "toolbar");

  const label = document.createElement("div");
  label.className = "jable-selection-label";
  popup.appendChild(label);

  JABLE_CATEGORY_ORDER.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.category = category;
    button.textContent = JABLE_CATEGORIES[category].label;
    button.title = "再次點選相同分類可取消";
    button.addEventListener("pointerdown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      setJableKeywordPreference(jableSelectionText, category);
    });
    popup.appendChild(button);
  });

  document.body.appendChild(popup);
  jableSelectionPopup = popup;

  let selectionScheduled = false;
  const scheduleSelectionUpdate = () => {
    if (selectionScheduled) return;
    selectionScheduled = true;
    requestAnimationFrame(() => {
      selectionScheduled = false;
      updateJableSelectionPopup();
    });
  };

  document.addEventListener("selectionchange", scheduleSelectionUpdate);
  document.addEventListener("mouseup", scheduleSelectionUpdate);
  document.addEventListener("keyup", scheduleSelectionUpdate);
  document.addEventListener("pointerdown", (event) => {
    if (!popup.contains(event.target)) popup.style.display = "none";
  });
  window.addEventListener("scroll", () => {
    popup.style.display = "none";
  }, { passive: true });
}

function updateJableSelectionPopup() {
  if (!jableSelectionPopup) return;
  const selection = window.getSelection();
  const rawText = selection?.toString() || "";
  const text = rawText.replace(/\s+/g, " ").trim();
  const anchorElement =
    selection?.anchorNode instanceof Element
      ? selection.anchorNode
      : selection?.anchorNode?.parentElement;

  if (
    !text ||
    text.length > 100 ||
    !selection?.rangeCount ||
    jableSelectionPopup.contains(anchorElement) ||
    anchorElement?.closest("input, textarea, select, [contenteditable='true']")
  ) {
    jableSelectionPopup.style.display = "none";
    return;
  }

  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (!rect.width && !rect.height) return;

  jableSelectionText = text;
  const key = normalizeJableText(text);
  const currentCategory = jableKeywordPreferences[key]?.category || "";
  const label = jableSelectionPopup.querySelector(".jable-selection-label");
  label.textContent = `「${text}」`;
  jableSelectionPopup
    .querySelectorAll("button[data-category]")
    .forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.category === currentCategory)
    );
    });

  jableSelectionPopup.style.display = "flex";
  const popupRect = jableSelectionPopup.getBoundingClientRect();
  const left = Math.min(
    Math.max(8, rect.left),
    Math.max(8, window.innerWidth - popupRect.width - 8)
  );
  const preferredTop = rect.bottom + 8;
  const top =
    preferredTop + popupRect.height <= window.innerHeight - 8
      ? preferredTop
      : Math.max(8, rect.top - popupRect.height - 8);
  jableSelectionPopup.style.left = `${left}px`;
  jableSelectionPopup.style.top = `${top}px`;
}

async function setJableKeywordPreference(rawText, category) {
  const label = String(rawText || "").replace(/\s+/g, " ").trim();
  const key = normalizeJableText(label);
  if (!key || key.length > 100 || !JABLE_CATEGORIES[category]) return;

  const currentCategory = jableKeywordPreferences[key]?.category || "";
  const nextPreferences = { ...jableKeywordPreferences };
  if (currentCategory === category) {
    delete nextPreferences[key];
  } else {
    nextPreferences[key] = { label, category, updatedAt: Date.now() };
  }

  jableKeywordPreferences = nextPreferences;
  await setJableStorage({
    [JABLE_KEYWORDS_STORAGE_KEY]: jableKeywordPreferences,
  });
  scheduleApplyJableFilters();
  if (jableSelectionPopup) jableSelectionPopup.style.display = "none";
  window.getSelection()?.removeAllRanges();

  const message =
    currentCategory === category
      ? {
          type: "jable:preferenceDelete",
          preferenceType: "keyword",
          preferenceKey: key,
        }
      : {
          type: "jable:preferenceUpsert",
          preference: {
            preferenceType: "keyword",
            preferenceKey: key,
            label,
            category,
          },
        };
  await sendJableMutation(`keyword:${key}`, message);
}

function getJableVideoId(href) {
  if (!href) return null;
  try {
    const url = new URL(href, window.location.origin);
    const match = url.pathname.match(/^\/videos\/([^/]+)\/?/i);
    return match?.[1] ? normalizeJableText(decodeURIComponent(match[1])) : null;
  } catch {
    return null;
  }
}

function getJableVideoCards() {
  const cards = new Set(document.querySelectorAll(".video-img-box"));
  document.querySelectorAll('a[href*="/videos/"]').forEach((link) => {
    const card = link.closest(
      ".video-img-box, .col-6, .col-sm-4, .col-md-3, .col-lg-3, article"
    );
    if (card) cards.add(card);
  });
  return Array.from(cards);
}

function getJableCardInfo(card) {
  const links = Array.from(card.querySelectorAll('a[href*="/videos/"]'));
  const link =
    card.querySelector('.title a[href*="/videos/"]') ||
    links.find((candidate) => candidate.textContent.trim()) ||
    links[0];
  const videoId = getJableVideoId(link?.getAttribute("href") || link?.href);
  if (!videoId) return null;

  const titleElement = card.querySelector(".title") || link;
  const title = (titleElement?.textContent || link?.getAttribute("title") || "")
    .replace(/\s+/g, " ")
    .trim();
  return { videoId, title };
}

function getHighestJableKeywordMatch(title) {
  const normalizedTitle = normalizeJableText(title);
  if (!normalizedTitle) return null;

  let bestMatch = null;
  Object.entries(jableKeywordPreferences).forEach(([key, preference]) => {
    const category = preference?.category;
    const categoryInfo = JABLE_CATEGORIES[category];
    if (!categoryInfo || !key || !normalizedTitle.includes(key)) return;
    if (!bestMatch || categoryInfo.priority > bestMatch.priority) {
      bestMatch = {
        key,
        category,
        priority: categoryInfo.priority,
        label: preference.label || key,
      };
    }
  });
  return bestMatch;
}

function ensureJableCardControls(card, info) {
  if (getComputedStyle(card).position === "static") {
    card.style.position = "relative";
  }

  let button = card.querySelector(":scope > .jable-dismiss-button");
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "jable-dismiss-button";
    button.textContent = "✕";
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const currentInfo = getJableCardInfo(card) || info;
      await toggleJableVideoDismissal(currentInfo.videoId, currentInfo.title);
    });
    card.appendChild(button);
  }

  let badge = card.querySelector(":scope > .jable-filter-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "jable-filter-badge";
    badge.hidden = true;
    card.appendChild(badge);
  }
  return { button, badge };
}

function applyJableCardFilter(card) {
  const info = getJableCardInfo(card);
  if (!info) return;
  const { button, badge } = ensureJableCardControls(card, info);

  Object.values(JABLE_CATEGORIES).forEach(({ className }) => {
    card.classList.remove(className);
  });
  card.classList.remove("jable-video-dismissed");

  const dismissal = jableVideoDismissals[info.videoId];
  const manuallyDismissed = isActiveJableDismissal(dismissal);
  button.setAttribute("aria-pressed", String(manuallyDismissed));
  button.title = manuallyDismissed
    ? "取消暫時隱藏"
    : "暫時隱藏這部影片 7 天";

  if (manuallyDismissed) {
    card.classList.add("jable-video-dismissed");
    const match = getHighestJableKeywordMatch(info.title);
    badge.textContent = match ? `已看過 · ${match.label}` : "已看過";
    badge.hidden = false;
    return;
  }

  const match = getHighestJableKeywordMatch(info.title);
  if (!match) {
    badge.hidden = true;
    badge.textContent = "";
    return;
  }

  card.classList.add(JABLE_CATEGORIES[match.category].className);
  badge.textContent = `${JABLE_CATEGORIES[match.category].label} · ${match.label}`;
  badge.hidden = false;
}

function applyJableFilters() {
  getJableVideoCards().forEach(applyJableCardFilter);
}

function scheduleApplyJableFilters() {
  if (jableApplyScheduled) return;
  jableApplyScheduled = true;
  requestAnimationFrame(() => {
    jableApplyScheduled = false;
    applyJableFilters();
  });
}

async function toggleJableVideoDismissal(videoId, title) {
  if (!videoId) return;
  const currentlyDismissed = isActiveJableDismissal(
    jableVideoDismissals[videoId]
  );
  const nextDismissals = { ...jableVideoDismissals };
  let message;

  if (currentlyDismissed) {
    delete nextDismissals[videoId];
    message = {
      type: "jable:preferenceDelete",
      preferenceType: "video",
      preferenceKey: videoId,
    };
  } else {
    const expiresAt = Date.now() + JABLE_VIDEO_TTL_MS;
    nextDismissals[videoId] = {
      label: title || "",
      expiresAt,
      updatedAt: Date.now(),
    };
    message = {
      type: "jable:preferenceUpsert",
      preference: {
        preferenceType: "video",
        preferenceKey: videoId,
        label: title || "",
        category: "watched",
        expiresAt,
      },
    };
  }

  jableVideoDismissals = nextDismissals;
  await setJableStorage({
    [JABLE_VIDEOS_STORAGE_KEY]: jableVideoDismissals,
  });
  scheduleJableExpirationCheck();
  scheduleApplyJableFilters();

  await sendJableMutation(`video:${videoId}`, message);
}

async function updateJablePendingOperation(queueKey, message) {
  const result = await getJableStorage({ [JABLE_PENDING_STORAGE_KEY]: {} });
  const pending = { ...(result[JABLE_PENDING_STORAGE_KEY] || {}) };
  if (message) {
    pending[queueKey] = { message, queuedAt: Date.now() };
  } else {
    delete pending[queueKey];
  }
  await setJableStorage({ [JABLE_PENDING_STORAGE_KEY]: pending });
}

async function sendJableMutation(queueKey, message) {
  const result = await chrome.runtime
    .sendMessage(message)
    .catch((error) => ({ ok: false, error: error?.message }));
  if (result?.ok) {
    await updateJablePendingOperation(queueKey, null);
    return result;
  }

  await updateJablePendingOperation(queueKey, message);
  if (result?.error !== "not_signed_in") {
    console.warn("jable: preference sync queued", result?.error || result);
  }
  return result;
}

async function flushJablePendingOperations() {
  const result = await getJableStorage({ [JABLE_PENDING_STORAGE_KEY]: {} });
  const entries = Object.entries(result[JABLE_PENDING_STORAGE_KEY] || {}).sort(
    ([, left], [, right]) => Number(left?.queuedAt) - Number(right?.queuedAt)
  );

  for (const [queueKey, operation] of entries) {
    const syncResult = await chrome.runtime
      .sendMessage(operation.message)
      .catch((error) => ({ ok: false, error: error?.message }));
    if (!syncResult?.ok) return syncResult;
    await updateJablePendingOperation(queueKey, null);
  }
  return { ok: true };
}

async function pullJablePreferences(force = false) {
  const now = Date.now();
  if (!force && now - jableLastRemotePullAt < 60000) return;
  jableLastRemotePullAt = now;

  const flushResult = await flushJablePendingOperations();
  if (!flushResult?.ok && flushResult?.error !== "not_signed_in") {
    console.warn("jable: pending sync failed", flushResult?.error || flushResult);
  }
  if (!flushResult?.ok) return;

  const result = await chrome.runtime
    .sendMessage({ type: "jable:preferencesPull" })
    .catch((error) => ({ ok: false, error: error?.message }));
  if (!result?.ok && result?.error !== "not_signed_in") {
    console.warn("jable: preference pull failed", result?.error || result);
  }
}

function observeJablePage() {
  const observer = new MutationObserver((mutations) => {
    const hasAddedVideoCards = mutations.some((mutation) =>
      Array.from(mutation.addedNodes).some(
        (node) =>
          node instanceof Element &&
          (node.matches('.video-img-box, a[href*="/videos/"]') ||
            node.querySelector?.('.video-img-box, a[href*="/videos/"]'))
      )
    );
    if (hasAddedVideoCards) scheduleApplyJableFilters();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes[JABLE_KEYWORDS_STORAGE_KEY]) {
    jableKeywordPreferences =
      changes[JABLE_KEYWORDS_STORAGE_KEY].newValue || {};
    scheduleApplyJableFilters();
  }
  if (changes[JABLE_VIDEOS_STORAGE_KEY]) {
    jableVideoDismissals = changes[JABLE_VIDEOS_STORAGE_KEY].newValue || {};
    scheduleJableExpirationCheck();
    scheduleApplyJableFilters();
  }
  if (changes.supabaseSession?.newValue) {
    pullJablePreferences(true);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") pullJablePreferences();
});

async function initJableFilter() {
  injectJableStyles();
  setupJableSelectionPopup();
  await clearLegacyJableState();
  await loadJableState();
  applyJableFilters();
  observeJablePage();
  pullJablePreferences(true);
}

if (window.location.hostname === "jable.tv") {
  initJableFilter();
}
