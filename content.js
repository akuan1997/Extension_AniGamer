let anime1CountMap = {};
let anime1CountByCatMap = {};
let anime1HiddenTitleMap = {};
let anime1HiddenCatMap = {};
let anime1Ready = false;
let anime1ApplyScheduled = false;
let anime1ListObserver = null;
let anime1RemoteSyncAt = 0;

function scheduleApplyAnime1Counts() {
  if (anime1ApplyScheduled) return;
  anime1ApplyScheduled = true;
  requestAnimationFrame(() => {
    anime1ApplyScheduled = false;
    applyAnime1Counts();
  });
}

function saveAnime1Count(key, value) {
  anime1CountMap = { ...anime1CountMap, [key]: value };
  chrome.storage.local.set({ anime1TitleCountByKey: anime1CountMap });
}

function saveAnime1CatCount(cat, value) {
  anime1CountByCatMap = { ...anime1CountByCatMap, [cat]: value };
  chrome.storage.local.set({ anime1CountByCat: anime1CountByCatMap });
}

function saveAnime1TitleHidden(key, hidden) {
  anime1HiddenTitleMap = { ...anime1HiddenTitleMap, [key]: hidden };
  chrome.storage.local.set({ anime1HiddenTitleByKey: anime1HiddenTitleMap });
}

function saveAnime1CatHidden(cat, hidden) {
  anime1HiddenCatMap = { ...anime1HiddenCatMap, [cat]: hidden };
  chrome.storage.local.set({ anime1HiddenCatByCat: anime1HiddenCatMap });
}

function loadAnime1StateAndApply() {
  chrome.storage.local.get(
    {
      anime1TitleCountByKey: {},
      anime1CountByCat: {},
      anime1HiddenTitleByKey: {},
      anime1HiddenCatByCat: {},
    },
    (result) => {
      anime1CountMap = result.anime1TitleCountByKey || {};
      anime1CountByCatMap = result.anime1CountByCat || {};
      anime1HiddenTitleMap = result.anime1HiddenTitleByKey || {};
      anime1HiddenCatMap = result.anime1HiddenCatByCat || {};
      scheduleApplyAnime1Counts();
    }
  );
}

function normalizeAnime1Url(href) {
  if (!href) return null;
  try {
    const url = new URL(href, window.location.protocol + "//" + window.location.host);
    url.hash = "";
    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function getAnime1CatFromHref(href) {
  if (!href) return null;
  try {
    const url = new URL(href, window.location.protocol + "//" + window.location.host);
    const cat = url.searchParams.get("cat");
    return cat && /^\d+$/.test(cat) ? cat : null;
  } catch {
    return null;
  }
}

function getAnime1RowInfo(row) {
  const titleCell = row.querySelector("td:first-child");
  if (!titleCell) return null;

  const link = titleCell.querySelector("a[href]");
  const href = link?.getAttribute("href") || link?.href || "";
  const normalizedUrl = normalizeAnime1Url(href);
  const cat = getAnime1CatFromHref(href);
  if (normalizedUrl) {
    return { key: `anime1:url:${normalizedUrl}`, cat, titleCell };
  }

  const titleText = (titleCell.textContent || "").replace(/\s+/g, " ").trim();
  if (!titleText) return null;
  return { key: `anime1:title:${titleText}`, cat, titleCell };
}

function applyAnime1TitleHidden(row, titleCell, hidden) {
  row.style.display = "";
  const titleLink = titleCell.querySelector("a");
  const target = titleLink || titleCell;
  target.style.textDecoration = hidden ? "line-through" : "";
  target.style.opacity = hidden ? "0.6" : "";
}

function stopControlPropagation(event) {
  event.stopPropagation();
}

function stopControlCommand(event) {
  event.preventDefault();
  event.stopPropagation();
}

function bindInteractiveControlEvents(element, preventDefault = false) {
  const handler = preventDefault ? stopControlCommand : stopControlPropagation;
  ["pointerdown", "mousedown", "mouseup", "click", "auxclick"].forEach((eventName) => {
    element.addEventListener(eventName, handler);
  });
}

async function syncAnime1Count(cat, count) {
  if (!cat) return;
  const result = await chrome.runtime
    .sendMessage({
      type: "anime1:countUpsert",
      cat,
      count,
    })
    .catch((error) => ({
      ok: false,
      error: error?.message || "sendMessage_failed",
    }));

  if (!result?.ok && result?.error !== "not_signed_in") {
    console.warn("anime1:countUpsert failed", result?.error || result);
  }
}

function parseCountInputValue(input) {
  const parsed = Number.parseInt(input.value, 10);
  const nextValue = Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
  input.value = String(nextValue);
  return nextValue;
}

function saveCountInputValue(input, key, cat) {
  const nextValue = parseCountInputValue(input);
  if (cat) {
    saveAnime1CatCount(cat, nextValue);
    syncAnime1Count(cat, nextValue);
    return;
  }
  saveAnime1Count(key, nextValue);
}

function createCountInput(key, cat) {
  const input = document.createElement("input");
  input.className = "anime1-custom-count-input";
  input.type = "number";
  input.step = "1";
  input.min = "0";
  input.style.width = "40px";
  input.style.height = "22px";
  input.style.padding = "0 4px";
  input.style.fontSize = "12px";
  input.style.lineHeight = "22px";
  input.style.border = "1px solid #cbd5e1";
  input.style.borderRadius = "4px";
  input.style.boxSizing = "border-box";
  input.style.pointerEvents = "auto";
  input.style.position = "relative";
  input.style.zIndex = "2";

  bindInteractiveControlEvents(input);

  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      saveCountInputValue(input, key, cat);
      input.blur();
    }
  });

  return input;
}

function createCountSaveButton(input, key, cat) {
  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "anime1-save-count-btn";
  saveButton.textContent = "Save";
  saveButton.style.height = "22px";
  saveButton.style.padding = "0 6px";
  saveButton.style.fontSize = "12px";
  saveButton.style.lineHeight = "20px";
  saveButton.style.border = "1px solid #cbd5e1";
  saveButton.style.borderRadius = "4px";
  saveButton.style.background = "#ffffff";
  saveButton.style.cursor = "pointer";
  saveButton.style.pointerEvents = "auto";
  saveButton.style.position = "relative";
  saveButton.style.zIndex = "2";

  bindInteractiveControlEvents(saveButton, true);

  saveButton.addEventListener("click", () => {
    saveCountInputValue(input, key, cat);
  });

  return saveButton;
}

async function syncAnime1Visibility(cat, hidden) {
  if (!cat) return;
  const result = await chrome.runtime
    .sendMessage({
      type: "anime1:visibilityUpsert",
      cat,
      show: hidden ? "hide" : "show",
    })
    .catch((error) => ({
      ok: false,
      error: error?.message || "sendMessage_failed",
    }));

  if (!result?.ok && result?.error !== "not_signed_in") {
    console.warn("anime1:visibilityUpsert failed", result?.error || result);
  }
}

function requestAnime1VisibilityPull() {
  const now = Date.now();
  if (now - anime1RemoteSyncAt < 10000) return;
  anime1RemoteSyncAt = now;

  chrome.runtime
    .sendMessage({ type: "anime1:visibilityPull" })
    .then((result) => {
      if (result?.ok) {
        loadAnime1StateAndApply();
      } else if (result?.error !== "not_signed_in") {
        console.warn("anime1:visibilityPull failed", result?.error || result);
      }
    })
    .catch((error) => {
      console.warn("anime1:visibilityPull failed", error);
    });
}

function createHideButton(key, cat, row, titleCell) {
  const hideButton = document.createElement("button");
  hideButton.type = "button";
  hideButton.className = "anime1-hide-title-btn";
  hideButton.style.height = "22px";
  hideButton.style.padding = "0 6px";
  hideButton.style.fontSize = "12px";
  hideButton.style.lineHeight = "20px";
  hideButton.style.border = "1px solid #cbd5e1";
  hideButton.style.borderRadius = "4px";
  hideButton.style.background = "#ffffff";
  hideButton.style.cursor = "pointer";
  hideButton.style.pointerEvents = "auto";
  hideButton.style.position = "relative";
  hideButton.style.zIndex = "2";

  bindInteractiveControlEvents(hideButton, true);

  hideButton.addEventListener("click", () => {
    const currentHidden = cat ? !!anime1HiddenCatMap[cat] : !!anime1HiddenTitleMap[key];
    const nextHidden = !currentHidden;
    if (cat) {
      saveAnime1CatHidden(cat, nextHidden);
      syncAnime1Visibility(cat, nextHidden);
    } else {
      saveAnime1TitleHidden(key, nextHidden);
    }
    applyAnime1TitleHidden(row, titleCell, nextHidden);
    hideButton.textContent = nextHidden ? "顯示" : "隱藏";
  });

  return hideButton;
}

function ensureAnime1Controls(row, titleCell, key, cat) {
  let wrap = titleCell.querySelector(".anime1-custom-count-wrap");
  let input = titleCell.querySelector(".anime1-custom-count-input");

  if (wrap && wrap.dataset.anime1Key !== key) {
    wrap.remove();
    wrap = null;
    input = null;
  }

  if (!wrap || !input) {
    wrap = document.createElement("span");
    wrap.className = "anime1-custom-count-wrap";
    wrap.dataset.anime1Key = key;
    wrap.style.display = "inline-flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "4px";
    wrap.style.marginLeft = "8px";
    wrap.style.position = "relative";
    wrap.style.zIndex = "2";
    wrap.style.pointerEvents = "auto";

    bindInteractiveControlEvents(wrap);

    const label = document.createElement("span");
    label.textContent = "#";
    label.style.opacity = "0.75";
    label.style.fontSize = "12px";

    input = createCountInput(key, cat);
    const saveButton = createCountSaveButton(input, key, cat);
    const hideButton = createHideButton(key, cat, row, titleCell);

    wrap.appendChild(label);
    wrap.appendChild(input);
    wrap.appendChild(saveButton);
    wrap.appendChild(hideButton);
    titleCell.appendChild(wrap);
  }

  return { wrap, input };
}

function applyAnime1Counts() {
  const rows = document.querySelectorAll("#table-list tbody tr");
  rows.forEach((row) => {
    const rowInfo = getAnime1RowInfo(row);
    if (!rowInfo) return;
    const { key, cat, titleCell } = rowInfo;

    const { wrap, input } = ensureAnime1Controls(row, titleCell, key, cat);
    const savedValue = cat ? anime1CountByCatMap[cat] : anime1CountMap[key];
    if (document.activeElement !== input) {
      input.value = String(typeof savedValue === "number" ? savedValue : 0);
    }

    const hidden = cat ? !!anime1HiddenCatMap[cat] : !!anime1HiddenTitleMap[key];
    applyAnime1TitleHidden(row, titleCell, hidden);

    const hideButton = wrap.querySelector(".anime1-hide-title-btn");
    if (hideButton) {
      hideButton.textContent = hidden ? "顯示" : "隱藏";
    }
  });
}

function initAnime1PageScript() {
  loadAnime1StateAndApply();
  requestAnime1VisibilityPull();
  if (anime1Ready) return;
  anime1Ready = true;

  if (anime1ListObserver) {
    anime1ListObserver.disconnect();
  }

  anime1ListObserver = new MutationObserver((mutations) => {
    const hasAddedNode = mutations.some((mutation) => mutation.addedNodes.length > 0);
    if (hasAddedNode) {
      scheduleApplyAnime1Counts();
    }
  });

  anime1ListObserver.observe(document.body, { childList: true, subtree: true });
  setTimeout(scheduleApplyAnime1Counts, 300);
  setTimeout(scheduleApplyAnime1Counts, 1000);
  setTimeout(scheduleApplyAnime1Counts, 2500);
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.anime1TitleCountByKey) {
    anime1CountMap = changes.anime1TitleCountByKey.newValue || {};
    scheduleApplyAnime1Counts();
  }
  if (changes.anime1CountByCat) {
    anime1CountByCatMap = changes.anime1CountByCat.newValue || {};
    scheduleApplyAnime1Counts();
  }
  if (changes.anime1HiddenTitleByKey) {
    anime1HiddenTitleMap = changes.anime1HiddenTitleByKey.newValue || {};
    scheduleApplyAnime1Counts();
  }
  if (changes.anime1HiddenCatByCat) {
    anime1HiddenCatMap = changes.anime1HiddenCatByCat.newValue || {};
    scheduleApplyAnime1Counts();
  }
  if (changes.supabaseSession) {
    requestAnime1VisibilityPull();
  }
});

if (window.location.hostname === "anime1.me") {
  initAnime1PageScript();
}
