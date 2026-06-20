let anime1CountMap = {};
let anime1CountByCatMap = {};
let anime1HiddenTitleMap = {};
let anime1HiddenCatMap = {};
let anime1FollowedCatMap = {};
let anime1Ready = false;
let anime1ApplyScheduled = false;
let anime1ListObserver = null;
let anime1RemoteSyncAt = 0;
let anime1InfiniteScrollObserver = null;
let anime1InfiniteScrollLoading = false;
let anime1InfiniteScrollReady = false;
let anime1InfiniteScrollPages = 1;
let anime1InfiniteScrollResetScheduled = false;
let anime1ReorderingRows = false;
let anime1DeferredHiddenRows = [];
let anime1InfiniteScrollIntersecting = false;
let anime1InfiniteScrollContinueScheduled = false;
let anime1FollowedOnly = false;
let anime1ListIndexPromise = null;
let anime1FollowedModeRows = null;
let anime1FollowedModeDeferredRows = null;

function getAnime1PaginationNextButton() {
  return document.querySelector(
    "#table-list_next, #table-list_wrapper .dataTables_paginate .next"
  );
}

function isAnime1PaginationEnd(nextButton) {
  return (
    !nextButton ||
    nextButton.classList.contains("disabled") ||
    nextButton.getAttribute("aria-disabled") === "true"
  );
}

function updateAnime1InfiniteScrollStatus(text, isError = false) {
  const status = document.getElementById("anime1-infinite-scroll-status");
  if (!status) return;
  status.textContent = text;
  status.style.color = isError ? "#dc2626" : "";
}

function getAnime1FollowedCount() {
  return Object.values(anime1FollowedCatMap).filter(Boolean).length;
}

function updateAnime1FollowedFilterButton() {
  const button = document.getElementById("anime1-followed-filter-btn");
  if (!button) return;

  const followedCount = getAnime1FollowedCount();
  button.textContent = anime1FollowedOnly
    ? `顯示全部（追蹤 ${followedCount}）`
    : `只看追蹤（${followedCount}）`;
  button.style.background = anime1FollowedOnly ? "#16a34a" : "#111827";
  button.style.borderColor = anime1FollowedOnly ? "#22c55e" : "#64748b";
  button.style.color = "#ffffff";
  button.setAttribute("aria-pressed", String(anime1FollowedOnly));
}

function getAnime1ListIndex() {
  if (!anime1ListIndexPromise) {
    anime1ListIndexPromise = fetch("https://anime1.me/animelist.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`animelist_request_failed:${response.status}`);
        }
        return response.json();
      })
      .then((items) => {
        const index = new Map();
        items.forEach((item) => {
          const cat = item?.[0];
          if (cat !== null && cat !== undefined && cat !== "") {
            index.set(String(cat), item);
          }
        });
        return { index, items };
      })
      .catch((error) => {
        anime1ListIndexPromise = null;
        throw error;
      });
  }

  return anime1ListIndexPromise;
}

function createAnime1RowFromListItem(item, rowIndex = 0) {
  const [cat, title, episode, year, season, subtitleGroup] = item;
  const row = document.createElement("tr");
  row.className = rowIndex % 2 === 0 ? "even" : "odd";
  [title, episode, year, season, subtitleGroup].forEach((value, index) => {
    const cell = document.createElement("td");
    if (index === 0) {
      const link = document.createElement("a");
      link.href = `https://anime1.me/?cat=${encodeURIComponent(cat)}`;
      link.textContent = value || "";
      cell.appendChild(link);
    } else {
      cell.textContent = value || "";
    }
    row.appendChild(cell);
  });
  return row;
}

async function showAnime1FollowedRows() {
  const tbody = document.querySelector("#table-list tbody");
  if (!tbody) return;

  updateAnime1InfiniteScrollStatus("正在建立追蹤動畫索引...");

  try {
    const { index } = await getAnime1ListIndex();
    if (!anime1FollowedOnly) return;

    const followedItems = Object.entries(anime1FollowedCatMap)
      .filter(([, followed]) => followed)
      .map(([cat]) => index.get(cat))
      .filter(Boolean);

    const fragment = document.createDocumentFragment();
    const rows = followedItems.map((item, rowIndex) => {
      const row = createAnime1RowFromListItem(item, rowIndex);
      fragment.appendChild(row);
      return row;
    });

    anime1ReorderingRows = true;
    tbody.replaceChildren(fragment);
    applyAnime1Counts(rows);
    requestAnimationFrame(() => {
      anime1ReorderingRows = false;
    });

    updateAnime1InfiniteScrollStatus(
      `顯示 ${followedItems.length} 部追蹤動畫`
    );
  } catch (error) {
    console.warn("anime1:followedIndex failed", error);
    updateAnime1InfiniteScrollStatus("追蹤動畫載入失敗，請再試一次", true);
  }
}

function restoreAnime1RowsAfterFollowedMode() {
  const tbody = document.querySelector("#table-list tbody");
  if (!tbody || !anime1FollowedModeRows) return;

  const fragment = document.createDocumentFragment();
  anime1FollowedModeRows.forEach((row) => fragment.appendChild(row));
  anime1ReorderingRows = true;
  tbody.replaceChildren(fragment);
  anime1DeferredHiddenRows = anime1FollowedModeDeferredRows || [];
  anime1FollowedModeRows = null;
  anime1FollowedModeDeferredRows = null;
  applyAnime1Counts();
  requestAnimationFrame(() => {
    anime1ReorderingRows = false;
  });
}

function initAnime1FollowedFilterButton(tableWrapper) {
  if (document.getElementById("anime1-followed-filter-btn")) return;

  const toolbar = document.createElement("div");
  toolbar.id = "anime1-extension-toolbar";
  toolbar.style.display = "flex";
  toolbar.style.justifyContent = "flex-end";
  toolbar.style.margin = "0 0 12px";

  const button = document.createElement("button");
  button.id = "anime1-followed-filter-btn";
  button.type = "button";
  button.style.padding = "7px 12px";
  button.style.border = "1px solid #64748b";
  button.style.borderRadius = "6px";
  button.style.cursor = "pointer";
  button.style.fontSize = "14px";
  button.style.fontWeight = "600";

  button.addEventListener("click", () => {
    const tbody = document.querySelector("#table-list tbody");
    anime1FollowedOnly = !anime1FollowedOnly;
    updateAnime1FollowedFilterButton();

    if (anime1FollowedOnly) {
      anime1FollowedModeRows = tbody ? Array.from(tbody.children) : [];
      anime1FollowedModeDeferredRows = [...anime1DeferredHiddenRows];
      anime1DeferredHiddenRows = [];
      showAnime1FollowedRows();
    } else {
      restoreAnime1RowsAfterFollowedMode();
      updateAnime1InfiniteScrollStatus(
        isAnime1PaginationEnd(getAnime1PaginationNextButton())
          ? "已載入全部資料"
          : "繼續向下滾動以載入更多"
      );
    }
  });

  toolbar.appendChild(button);
  tableWrapper.insertAdjacentElement("beforebegin", toolbar);
  updateAnime1FollowedFilterButton();
}

function continueAnime1InfiniteScrollIfNeeded() {
  if (anime1InfiniteScrollContinueScheduled) return;
  anime1InfiniteScrollContinueScheduled = true;

  const schedule =
    window.requestIdleCallback?.bind(window) ||
    ((callback) => setTimeout(() => callback({ didTimeout: false }), 50));

  schedule(() => {
    anime1InfiniteScrollContinueScheduled = false;
    if (
      anime1InfiniteScrollIntersecting &&
      !anime1FollowedOnly &&
      !anime1InfiniteScrollLoading &&
      !isAnime1PaginationEnd(getAnime1PaginationNextButton())
    ) {
      loadNextAnime1Page();
    }
  }, { timeout: 250 });
}

function stabilizeAnime1TableDuringLoad() {
  const tableWrapper = document.getElementById("table-list_wrapper");
  if (!tableWrapper) return () => {};

  tableWrapper.style.minHeight = `${tableWrapper.getBoundingClientRect().height}px`;
  return () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        tableWrapper.style.minHeight = "";
      });
    });
  };
}

function scheduleAnime1InfiniteScrollReset() {
  if (
    !anime1InfiniteScrollReady ||
    anime1InfiniteScrollLoading ||
    anime1InfiniteScrollResetScheduled
  ) {
    return;
  }

  anime1InfiniteScrollResetScheduled = true;
  requestAnimationFrame(() => {
    anime1InfiniteScrollResetScheduled = false;
    if (anime1InfiniteScrollLoading) return;

    anime1InfiniteScrollPages = 1;
    const nextButton = getAnime1PaginationNextButton();
    const sentinel = document.getElementById("anime1-infinite-scroll-sentinel");

    if (isAnime1PaginationEnd(nextButton)) {
      updateAnime1InfiniteScrollStatus("已載入全部資料");
      anime1InfiniteScrollObserver?.disconnect();
      return;
    }

    updateAnime1InfiniteScrollStatus("繼續向下滾動以載入更多");
    if (sentinel) {
      anime1InfiniteScrollObserver?.observe(sentinel);
    }
  });
}

function waitForAnime1NextPage(previousFirstRow, previousNextButtonClass) {
  return new Promise((resolve) => {
    let attempts = 0;

    function checkPageChanged() {
      const tbody = document.querySelector("#table-list tbody");
      const nextButton = getAnime1PaginationNextButton();
      const firstRowChanged = tbody?.firstElementChild !== previousFirstRow;
      const nextButtonChanged = nextButton?.className !== previousNextButtonClass;

      if (firstRowChanged || nextButtonChanged || attempts >= 30) {
        resolve(firstRowChanged);
        return;
      }

      attempts += 1;
      requestAnimationFrame(checkPageChanged);
    }

    requestAnimationFrame(checkPageChanged);
  });
}

async function loadNextAnime1Page() {
  if (anime1InfiniteScrollLoading) return;

  const tbody = document.querySelector("#table-list tbody");
  const nextButton = getAnime1PaginationNextButton();
  if (!tbody || isAnime1PaginationEnd(nextButton)) {
    updateAnime1InfiniteScrollStatus("已載入全部資料");
    anime1InfiniteScrollObserver?.disconnect();
    return;
  }

  anime1InfiniteScrollLoading = true;
  updateAnime1InfiniteScrollStatus("載入下一頁中...");

  const existingRows = Array.from(tbody.children);
  const previousFirstRow = tbody.firstElementChild;
  const previousNextButtonClass = nextButton.className;
  const releaseStableTableHeight = stabilizeAnime1TableDuringLoad();

  nextButton.click();
  const pageChanged = await waitForAnime1NextPage(
    previousFirstRow,
    previousNextButtonClass
  );

  if (!pageChanged) {
    releaseStableTableHeight();
    anime1InfiniteScrollLoading = false;
    updateAnime1InfiniteScrollStatus("下一頁載入失敗，請再試一次", true);
    return;
  }

  const nextPageRows = Array.from(tbody.children);
  const loadedRows = new Set(tbody.children);
  const previousRows = document.createDocumentFragment();
  existingRows.forEach((row) => {
    if (!loadedRows.has(row)) {
      previousRows.appendChild(row);
    }
  });
  tbody.insertBefore(previousRows, tbody.firstChild);

  anime1InfiniteScrollPages += 1;

  const currentNextButton = getAnime1PaginationNextButton();
  if (isAnime1PaginationEnd(currentNextButton)) {
    updateAnime1InfiniteScrollStatus("已載入全部資料");
    anime1InfiniteScrollObserver?.disconnect();
  } else {
    updateAnime1InfiniteScrollStatus(
      `已載入 ${anime1InfiniteScrollPages} 頁，繼續向下滾動以載入更多`
    );
  }

  requestAnimationFrame(() => {
    applyAnime1Counts(nextPageRows);
    releaseStableTableHeight();
    anime1InfiniteScrollLoading = false;
    continueAnime1InfiniteScrollIfNeeded();
  });
}

function initAnime1InfiniteScroll() {
  if (anime1InfiniteScrollReady) return;

  const table = document.getElementById("table-list");
  const tableWrapper = document.getElementById("table-list_wrapper");
  const nextButton = getAnime1PaginationNextButton();
  const tbody = table?.querySelector("tbody");
  if (!table || !tableWrapper || !nextButton || !tbody?.children.length) return;

  anime1InfiniteScrollReady = true;
  initAnime1FollowedFilterButton(tableWrapper);

  const pagination = tableWrapper.querySelector(".dataTables_paginate");
  if (pagination) {
    pagination.style.display = "none";
  }
  const paginationInfo = tableWrapper.querySelector(".dataTables_info");
  if (paginationInfo) {
    paginationInfo.style.display = "none";
  }

  const sentinel = document.createElement("div");
  sentinel.id = "anime1-infinite-scroll-sentinel";
  sentinel.style.minHeight = "1px";
  sentinel.style.padding = "16px 0";
  sentinel.style.textAlign = "center";

  const status = document.createElement("span");
  status.id = "anime1-infinite-scroll-status";
  status.style.fontSize = "13px";
  status.style.opacity = "0.75";
  status.textContent = isAnime1PaginationEnd(nextButton)
    ? "已載入全部資料"
    : "繼續向下滾動以載入更多";
  sentinel.appendChild(status);
  tableWrapper.insertAdjacentElement("afterend", sentinel);

  if (isAnime1PaginationEnd(nextButton)) return;

  anime1InfiniteScrollObserver = new IntersectionObserver(
    (entries) => {
      const sentinelEntry = entries.find(
        (entry) => entry.target.id === "anime1-infinite-scroll-sentinel"
      );
      if (!sentinelEntry) return;

      anime1InfiniteScrollIntersecting = sentinelEntry.isIntersecting;
      if (anime1InfiniteScrollIntersecting) {
        continueAnime1InfiniteScrollIfNeeded();
      }
    },
    { rootMargin: "0px 0px 1000px 0px" }
  );
  anime1InfiniteScrollObserver.observe(sentinel);
}

function scheduleApplyAnime1Counts() {
  if (anime1ApplyScheduled) return;
  anime1ApplyScheduled = true;
  requestAnimationFrame(() => {
    anime1ApplyScheduled = false;
    applyAnime1Counts();
    initAnime1InfiniteScroll();
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

function saveAnime1CatFollowed(cat, followed) {
  anime1FollowedCatMap = { ...anime1FollowedCatMap, [cat]: followed };
  chrome.storage.local.set({ anime1FollowedCatByCat: anime1FollowedCatMap });
}

function loadAnime1StateAndApply() {
  chrome.storage.local.get(
    {
      anime1TitleCountByKey: {},
      anime1CountByCat: {},
      anime1HiddenTitleByKey: {},
      anime1HiddenCatByCat: {},
      anime1FollowedCatByCat: {},
    },
    (result) => {
      anime1CountMap = result.anime1TitleCountByKey || {};
      anime1CountByCatMap = result.anime1CountByCat || {};
      anime1HiddenTitleMap = result.anime1HiddenTitleByKey || {};
      anime1HiddenCatMap = result.anime1HiddenCatByCat || {};
      anime1FollowedCatMap = result.anime1FollowedCatByCat || {};
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
  const title = (link?.textContent || titleCell.textContent || "").replace(/\s+/g, " ").trim();
  if (normalizedUrl) {
    return { key: `anime1:url:${normalizedUrl}`, cat, title, titleCell };
  }

  const titleText = title;
  if (!titleText) return null;
  return { key: `anime1:title:${titleText}`, cat, title: titleText, titleCell };
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
  if (!cat) return { ok: true, localOnly: true };
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
  return result;
}

function parseCountInputValue(input) {
  const parsed = Number.parseInt(input.value, 10);
  const nextValue = Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
  input.value = String(nextValue);
  return nextValue;
}

async function saveCountInputValue(input, key, cat) {
  const nextValue = parseCountInputValue(input);
  if (cat) {
    saveAnime1CatCount(cat, nextValue);
    return syncAnime1Count(cat, nextValue);
  }
  saveAnime1Count(key, nextValue);
  return { ok: true, localOnly: true };
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

  saveButton.addEventListener("click", async () => {
    const originalText = "Save";
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    const result = await saveCountInputValue(input, key, cat);

    if (result?.ok) {
      saveButton.textContent = "OK";
    } else {
      saveButton.textContent = "Error";
    }

    setTimeout(() => {
      saveButton.disabled = false;
      saveButton.textContent = originalText;
    }, 1200);
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

async function syncAnime1Followed(cat, followed) {
  if (!cat) return { ok: true, localOnly: true };
  const result = await chrome.runtime
    .sendMessage({
      type: "anime1:visibilityUpsert",
      cat,
      show: followed ? "follow" : "show",
    })
    .catch((error) => ({
      ok: false,
      error: error?.message || "sendMessage_failed",
    }));

  if (!result?.ok && result?.error !== "not_signed_in") {
    console.warn("anime1:followUpsert failed", result?.error || result);
  }
  return result;
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
      if (nextHidden) saveAnime1CatFollowed(cat, false);
      syncAnime1Visibility(cat, nextHidden);
    } else {
      saveAnime1TitleHidden(key, nextHidden);
    }
    applyAnime1TitleHidden(row, titleCell, nextHidden);
    hideButton.textContent = nextHidden ? "顯示" : "隱藏";
  });

  return hideButton;
}

function createFollowButton(cat) {
  const followButton = document.createElement("button");
  followButton.type = "button";
  followButton.className = "anime1-follow-title-btn";
  followButton.textContent = "追蹤";
  followButton.style.height = "22px";
  followButton.style.padding = "0 6px";
  followButton.style.fontSize = "12px";
  followButton.style.lineHeight = "20px";
  followButton.style.border = "1px solid #cbd5e1";
  followButton.style.borderRadius = "4px";
  followButton.style.background = "#ffffff";
  followButton.style.cursor = "pointer";
  followButton.style.pointerEvents = "auto";
  followButton.style.position = "relative";
  followButton.style.zIndex = "2";

  bindInteractiveControlEvents(followButton, true);

  followButton.addEventListener("click", async () => {
    if (!cat) return;
    const previousFollowed = !!anime1FollowedCatMap[cat];
    const previousHidden = !!anime1HiddenCatMap[cat];
    const nextFollowed = !anime1FollowedCatMap[cat];

    followButton.disabled = true;
    saveAnime1CatFollowed(cat, nextFollowed);
    if (nextFollowed) saveAnime1CatHidden(cat, false);
    updateFollowButtonStyle(followButton, nextFollowed);

    const result = await syncAnime1Followed(cat, nextFollowed);
    if (!result?.ok && result?.error !== "not_signed_in") {
      saveAnime1CatFollowed(cat, previousFollowed);
      saveAnime1CatHidden(cat, previousHidden);
      updateFollowButtonStyle(followButton, previousFollowed);
      followButton.textContent = "Error";
      setTimeout(() => {
        updateFollowButtonStyle(followButton, previousFollowed);
      }, 1200);
    }

    followButton.disabled = false;
  });

  return followButton;
}

function updateFollowButtonStyle(followButton, followed) {
  followButton.textContent = followed ? "已追蹤" : "追蹤";
  followButton.style.background = followed ? "#dcfce7" : "#ffffff";
  followButton.style.borderColor = followed ? "#22c55e" : "#cbd5e1";
  followButton.style.color = followed ? "#166534" : "";
}

function createAniGamerSearchButton(title) {
  const searchButton = document.createElement("button");
  searchButton.type = "button";
  searchButton.className = "anime1-anigamer-search-btn";
  searchButton.textContent = "動畫瘋";
  searchButton.title = title ? `Search AniGamer: ${title}` : "Search AniGamer";
  searchButton.style.height = "22px";
  searchButton.style.padding = "0 6px";
  searchButton.style.fontSize = "12px";
  searchButton.style.lineHeight = "20px";
  searchButton.style.border = "1px solid #cbd5e1";
  searchButton.style.borderRadius = "4px";
  searchButton.style.background = "#ffffff";
  searchButton.style.cursor = "pointer";
  searchButton.style.pointerEvents = "auto";
  searchButton.style.position = "relative";
  searchButton.style.zIndex = "2";

  bindInteractiveControlEvents(searchButton, true);

  searchButton.addEventListener("click", () => {
    if (!title) return;
    const url = `https://ani.gamer.com.tw/search.php?keyword=${encodeURIComponent(title)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  });

  return searchButton;
}

function ensureAnime1Controls(row, titleCell, key, cat, title) {
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
    const followButton = createFollowButton(cat);
    const aniGamerButton = createAniGamerSearchButton(title);

    wrap.appendChild(label);
    wrap.appendChild(input);
    wrap.appendChild(saveButton);
    wrap.appendChild(hideButton);
    wrap.appendChild(followButton);
    wrap.appendChild(aniGamerButton);
    titleCell.appendChild(wrap);
  }

  return { wrap, input };
}

function moveHiddenAnime1RowsToBottom() {
  const tbody = document.querySelector("#table-list tbody");
  if (!tbody) return;

  const rows = Array.from(
    new Set([...tbody.children, ...anime1DeferredHiddenRows])
  );
  const visibleRows = [];
  const hiddenRows = [];

  rows.forEach((row) => {
    const rowInfo = getAnime1RowInfo(row);
    if (!rowInfo) {
      visibleRows.push(row);
      return;
    }

    const hidden = rowInfo.cat
      ? !!anime1HiddenCatMap[rowInfo.cat]
      : !!anime1HiddenTitleMap[rowInfo.key];
    row.style.display =
      anime1FollowedOnly &&
      (!rowInfo.cat || !anime1FollowedCatMap[rowInfo.cat])
        ? "none"
        : "";
    (hidden ? hiddenRows : visibleRows).push(row);
  });

  const hasMorePages = !isAnime1PaginationEnd(getAnime1PaginationNextButton());
  const displayedRows = hasMorePages
    ? visibleRows
    : [...visibleRows, ...hiddenRows];
  anime1DeferredHiddenRows = hasMorePages ? hiddenRows : [];

  const currentRows = Array.from(tbody.children);
  const orderChanged =
    displayedRows.length !== currentRows.length ||
    displayedRows.some((row, index) => row !== currentRows[index]);
  if (!orderChanged) return;

  const fragment = document.createDocumentFragment();
  displayedRows.forEach((row) => fragment.appendChild(row));
  anime1ReorderingRows = true;
  tbody.replaceChildren(fragment);
  requestAnimationFrame(() => {
    anime1ReorderingRows = false;
  });
}

function applyAnime1Counts(
  rows = document.querySelectorAll("#table-list tbody tr")
) {
  rows.forEach((row) => {
    const rowInfo = getAnime1RowInfo(row);
    if (!rowInfo) return;
    const { key, cat, title, titleCell } = rowInfo;

    const { wrap, input } = ensureAnime1Controls(row, titleCell, key, cat, title);
    const savedValue = cat ? anime1CountByCatMap[cat] : anime1CountMap[key];
    if (document.activeElement !== input) {
      input.value = String(typeof savedValue === "number" ? savedValue : 0);
    }

    const hidden = cat ? !!anime1HiddenCatMap[cat] : !!anime1HiddenTitleMap[key];
    applyAnime1TitleHidden(row, titleCell, hidden);
    row.style.display =
      anime1FollowedOnly && (!cat || !anime1FollowedCatMap[cat]) ? "none" : "";

    const hideButton = wrap.querySelector(".anime1-hide-title-btn");
    if (hideButton) {
      hideButton.textContent = hidden ? "顯示" : "隱藏";
    }
    const followButton = wrap.querySelector(".anime1-follow-title-btn");
    if (followButton) {
      updateFollowButtonStyle(followButton, cat ? !!anime1FollowedCatMap[cat] : false);
    }
  });

  moveHiddenAnime1RowsToBottom();
  updateAnime1FollowedFilterButton();
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
    const hasRelevantAddedNode = mutations.some((mutation) =>
      Array.from(mutation.addedNodes).some(
        (node) =>
          node instanceof Element &&
          (node.matches("#table-list, #table-list_wrapper, #table-list tbody tr") ||
            node.querySelector?.("#table-list, #table-list_wrapper"))
      )
    );
    const tableWasRedrawn = mutations.some(
      (mutation) =>
        mutation.target instanceof HTMLTableSectionElement &&
        mutation.target.matches("#table-list tbody") &&
        (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)
    );

    if (
      tableWasRedrawn &&
      !anime1ReorderingRows &&
      !anime1InfiniteScrollLoading
    ) {
      anime1DeferredHiddenRows = [];
      scheduleAnime1InfiniteScrollReset();
    }
    if (hasRelevantAddedNode && !anime1InfiniteScrollLoading) {
      scheduleApplyAnime1Counts();
      initAnime1InfiniteScroll();
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
  if (changes.anime1FollowedCatByCat) {
    anime1FollowedCatMap = changes.anime1FollowedCatByCat.newValue || {};
    if (anime1FollowedOnly) {
      showAnime1FollowedRows();
    } else {
      scheduleApplyAnime1Counts();
    }
  }
  if (changes.supabaseSession) {
    requestAnime1VisibilityPull();
  }
});

if (window.location.hostname === "anime1.me") {
  initAnime1PageScript();
}
