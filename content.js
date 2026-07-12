let anime1CountMap = {};
let anime1CountByCatMap = {};
let anime1FinishedByKeyMap = {};
let anime1HiddenTitleMap = {};
let anime1HiddenCatMap = {};
let anime1FollowedCatMap = {};
let anime1FollowedItemByCatMap = {};
let anime1UpdatedAtByCatMap = {};
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
let anime1DeferredBottomRows = [];
let anime1InfiniteScrollIntersecting = false;
let anime1InfiniteScrollContinueScheduled = false;
let anime1InfiniteScrollPositionCheckScheduled = false;
let anime1InfiniteScrollResizeObserver = null;
let anime1FollowedOnly = false;
let anime1BacklogOnly = false;
let anime1CurrentOnly = false;
let anime1ListIndexPromise = null;
let anime1ListTotalCount = null;
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

function hideAnime1MetadataColumns() {
  document
    .querySelectorAll(
      "#table-list tr > :nth-child(5), #table-list tr > :nth-child(6), #table-list tr > :nth-child(7)"
    )
    .forEach((cell) => {
      cell.style.display = "none";
    });
}

function ensureAnime1TableLayoutStyles() {
  if (document.getElementById("anime1-table-layout-styles")) return;

  const style = document.createElement("style");
  style.id = "anime1-table-layout-styles";
  style.textContent = `
    #table-list {
      table-layout: fixed !important;
      width: 100% !important;
    }
    #table-list th,
    #table-list td {
      box-sizing: border-box;
    }
    #table-list tr > :nth-child(1) {
      width: 43% !important;
      padding-left: 12px !important;
      padding-right: 12px !important;
    }
    #table-list tr > :nth-child(2) {
      width: 11% !important;
      padding-left: 10px !important;
      padding-right: 10px !important;
    }
    #table-list tr > :nth-child(3) {
      width: 14% !important;
      padding-left: 10px !important;
      padding-right: 10px !important;
    }
    #table-list tr > :nth-child(4) {
      width: 32% !important;
      padding-left: 10px !important;
      padding-right: 10px !important;
    }
    #table-list .anime1-follow-cell,
    #table-list .anime1-progress-cell {
      white-space: nowrap;
    }
    #table-list .anime1-follow-cell {
      text-align: center;
    }
    #table-list tbody td {
      vertical-align: middle;
    }
    #table-list .anime1-title-actions-wrap {
      margin-top: 4px;
    }
  `;
  document.head.appendChild(style);
}

function ensureAnime1FollowColumn(row) {
  ensureAnime1TableLayoutStyles();
  const headerRow = document.querySelector("#table-list thead tr");
  if (headerRow && !headerRow.querySelector(".anime1-follow-header")) {
    const header = document.createElement("th");
    header.className = "anime1-follow-header";
    header.textContent = "追蹤";
    header.style.whiteSpace = "nowrap";
    headerRow.insertBefore(header, headerRow.children[1] || null);
  }

  let followCell = row.querySelector(":scope > .anime1-follow-cell");
  if (!followCell) {
    followCell = document.createElement("td");
    followCell.className = "anime1-follow-cell";
    followCell.style.whiteSpace = "nowrap";
    row.insertBefore(followCell, row.children[1] || null);
  }

  return followCell;
}

function ensureAnime1ProgressColumn(row) {
  ensureAnime1TableLayoutStyles();
  const headerRow = document.querySelector("#table-list thead tr");
  if (headerRow && !headerRow.querySelector(".anime1-progress-header")) {
    const header = document.createElement("th");
    header.className = "anime1-progress-header";
    header.textContent = "進度";
    header.style.whiteSpace = "nowrap";
    headerRow.insertBefore(header, headerRow.children[3] || null);
  }

  let progressCell = row.querySelector(":scope > .anime1-progress-cell");
  if (!progressCell) {
    progressCell = document.createElement("td");
    progressCell.className = "anime1-progress-cell";
    progressCell.style.whiteSpace = "nowrap";
    row.insertBefore(progressCell, row.children[3] || null);
  }

  return progressCell;
}

function getAnime1FollowedCount() {
  return Object.values(anime1FollowedCatMap).filter(Boolean).length;
}

function isAnime1FilteredMode() {
  return anime1FollowedOnly || anime1BacklogOnly || anime1CurrentOnly;
}

function isAnime1CurrentItem(item) {
  return String(item?.episode || "").includes("連載中");
}

function getAnime1StatusCounts() {
  const followedCats = new Set(
    Object.entries(anime1FollowedCatMap)
      .filter(([, followed]) => followed)
      .map(([cat]) => cat)
  );
  const hiddenCats = new Set(
    Object.entries(anime1HiddenCatMap)
      .filter(([, hidden]) => hidden)
      .map(([cat]) => cat)
  );
  const statusCats = new Set([...followedCats, ...hiddenCats]);

  return {
    followed: followedCats.size,
    hidden: hiddenCats.size,
    none:
      typeof anime1ListTotalCount === "number"
        ? Math.max(0, anime1ListTotalCount - statusCats.size)
        : null,
  };
}

function updateAnime1StatusSummary() {
  const summary = document.getElementById("anime1-status-summary");
  if (!summary) return;

  const counts = getAnime1StatusCounts();
  summary.textContent =
    counts.none === null
      ? `無狀態 … / 已追蹤 ${counts.followed} / 已忽略 ${counts.hidden}`
      : `無狀態 ${counts.none} / 已追蹤 ${counts.followed} / 已忽略 ${counts.hidden}`;
}

function updateAnime1FilterButtons() {
  const followedButton = document.getElementById(
    "anime1-followed-filter-btn"
  );
  const backlogButton = document.getElementById("anime1-backlog-filter-btn");
  const currentButton = document.getElementById("anime1-current-filter-btn");

  if (followedButton) {
    followedButton.textContent = "追蹤";
    followedButton.style.background = anime1FollowedOnly
      ? "#16a34a"
      : "#111827";
    followedButton.style.borderColor = anime1FollowedOnly
      ? "#22c55e"
      : "#64748b";
    followedButton.style.color = "#ffffff";
    followedButton.setAttribute("aria-pressed", String(anime1FollowedOnly));
  }

  if (backlogButton) {
    backlogButton.textContent = "補番";
    backlogButton.style.background = anime1BacklogOnly
      ? "#d97706"
      : "#111827";
    backlogButton.style.borderColor = anime1BacklogOnly
      ? "#f59e0b"
      : "#64748b";
    backlogButton.style.color = "#ffffff";
    backlogButton.setAttribute("aria-pressed", String(anime1BacklogOnly));
  }

  if (currentButton) {
    currentButton.textContent = "新番";
    currentButton.style.background = anime1CurrentOnly
      ? "#2563eb"
      : "#111827";
    currentButton.style.borderColor = anime1CurrentOnly
      ? "#3b82f6"
      : "#64748b";
    currentButton.style.color = "#ffffff";
    currentButton.setAttribute("aria-pressed", String(anime1CurrentOnly));
  }

  updateAnime1StatusSummary();
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
        anime1ListTotalCount = items.length;
        const index = new Map();
        const urlIndex = new Map();
        items.forEach((item, listIndex) => {
          const normalizedItem = normalizeAnime1ListItem(item, listIndex);
          if (!normalizedItem) return;

          if (normalizedItem.cat) {
            index.set(normalizedItem.cat, normalizedItem);
          }
          if (normalizedItem.href) {
            urlIndex.set(normalizedItem.href, normalizedItem);
          }
        });
        updateAnime1StatusSummary();
        return { index, urlIndex };
      })
      .catch((error) => {
        anime1ListIndexPromise = null;
        throw error;
      });
  }

  return anime1ListIndexPromise;
}

function normalizeAnime1ListItem(item, listIndex = 0) {
  if (!Array.isArray(item)) return null;

  const [rawCat, rawTitle, episode, year, season, subtitleGroup] = item;
  const container = document.createElement("div");
  container.innerHTML = String(rawTitle || "");
  const embeddedLink = container.querySelector("a[href]");
  const embeddedHref = embeddedLink?.getAttribute("href") || "";
  const embeddedCat = getAnime1CatFromHref(embeddedHref);
  const cat = rawCat ? String(rawCat) : embeddedCat;
  const href = normalizeAnime1Url(
    embeddedHref || (cat ? `https://anime1.me/?cat=${cat}` : "")
  );
  const title = (embeddedLink?.textContent || container.textContent || "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    cat,
    href,
    title,
    episode,
    year,
    season,
    subtitleGroup,
    listIndex,
  };
}

function createAnime1RowFromListItem(item, rowIndex = 0) {
  const { cat, href, title, episode, year, season, subtitleGroup } = item;
  const row = document.createElement("tr");
  row.className = rowIndex % 2 === 0 ? "even" : "odd";
  [title, episode, year, season, subtitleGroup].forEach((value, index) => {
    const cell = document.createElement("td");
    if (index === 0) {
      const link = document.createElement("a");
      link.href = href || `https://anime1.me/?cat=${encodeURIComponent(cat)}`;
      link.textContent = value || "";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      cell.appendChild(link);
    } else {
      cell.textContent = value || "";
    }
    row.appendChild(cell);
  });
  return row;
}

function getAnime1ListItemKey(item) {
  const normalizedUrl = normalizeAnime1Url(item?.href);
  if (normalizedUrl) return `anime1:url:${normalizedUrl}`;

  const title = String(item?.title || "").replace(/\s+/g, " ").trim();
  return title ? `anime1:title:${title}` : null;
}

function isAnime1FinishedItem(item) {
  const key = getAnime1ListItemKey(item);
  return key ? !!anime1FinishedByKeyMap[key] : false;
}

function refreshAnime1BacklogRowsAfterProgressChange() {
  if (anime1BacklogOnly) {
    showAnime1FollowedRows();
  }
}

function compareAnime1ListUpdateOrder(left, right) {
  return (left?.listIndex ?? Number.MAX_SAFE_INTEGER) -
    (right?.listIndex ?? Number.MAX_SAFE_INTEGER);
}

function getAnime1UpdatedAtValue(item) {
  const cat = item?.cat;
  if (!cat) return 0;
  const value = anime1UpdatedAtByCatMap[cat];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function compareAnime1EditedOrder(left, right) {
  const leftTime = getAnime1UpdatedAtValue(left);
  const rightTime = getAnime1UpdatedAtValue(right);
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  return compareAnime1ListUpdateOrder(left, right);
}

async function showAnime1FollowedRows() {
  const tbody = document.querySelector("#table-list tbody");
  if (!tbody) return;

  updateAnime1InfiniteScrollStatus("正在建立追蹤動畫索引...");

  try {
    const { index, urlIndex } = await getAnime1ListIndex();
    if (!isAnime1FilteredMode()) return;

    const filteredItems = Object.entries(anime1FollowedCatMap)
      .filter(([, followed]) => followed)
      .map(([cat]) => {
        const metadata = anime1FollowedItemByCatMap[cat];
        const metadataHref = normalizeAnime1Url(metadata?.href);
        return (
          (metadataHref ? urlIndex.get(metadataHref) : null) ||
          index.get(cat)
        );
      })
      .filter(Boolean)
      .filter(
        (item) =>
          (!anime1CurrentOnly ||
            (isAnime1CurrentItem(item) && !isAnime1FinishedItem(item))) &&
          (!anime1BacklogOnly ||
            (!isAnime1CurrentItem(item) && !isAnime1FinishedItem(item)))
      )
      .sort((left, right) => {
        if (anime1CurrentOnly) {
          return compareAnime1ListUpdateOrder(left, right);
        }

        if (anime1BacklogOnly) {
          return compareAnime1EditedOrder(left, right);
        }

        const leftFinished = isAnime1FinishedItem(left);
        const rightFinished = isAnime1FinishedItem(right);
        if (leftFinished !== rightFinished) {
          return leftFinished ? 1 : -1;
        }

        const leftYear = Number.parseInt(left?.year, 10) || 0;
        const rightYear = Number.parseInt(right?.year, 10) || 0;
        const yearDifference = rightYear - leftYear;
        if (yearDifference !== 0) return yearDifference;

        const seasonPriority = {
          秋: 4,
          夏: 3,
          春: 2,
          冬: 1,
        };
        const leftSeasonPriority = seasonPriority[left?.season] || 0;
        const rightSeasonPriority = seasonPriority[right?.season] || 0;
        return rightSeasonPriority - leftSeasonPriority;
      });

    const fragment = document.createDocumentFragment();
    const rows = filteredItems.map((item, rowIndex) => {
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
      anime1CurrentOnly
        ? `顯示 ${filteredItems.length} 部新番動畫`
        : anime1BacklogOnly
          ? `顯示 ${filteredItems.length} 部補番動畫`
          : `顯示 ${filteredItems.length} 部追蹤動畫`
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
  anime1DeferredBottomRows = anime1FollowedModeDeferredRows || [];
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
  toolbar.style.gap = "8px";
  toolbar.style.margin = "0 0 12px";

  function createFilterButton(id) {
    const button = document.createElement("button");
    button.id = id;
    button.type = "button";
    button.style.padding = "7px 12px";
    button.style.border = "1px solid #64748b";
    button.style.borderRadius = "6px";
    button.style.cursor = "pointer";
    button.style.fontSize = "14px";
    button.style.fontWeight = "600";
    return button;
  }

  function setAnime1FilterMode(mode) {
    const tbody = document.querySelector("#table-list tbody");
    const wasFiltered = isAnime1FilteredMode();
    const nextFollowedOnly = mode === "followed";
    const nextBacklogOnly = mode === "backlog";
    const nextCurrentOnly = mode === "current";
    const isSameMode =
      (nextFollowedOnly && anime1FollowedOnly) ||
      (nextBacklogOnly && anime1BacklogOnly) ||
      (nextCurrentOnly && anime1CurrentOnly);

    if (isSameMode) {
      anime1FollowedOnly = false;
      anime1BacklogOnly = false;
      anime1CurrentOnly = false;
      updateAnime1FilterButtons();
      restoreAnime1RowsAfterFollowedMode();
      updateAnime1InfiniteScrollStatus(
        isAnime1PaginationEnd(getAnime1PaginationNextButton())
          ? "已載入全部資料"
          : "繼續向下滾動以載入更多"
      );
      return;
    }

    if (!wasFiltered) {
      anime1FollowedModeRows = tbody ? Array.from(tbody.children) : [];
      anime1FollowedModeDeferredRows = [...anime1DeferredBottomRows];
      anime1DeferredBottomRows = [];
    }

    anime1FollowedOnly = nextFollowedOnly;
    anime1BacklogOnly = nextBacklogOnly;
    anime1CurrentOnly = nextCurrentOnly;
    updateAnime1FilterButtons();
    showAnime1FollowedRows();
  }

  const currentButton = createFilterButton("anime1-current-filter-btn");
  currentButton.addEventListener("click", () => {
    setAnime1FilterMode("current");
  });

  const followedButton = createFilterButton("anime1-followed-filter-btn");
  followedButton.addEventListener("click", () => {
    setAnime1FilterMode("followed");
  });

  const backlogButton = createFilterButton("anime1-backlog-filter-btn");
  backlogButton.addEventListener("click", () => {
    setAnime1FilterMode("backlog");
  });

  const statusSummary = document.createElement("span");
  statusSummary.id = "anime1-status-summary";
  statusSummary.style.display = "inline-flex";
  statusSummary.style.alignItems = "center";
  statusSummary.style.padding = "0 4px";
  statusSummary.style.fontSize = "13px";
  statusSummary.style.color = "#cbd5e1";
  statusSummary.style.whiteSpace = "nowrap";

  toolbar.appendChild(statusSummary);
  toolbar.appendChild(currentButton);
  toolbar.appendChild(backlogButton);
  toolbar.appendChild(followedButton);
  tableWrapper.insertAdjacentElement("beforebegin", toolbar);
  updateAnime1FilterButtons();
  getAnime1ListIndex().catch(() => {
    updateAnime1StatusSummary();
  });
}

function continueAnime1InfiniteScrollIfNeeded() {
  if (anime1InfiniteScrollContinueScheduled) return;
  anime1InfiniteScrollContinueScheduled = true;

  const schedule =
    window.requestIdleCallback?.bind(window) ||
    ((callback) => setTimeout(() => callback({ didTimeout: false }), 50));

  schedule(() => {
    anime1InfiniteScrollContinueScheduled = false;
    const sentinel = document.getElementById("anime1-infinite-scroll-sentinel");
    const sentinelRect = sentinel?.getBoundingClientRect();
    const sentinelIsNearViewport =
      !!sentinelRect &&
      sentinelRect.top <= window.innerHeight + 1000 &&
      sentinelRect.bottom >= -1000;

    if (
      (anime1InfiniteScrollIntersecting || sentinelIsNearViewport) &&
      !isAnime1FilteredMode() &&
      !anime1InfiniteScrollLoading &&
      !isAnime1PaginationEnd(getAnime1PaginationNextButton())
    ) {
      loadNextAnime1Page();
    }
  }, { timeout: 250 });
}

function scheduleAnime1InfiniteScrollPositionCheck() {
  if (anime1InfiniteScrollPositionCheckScheduled) return;
  anime1InfiniteScrollPositionCheckScheduled = true;

  requestAnimationFrame(() => {
    anime1InfiniteScrollPositionCheckScheduled = false;
    continueAnime1InfiniteScrollIfNeeded();
  });
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
    try {
      applyAnime1Counts(nextPageRows);
    } finally {
      releaseStableTableHeight();
      anime1InfiniteScrollLoading = false;
      scheduleAnime1InfiniteScrollPositionCheck();
    }
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

  window.addEventListener(
    "scroll",
    scheduleAnime1InfiniteScrollPositionCheck,
    { passive: true }
  );
  window.addEventListener(
    "resize",
    scheduleAnime1InfiniteScrollPositionCheck,
    { passive: true }
  );

  if ("ResizeObserver" in window) {
    anime1InfiniteScrollResizeObserver = new ResizeObserver(
      scheduleAnime1InfiniteScrollPositionCheck
    );
    anime1InfiniteScrollResizeObserver.observe(tableWrapper);
    anime1InfiniteScrollResizeObserver.observe(document.body);
  }

  scheduleAnime1InfiniteScrollPositionCheck();
}

function scheduleApplyAnime1Counts() {
  if (anime1ApplyScheduled) return;
  anime1ApplyScheduled = true;
  requestAnimationFrame(() => {
    anime1ApplyScheduled = false;
    applyAnime1Counts();
    hideAnime1MetadataColumns();
    initAnime1InfiniteScroll();
  });
}

function saveAnime1Count(key, value) {
  anime1CountMap = { ...anime1CountMap, [key]: value };
  chrome.storage.local.set({ anime1TitleCountByKey: anime1CountMap });
}

function saveAnime1UpdatedAt(cat) {
  if (!cat) return;
  anime1UpdatedAtByCatMap = { ...anime1UpdatedAtByCatMap, [cat]: Date.now() };
  chrome.storage.local.set({ anime1UpdatedAtByCat: anime1UpdatedAtByCatMap });
}

function saveAnime1CatCount(cat, value) {
  anime1CountByCatMap = { ...anime1CountByCatMap, [cat]: value };
  chrome.storage.local.set({ anime1CountByCat: anime1CountByCatMap });
  saveAnime1UpdatedAt(cat);
}

function saveAnime1Finished(key, finished) {
  anime1FinishedByKeyMap = {
    ...anime1FinishedByKeyMap,
    [key]: finished,
  };
  chrome.storage.local.set({
    anime1FinishedByKey: anime1FinishedByKeyMap,
  });
}

function saveAnime1TitleHidden(key, hidden) {
  anime1HiddenTitleMap = { ...anime1HiddenTitleMap, [key]: hidden };
  chrome.storage.local.set({ anime1HiddenTitleByKey: anime1HiddenTitleMap });
}

function saveAnime1CatHidden(cat, hidden) {
  anime1HiddenCatMap = { ...anime1HiddenCatMap, [cat]: hidden };
  chrome.storage.local.set({ anime1HiddenCatByCat: anime1HiddenCatMap });
  saveAnime1UpdatedAt(cat);
}

function saveAnime1CatFollowed(cat, followed) {
  anime1FollowedCatMap = { ...anime1FollowedCatMap, [cat]: followed };
  chrome.storage.local.set({ anime1FollowedCatByCat: anime1FollowedCatMap });
  saveAnime1UpdatedAt(cat);
}

function saveAnime1FollowedItem(cat, item) {
  if (!cat) return;

  const nextMap = { ...anime1FollowedItemByCatMap };
  if (item?.href) {
    nextMap[cat] = {
      href: normalizeAnime1Url(item.href),
      title: item.title || "",
    };
  } else {
    delete nextMap[cat];
  }

  anime1FollowedItemByCatMap = nextMap;
  chrome.storage.local.set({
    anime1FollowedItemByCat: anime1FollowedItemByCatMap,
  });
}

function loadAnime1StateAndApply() {
  chrome.storage.local.get(
    {
      anime1TitleCountByKey: {},
      anime1CountByCat: {},
      anime1FinishedByKey: {},
      anime1HiddenTitleByKey: {},
      anime1HiddenCatByCat: {},
      anime1FollowedCatByCat: {},
      anime1FollowedItemByCat: {},
      anime1UpdatedAtByCat: {},
    },
    (result) => {
      anime1CountMap = result.anime1TitleCountByKey || {};
      anime1CountByCatMap = result.anime1CountByCat || {};
      anime1FinishedByKeyMap = result.anime1FinishedByKey || {};
      anime1HiddenTitleMap = result.anime1HiddenTitleByKey || {};
      anime1HiddenCatMap = result.anime1HiddenCatByCat || {};
      anime1FollowedCatMap = result.anime1FollowedCatByCat || {};
      anime1FollowedItemByCatMap = result.anime1FollowedItemByCat || {};
      anime1UpdatedAtByCatMap = result.anime1UpdatedAtByCat || {};
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
  if (link) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  const href = link?.getAttribute("href") || link?.href || "";
  const normalizedUrl = normalizeAnime1Url(href);
  const cat = getAnime1CatFromHref(href);
  const title = (link?.textContent || titleCell.textContent || "").replace(/\s+/g, " ").trim();
  if (normalizedUrl) {
    return {
      key: `anime1:url:${normalizedUrl}`,
      cat,
      title,
      href: normalizedUrl,
      titleCell,
    };
  }

  const titleText = title;
  if (!titleText) return null;
  return {
    key: `anime1:title:${titleText}`,
    cat,
    title: titleText,
    href: null,
    titleCell,
  };
}

function applyAnime1TitleHidden(row, titleCell, hidden, followed = false) {
  row.style.display = "";
  const titleLink = titleCell.querySelector("a");
  const target = titleLink || titleCell;
  const showFollowedStyle = followed && !isAnime1FilteredMode();
  target.style.textDecoration =
    hidden || showFollowedStyle ? "line-through" : "";
  target.style.color = showFollowedStyle ? "#9ca3af" : "";
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

  input.addEventListener("keydown", async (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      await saveCountInputValue(input, key, cat);
      input.blur();
      refreshAnime1BacklogRowsAfterProgressChange();
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

    refreshAnime1BacklogRowsAfterProgressChange();

    setTimeout(() => {
      saveButton.disabled = false;
      saveButton.textContent = originalText;
    }, 1200);
  });

  return saveButton;
}

function updateFinishedButtonStyle(
  finishedButton,
  input,
  saveButton,
  finished
) {
  const progressWrap = finishedButton.closest(".anime1-custom-count-wrap");
  const label = progressWrap?.querySelector(".anime1-count-label");

  finishedButton.textContent = finished ? "FINISHED" : "Finish";
  finishedButton.setAttribute("aria-pressed", String(finished));
  finishedButton.title = finished ? "取消已看完" : "標記為已看完";
  finishedButton.style.background = finished ? "#16a34a" : "#ffffff";
  finishedButton.style.borderColor = finished ? "#22c55e" : "#cbd5e1";
  finishedButton.style.color = finished ? "#ffffff" : "";
  finishedButton.style.fontWeight = finished ? "700" : "";

  if (label) {
    label.style.display = finished ? "none" : "";
  }
  input.style.display = finished ? "none" : "";
  saveButton.style.display = finished ? "none" : "";
  input.disabled = finished;
  saveButton.disabled = finished;
}

function createFinishedButton(input, saveButton, key) {
  const finishedButton = document.createElement("button");
  finishedButton.type = "button";
  finishedButton.className = "anime1-finished-btn";
  finishedButton.style.height = "22px";
  finishedButton.style.padding = "0 6px";
  finishedButton.style.fontSize = "12px";
  finishedButton.style.lineHeight = "20px";
  finishedButton.style.border = "1px solid #cbd5e1";
  finishedButton.style.borderRadius = "4px";
  finishedButton.style.cursor = "pointer";
  finishedButton.style.pointerEvents = "auto";
  finishedButton.style.position = "relative";
  finishedButton.style.zIndex = "2";

  bindInteractiveControlEvents(finishedButton, true);

  finishedButton.addEventListener("click", () => {
    const nextFinished = !anime1FinishedByKeyMap[key];
    saveAnime1Finished(key, nextFinished);
    updateFinishedButtonStyle(
      finishedButton,
      input,
      saveButton,
      nextFinished
    );
    if (nextFinished && anime1CurrentOnly) {
      showAnime1FollowedRows();
    }
  });

  updateFinishedButtonStyle(
    finishedButton,
    input,
    saveButton,
    !!anime1FinishedByKeyMap[key]
  );
  return finishedButton;
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
      if (nextHidden) {
        saveAnime1CatFollowed(cat, false);
        saveAnime1FollowedItem(cat, null);
      }
      syncAnime1Visibility(cat, nextHidden);
    } else {
      saveAnime1TitleHidden(key, nextHidden);
    }
    applyAnime1TitleHidden(
      row,
      titleCell,
      nextHidden,
      cat ? !!anime1FollowedCatMap[cat] : false
    );
    hideButton.textContent = nextHidden ? "顯示" : "隱藏";
  });

  return hideButton;
}

function createFollowButton(cat, row, titleCell) {
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
    const currentRowInfo = getAnime1RowInfo(row);
    const previousFollowed = !!anime1FollowedCatMap[cat];
    const previousHidden = !!anime1HiddenCatMap[cat];
    const previousItem = anime1FollowedItemByCatMap[cat];
    const nextFollowed = !anime1FollowedCatMap[cat];

    followButton.disabled = true;
    saveAnime1CatFollowed(cat, nextFollowed);
    saveAnime1FollowedItem(
      cat,
      nextFollowed
        ? {
            href: currentRowInfo?.href,
            title: currentRowInfo?.title,
          }
        : null
    );
    if (nextFollowed) saveAnime1CatHidden(cat, false);
    updateFollowButtonStyle(followButton, nextFollowed);
    applyAnime1TitleHidden(row, titleCell, false, nextFollowed);

    const result = await syncAnime1Followed(cat, nextFollowed);
    if (!result?.ok && result?.error !== "not_signed_in") {
      saveAnime1CatFollowed(cat, previousFollowed);
      saveAnime1FollowedItem(cat, previousItem);
      saveAnime1CatHidden(cat, previousHidden);
      updateFollowButtonStyle(followButton, previousFollowed);
      applyAnime1TitleHidden(
        row,
        titleCell,
        previousHidden,
        previousFollowed
      );
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
  const followCell = ensureAnime1FollowColumn(row);
  const progressCell = ensureAnime1ProgressColumn(row);
  let followWrap = followCell.querySelector(".anime1-follow-control-wrap");
  let progressWrap = progressCell.querySelector(".anime1-custom-count-wrap");
  let input = progressCell.querySelector(".anime1-custom-count-input");
  let saveButton = progressCell.querySelector(".anime1-save-count-btn");
  let finishedButton = progressCell.querySelector(".anime1-finished-btn");
  let actionsWrap = titleCell.querySelector(".anime1-title-actions-wrap");

  const legacyWrap = titleCell.querySelector(".anime1-custom-count-wrap");
  if (legacyWrap) {
    legacyWrap.remove();
  }

  if (progressWrap && progressWrap.dataset.anime1Key !== key) {
    progressWrap.remove();
    progressWrap = null;
    input = null;
    saveButton = null;
    finishedButton = null;
  }

  if (followWrap && followWrap.dataset.anime1Key !== key) {
    followWrap.remove();
    followWrap = null;
  }

  if (actionsWrap && actionsWrap.dataset.anime1Key !== key) {
    actionsWrap.remove();
    actionsWrap = null;
  }

  if (!progressWrap || !input || !saveButton || !finishedButton) {
    progressWrap?.remove();
    progressWrap = document.createElement("span");
    progressWrap.className = "anime1-custom-count-wrap";
    progressWrap.dataset.anime1Key = key;
    progressWrap.style.display = "inline-flex";
    progressWrap.style.alignItems = "center";
    progressWrap.style.gap = "4px";
    progressWrap.style.position = "relative";
    progressWrap.style.zIndex = "2";
    progressWrap.style.pointerEvents = "auto";

    bindInteractiveControlEvents(progressWrap);

    const label = document.createElement("span");
    label.className = "anime1-count-label";
    label.textContent = "#";
    label.style.opacity = "0.75";
    label.style.fontSize = "12px";

    input = createCountInput(key, cat);
    saveButton = createCountSaveButton(input, key, cat);
    finishedButton = createFinishedButton(input, saveButton, key);

    progressWrap.appendChild(label);
    progressWrap.appendChild(input);
    progressWrap.appendChild(saveButton);
    progressWrap.appendChild(finishedButton);
    progressCell.appendChild(progressWrap);
  }

  if (!followWrap) {
    followWrap = document.createElement("span");
    followWrap.className = "anime1-follow-control-wrap";
    followWrap.dataset.anime1Key = key;
    followWrap.style.display = "inline-flex";
    followWrap.style.alignItems = "center";
    followWrap.style.justifyContent = "center";
    followWrap.style.pointerEvents = "auto";

    bindInteractiveControlEvents(followWrap);

    const followButton = createFollowButton(cat, row, titleCell);
    followWrap.appendChild(followButton);
    followCell.appendChild(followWrap);
  }

  if (!actionsWrap) {
    actionsWrap = document.createElement("span");
    actionsWrap.className = "anime1-title-actions-wrap";
    actionsWrap.dataset.anime1Key = key;
    actionsWrap.style.display = "inline-flex";
    actionsWrap.style.alignItems = "center";
    actionsWrap.style.gap = "4px";
    actionsWrap.style.marginLeft = "8px";
    actionsWrap.style.position = "relative";
    actionsWrap.style.zIndex = "2";
    actionsWrap.style.pointerEvents = "auto";

    bindInteractiveControlEvents(actionsWrap);

    const hideButton = createHideButton(key, cat, row, titleCell);
    const aniGamerButton = createAniGamerSearchButton(title);

    actionsWrap.appendChild(hideButton);
    actionsWrap.appendChild(aniGamerButton);
    titleCell.appendChild(actionsWrap);
  }

  return {
    followWrap,
    progressWrap,
    actionsWrap,
    input,
    saveButton,
    finishedButton,
  };
}

function moveCompletedAnime1RowsToBottom() {
  const tbody = document.querySelector("#table-list tbody");
  if (!tbody) return;

  const rows = Array.from(
    new Set([...tbody.children, ...anime1DeferredBottomRows])
  );
  const normalRows = [];
  const followedRows = [];
  const hiddenRows = [];

  rows.forEach((row) => {
    const rowInfo = getAnime1RowInfo(row);
    if (!rowInfo) {
      normalRows.push(row);
      return;
    }

    const hidden = rowInfo.cat
      ? !!anime1HiddenCatMap[rowInfo.cat]
      : !!anime1HiddenTitleMap[rowInfo.key];
    const followed = rowInfo.cat
      ? !!anime1FollowedCatMap[rowInfo.cat]
      : false;
    row.style.display =
      isAnime1FilteredMode() &&
      (!rowInfo.cat || !anime1FollowedCatMap[rowInfo.cat])
        ? "none"
        : "";

    if (hidden) {
      hiddenRows.push(row);
    } else if (followed) {
      followedRows.push(row);
    } else {
      normalRows.push(row);
    }
  });

  const hasMorePages = !isAnime1PaginationEnd(getAnime1PaginationNextButton());
  const bottomRows = [...followedRows, ...hiddenRows];
  const displayedRows =
    isAnime1FilteredMode() || !hasMorePages
      ? [...normalRows, ...bottomRows]
      : normalRows;
  anime1DeferredBottomRows =
    !isAnime1FilteredMode() && hasMorePages ? bottomRows : [];

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
    const { key, cat, title, href, titleCell } = rowInfo;

    const {
      followWrap,
      actionsWrap,
      input,
      saveButton,
      finishedButton,
    } = ensureAnime1Controls(
      row,
      titleCell,
      key,
      cat,
      title
    );
    const savedValue = cat ? anime1CountByCatMap[cat] : anime1CountMap[key];
    if (document.activeElement !== input) {
      input.value = String(typeof savedValue === "number" ? savedValue : 0);
    }
    updateFinishedButtonStyle(
      finishedButton,
      input,
      saveButton,
      !!anime1FinishedByKeyMap[key]
    );

    const hidden = cat ? !!anime1HiddenCatMap[cat] : !!anime1HiddenTitleMap[key];
    const followed = cat ? !!anime1FollowedCatMap[cat] : false;
    if (followed && href && !anime1FollowedItemByCatMap[cat]) {
      saveAnime1FollowedItem(cat, { href, title });
    }
    applyAnime1TitleHidden(row, titleCell, hidden, followed);
    row.style.display =
      isAnime1FilteredMode() && (!cat || !anime1FollowedCatMap[cat])
        ? "none"
        : "";

    const hideButton = actionsWrap.querySelector(".anime1-hide-title-btn");
    if (hideButton) {
      hideButton.textContent = hidden ? "顯示" : "隱藏";
    }
    const followButton = followWrap.querySelector(".anime1-follow-title-btn");
    if (followButton) {
      updateFollowButtonStyle(followButton, followed);
    }
  });

  moveCompletedAnime1RowsToBottom();
  updateAnime1FilterButtons();
  hideAnime1MetadataColumns();
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
      anime1DeferredBottomRows = [];
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
    if (anime1BacklogOnly) {
      showAnime1FollowedRows();
    } else {
      scheduleApplyAnime1Counts();
    }
  }
  if (changes.anime1CountByCat) {
    anime1CountByCatMap = changes.anime1CountByCat.newValue || {};
    if (anime1BacklogOnly) {
      showAnime1FollowedRows();
    } else {
      scheduleApplyAnime1Counts();
    }
  }
  if (changes.anime1FinishedByKey) {
    anime1FinishedByKeyMap = changes.anime1FinishedByKey.newValue || {};
    if (isAnime1FilteredMode()) {
      showAnime1FollowedRows();
    } else {
      scheduleApplyAnime1Counts();
    }
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
    if (isAnime1FilteredMode()) {
      showAnime1FollowedRows();
    } else {
      scheduleApplyAnime1Counts();
    }
  }
  if (changes.anime1FollowedItemByCat) {
    anime1FollowedItemByCatMap =
      changes.anime1FollowedItemByCat.newValue || {};
    if (isAnime1FilteredMode()) {
      showAnime1FollowedRows();
    }
  }
  if (changes.anime1UpdatedAtByCat) {
    anime1UpdatedAtByCatMap = changes.anime1UpdatedAtByCat.newValue || {};
    if (anime1BacklogOnly) {
      showAnime1FollowedRows();
    }
  }
  if (changes.supabaseSession) {
    requestAnime1VisibilityPull();
  }
});

if (window.location.hostname === "anime1.me") {
  initAnime1PageScript();
}
