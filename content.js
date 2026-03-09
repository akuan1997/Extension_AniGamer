let dislikedMap = {};
let scoreMap = {};
let titleMap = {};
let lastSyncAt = 0;
let isListObserverReady = false;
let hasCapturedVideoScore = false;
let videoObserver = null;
let activeDetailKey = null;
let pendingRefSnForDetailPage = null;
let detailInitInProgress = false;
let lastHandledHref = "";
let applyScheduled = false;
let anime1CountMap = {};
let anime1HiddenTitleMap = {};
let anime1Ready = false;
let anime1ApplyScheduled = false;
let anime1ListObserver = null;

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

function loadAnime1CountsAndApply() {
  chrome.storage.local.get({ anime1TitleCountByKey: {}, anime1HiddenTitleByKey: {} }, (result) => {
    anime1CountMap = result.anime1TitleCountByKey || {};
    anime1HiddenTitleMap = result.anime1HiddenTitleByKey || {};
    scheduleApplyAnime1Counts();
  });
}

function saveAnime1TitleHidden(key, hidden) {
  anime1HiddenTitleMap = { ...anime1HiddenTitleMap, [key]: hidden };
  chrome.storage.local.set({ anime1HiddenTitleByKey: anime1HiddenTitleMap });
}

function applyAnime1RowHidden(row, hidden) {
  row.style.display = hidden ? "none" : "";
}

function getAnime1RowKey(row) {
  const titleCell = row.querySelector("td:first-child");
  if (!titleCell) return null;

  const link = titleCell.querySelector("a");
  if (link?.href) {
    try {
      const url = new URL(link.getAttribute("href") || link.href, window.location.origin);
      return `anime1:url:${url.origin}${url.pathname}${url.search}`;
    } catch {
      // Ignore URL parse error and fallback to title text key.
    }
  }

  const titleText = (titleCell.textContent || "").replace(/\s+/g, " ").trim();
  if (!titleText) return null;
  return `anime1:title:${titleText}`;
}

function initAnime1PageScript() {
  loadAnime1CountsAndApply();
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

function applyAnime1Counts() {
  const rows = document.querySelectorAll("#table-list tbody tr");
  rows.forEach((row) => {
    const key = getAnime1RowKey(row);
    if (!key) return;

    const titleCell = row.querySelector("td:first-child");
    if (!titleCell) return;

    let wrap = titleCell.querySelector(".anime1-custom-count-wrap");
    let input = titleCell.querySelector(".anime1-custom-count-input");
    if (!wrap || !input) {
      wrap = document.createElement("span");
      wrap.className = "anime1-custom-count-wrap";
      wrap.style.display = "inline-flex";
      wrap.style.alignItems = "center";
      wrap.style.gap = "4px";
      wrap.style.marginLeft = "8px";

      const label = document.createElement("span");
      label.textContent = "#";
      label.style.opacity = "0.75";
      label.style.fontSize = "12px";

      input = document.createElement("input");
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

      const commitValue = () => {
        const parsed = Number.parseInt(input.value, 10);
        const nextValue = Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
        input.value = String(nextValue);
        saveAnime1Count(key, nextValue);
      };

      input.addEventListener("change", commitValue);
      input.addEventListener("blur", commitValue);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          commitValue();
          input.blur();
        }
      });

      wrap.appendChild(label);
      wrap.appendChild(input);

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

      hideButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const nextHidden = true;
        saveAnime1TitleHidden(key, nextHidden);
        applyAnime1RowHidden(row, nextHidden);
      });

      hideButton.textContent = "隱藏";
      wrap.appendChild(hideButton);
      titleCell.appendChild(wrap);
    }

    const savedValue = anime1CountMap[key];
    input.value = String(typeof savedValue === "number" ? savedValue : 0);
    const hidden = !!anime1HiddenTitleMap[key];
    applyAnime1RowHidden(row, hidden);
  });
}

function scheduleApplyDislikedStyles() {
  if (applyScheduled) return;
  applyScheduled = true;
  requestAnimationFrame(() => {
    applyScheduled = false;
    applyDislikedStyles();
  });
}

function loadCacheAndApply() {
  chrome.storage.local.get(
    { dislikedSn: {}, animeScoreBySn: {}, animeTitleBySn: {} },
    (result) => {
    dislikedMap = result.dislikedSn || {};
    scoreMap = result.animeScoreBySn || {};
    titleMap = result.animeTitleBySn || {};
    scheduleApplyDislikedStyles();
  });
}

function requestRemoteSync() {
  const now = Date.now();
  if (now - lastSyncAt < 10000) return;
  lastSyncAt = now;
  chrome.runtime
    .sendMessage({ type: "sync:pull" })
    .then(() => {
      loadCacheAndApply();
    })
    .catch((error) => {
      console.warn("sync:pull failed", error);
    });
}

function observerCallback() {
  const href = window.location.href;
  if (href === lastHandledHref) return;
  lastHandledHref = href;

  const isListPage =
    href.startsWith("https://ani.gamer.com.tw/animeList.php") ||
    href.startsWith("https://ani.gamer.com.tw/search.php");
  const isVideoPage = href.startsWith("https://ani.gamer.com.tw/animeVideo.php");
  const isRefPage = href.startsWith("https://ani.gamer.com.tw/animeRef.php");
  const isAnime1Page = href.startsWith("https://anime1.me/");

  if (isListPage) {
    initListPageScript();
  }
  if (isVideoPage || isRefPage) {
    initDetailPageScript().catch((error) => {
      detailInitInProgress = false;
      console.warn("initDetailPageScript failed", error);
    });
  }
  if (isAnime1Page) {
    initAnime1PageScript();
  }
}

function initListPageScript() {
  loadCacheAndApply();
  requestRemoteSync();

  if (isListObserverReady) return;
  isListObserverReady = true;

  const domObserver = new MutationObserver((mutations) => {
    const hasAddedNode = mutations.some((mutation) => mutation.addedNodes.length > 0);
    if (hasAddedNode) {
      scheduleApplyDislikedStyles();
    }
  });

  domObserver.observe(document.body, { childList: true, subtree: true });
}

function getSnFromCurrentUrl() {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get("sn");
  } catch {
    return null;
  }
}

function getSnFromHref(href) {
  if (!href) return null;
  try {
    const url = new URL(href, window.location.origin);
    return url.searchParams.get("sn");
  } catch {
    return null;
  }
}

function getCurrentPageSnInfo() {
  const href = window.location.href;
  const isVideoPage = href.startsWith("https://ani.gamer.com.tw/animeVideo.php");
  const isRefPage = href.startsWith("https://ani.gamer.com.tw/animeRef.php");
  const currentSn = getSnFromCurrentUrl();

  let refSn = null;
  let videoSn = null;

  if (isRefPage) refSn = currentSn;
  if (isVideoPage) videoSn = currentSn;

  if (!refSn) {
    const refLink = document.querySelector("a[href*='animeRef.php?sn=']");
    refSn = getSnFromHref(refLink?.getAttribute("href") || refLink?.href);
  }
  if (!videoSn) {
    const videoLink = document.querySelector("a[href*='animeVideo.php?sn=']");
    videoSn = getSnFromHref(videoLink?.getAttribute("href") || videoLink?.href);
  }

  const keys = [];
  if (refSn) keys.push(String(refSn)); // List page uses animeRef sn.
  if (videoSn && String(videoSn) !== String(refSn)) keys.push(String(videoSn));

  return { refSn, videoSn, keys };
}

function bindCardNavigationTracking(link, sn) {
  if (!link || !sn) return;
  if (link.dataset.pendingSnBound === "1") return;
  link.dataset.pendingSnBound = "1";

  const trackPendingSn = () => {
    chrome.runtime
      .sendMessage({ type: "nav:setPendingRefSn", refSn: String(sn) })
      .catch((error) => {
        console.warn("nav:setPendingRefSn failed", error);
      });
  };

  link.addEventListener("click", trackPendingSn, true);
  link.addEventListener("auxclick", trackPendingSn, true);
}

function getCurrentPageScore() {
  const scoreEl = document.querySelector(
    "#acg_review > div.acg-score-container > div.acg-score > div.score-overall-number"
  );
  if (!scoreEl) return null;
  const raw = (scoreEl.textContent || "").trim();
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  if (Number.isNaN(parsed)) return null;
  return parsed.toFixed(1);
}

async function captureAndSaveVideoScore() {
  if (hasCapturedVideoScore) return;
  if (!pendingRefSnForDetailPage) return;

  const score = getCurrentPageScore();
  if (!score) return;

  hasCapturedVideoScore = true;
  const targetSn = String(pendingRefSnForDetailPage);
  const result = await chrome.runtime.sendMessage({
    type: "score:upsert",
    sn: targetSn,
    score,
  });

  if (result?.ok || result?.error === "not_signed_in") {
    const next = { ...scoreMap, [targetSn]: score };
    scoreMap = next;
    chrome.storage.local.set({ animeScoreBySn: next });
    return;
  }

  hasCapturedVideoScore = false;
  console.warn("score:upsert failed", result?.error || result);
}

async function initDetailPageScript() {
  const snInfo = getCurrentPageSnInfo();
  const key = snInfo.refSn ? `ref:${snInfo.refSn}` : snInfo.videoSn ? `video:${snInfo.videoSn}` : null;
  if (!key) return;
  if (activeDetailKey === key && (videoObserver || detailInitInProgress)) return;
  if (detailInitInProgress) return;
  detailInitInProgress = true;

  if (videoObserver) {
    videoObserver.disconnect();
    videoObserver = null;
  }

  activeDetailKey = key;
  loadCacheAndApply();
  requestRemoteSync();
  hasCapturedVideoScore = false;
  pendingRefSnForDetailPage = null;

  const pending = await chrome.runtime
    .sendMessage({ type: "nav:consumePendingRefSn" })
    .catch(() => null);
  if (pending?.ok && pending?.refSn) {
    pendingRefSnForDetailPage = String(pending.refSn);
  } else if (snInfo.refSn) {
    // Fallback for direct entry to animeRef page.
    pendingRefSnForDetailPage = String(snInfo.refSn);
  } else {
    pendingRefSnForDetailPage = null;
  }

  const runCapture = () => {
    captureAndSaveVideoScore().catch((error) => {
      hasCapturedVideoScore = false;
      console.warn("captureAndSaveVideoScore failed", error);
    });
  };

  runCapture();
  videoObserver = new MutationObserver(runCapture);
  videoObserver.observe(document.body, { childList: true, subtree: true });
  setTimeout(runCapture, 500);
  setTimeout(runCapture, 1500);
  setTimeout(runCapture, 3000);
  detailInitInProgress = false;
}

function applyDislikedStyles() {
  const containerLinks = document.querySelectorAll(".theme-list-main");
  let hasTitleUpdate = false;
  const nextTitleMap = { ...titleMap };

  containerLinks.forEach((link) => {
    const href = link.getAttribute("href") || "";
    const snMatch = href.match(/sn=(\d+)/);
    if (!snMatch) return;
    const sn = snMatch[1];
    bindCardNavigationTracking(link, sn);
    const nameEl = link.querySelector(".theme-name");
    const animeName = (nameEl?.textContent || "").trim();
    if (animeName && nextTitleMap[sn] !== animeName) {
      nextTitleMap[sn] = animeName;
      hasTitleUpdate = true;
    }
    const isDisliked = !!dislikedMap[sn];
    const scoreValue = Number.parseFloat(scoreMap[sn]);
    const isLowScore = !Number.isNaN(scoreValue) && scoreValue <= 4.5;
    const shouldBlur = isDisliked || isLowScore;

    const img = link.querySelector(".theme-img");
    if (img) {
      img.style.filter = shouldBlur ? "grayscale(100%)" : "none";
      img.style.opacity = shouldBlur ? "0.1" : "1";
      img.style.pointerEvents = "none";
    }

    const container = link.querySelector(".theme-img-block");
    if (!container) return;

    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }

    if (!container.querySelector(".custom-score-badge")) {
      const scoreBadge = document.createElement("div");
      scoreBadge.classList.add("custom-score-badge");
      scoreBadge.style.position = "absolute";
      scoreBadge.style.left = "5px";
      scoreBadge.style.bottom = "5px";
      scoreBadge.style.zIndex = "2147483646";
      scoreBadge.style.backgroundColor = "rgba(17, 24, 39, 0.8)";
      scoreBadge.style.color = "#ffffff";
      scoreBadge.style.fontSize = "12px";
      scoreBadge.style.fontWeight = "700";
      scoreBadge.style.lineHeight = "1";
      scoreBadge.style.padding = "4px 6px";
      scoreBadge.style.borderRadius = "6px";
      scoreBadge.style.pointerEvents = "none";
      container.appendChild(scoreBadge);
    }

    const scoreBadge = container.querySelector(".custom-score-badge");
    if (scoreBadge) {
      const score = scoreMap[sn];
      if (score === undefined || score === null || score === "") {
        scoreBadge.style.display = "none";
      } else {
        scoreBadge.style.display = "block";
        scoreBadge.textContent = String(score);
      }
    }

    if (!container.querySelector(".custom-button")) {
      const button = document.createElement("button");
      button.classList.add("custom-button");
      button.type = "button";
      button.style.position = "absolute";
      button.style.top = "35px";
      button.style.right = "5px";
      button.style.zIndex = "2147483647";
      button.style.backgroundColor = "transparent";
      button.style.border = "none";
      button.style.cursor = "pointer";
      button.style.pointerEvents = "auto";
      button.style.userSelect = "none";

      const downvoteIcon = document.createElement("i");
      downvoteIcon.style.color = "gray";
      downvoteIcon.style.fontSize = "24px";
      downvoteIcon.textContent = "X";

      button.appendChild(downvoteIcon);

      button.addEventListener("mouseover", () => {
        downvoteIcon.style.color = "#FF6F61";
      });
      button.addEventListener("mouseout", () => {
        downvoteIcon.style.color = "gray";
      });

      const stopLinkNavigation = (event) => {
        event.preventDefault();
        event.stopPropagation();
      };
      button.addEventListener("pointerdown", stopLinkNavigation);
      button.addEventListener("mousedown", stopLinkNavigation);
      button.addEventListener("mouseup", stopLinkNavigation);

      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        event.preventDefault();

        const prevIsDisliked = !!dislikedMap[sn];
        const nextIsDisliked = !prevIsDisliked;

        // Optimistic UI update
        downvoteIcon.style.color = "gray";
        if (img) {
          img.style.filter = nextIsDisliked ? "grayscale(100%)" : "none";
          img.style.opacity = nextIsDisliked ? "0.1" : "1";
        }

        let result;
        try {
          result = await chrome.runtime.sendMessage({
            type: "sync:push",
            sn,
            disliked: nextIsDisliked,
          });
        } catch (error) {
          result = {
            ok: false,
            error: error?.message || "sendMessage_failed",
          };
        }

        const allowLocalOnly = result?.error === "not_signed_in";
        if (result?.ok || allowLocalOnly) {
          const nextMap = { ...dislikedMap };
          if (nextIsDisliked) {
            nextMap[sn] = true;
          } else {
            delete nextMap[sn];
          }
          dislikedMap = nextMap;
          chrome.storage.local.set({ dislikedSn: dislikedMap });
          if (allowLocalOnly) {
            console.warn("sync:push skipped (not_signed_in), saved locally only");
          }
          return;
        }

        // Rollback on failure
        console.warn("sync:push failed", result?.error || result);
        downvoteIcon.style.color = "gray";
        if (img) {
          img.style.filter = prevIsDisliked ? "grayscale(100%)" : "none";
          img.style.opacity = prevIsDisliked ? "0.1" : "1";
        }
      });

      container.appendChild(button);
    }
  });

  if (hasTitleUpdate) {
    titleMap = nextTitleMap;
    chrome.storage.local.set({ animeTitleBySn: titleMap });
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.dislikedSn) {
    dislikedMap = changes.dislikedSn.newValue || {};
  }
  if (changes.animeScoreBySn) {
    scoreMap = changes.animeScoreBySn.newValue || {};
  }
  if (changes.animeTitleBySn) {
    titleMap = changes.animeTitleBySn.newValue || {};
  }
  if (changes.anime1TitleCountByKey) {
    anime1CountMap = changes.anime1TitleCountByKey.newValue || {};
    scheduleApplyAnime1Counts();
  }
  if (changes.anime1HiddenTitleByKey) {
    anime1HiddenTitleMap = changes.anime1HiddenTitleByKey.newValue || {};
    scheduleApplyAnime1Counts();
  }
  scheduleApplyDislikedStyles();
});

window.addEventListener("popstate", observerCallback);
window.addEventListener("hashchange", observerCallback);
setInterval(observerCallback, 1000);
observerCallback();
