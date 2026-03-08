let dislikedMap = {};
let scoreMap = {};
let lastSyncAt = 0;
let isListObserverReady = false;
let hasCapturedVideoScore = false;
let videoObserver = null;
let activeDetailKey = null;
let pendingRefSnForDetailPage = null;
let detailInitInProgress = false;
let lastHandledHref = "";
let applyScheduled = false;

function scheduleApplyDislikedStyles() {
  if (applyScheduled) return;
  applyScheduled = true;
  requestAnimationFrame(() => {
    applyScheduled = false;
    applyDislikedStyles();
  });
}

function loadCacheAndApply() {
  chrome.storage.local.get({ dislikedSn: {}, animeScoreBySn: {} }, (result) => {
    dislikedMap = result.dislikedSn || {};
    scoreMap = result.animeScoreBySn || {};
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

  if (isListPage) {
    initListPageScript();
  }
  if (isVideoPage || isRefPage) {
    initDetailPageScript().catch((error) => {
      detailInitInProgress = false;
      console.warn("initDetailPageScript failed", error);
    });
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

  containerLinks.forEach((link) => {
    const href = link.getAttribute("href") || "";
    const snMatch = href.match(/sn=(\d+)/);
    if (!snMatch) return;
    const sn = snMatch[1];
    bindCardNavigationTracking(link, sn);
    const isDisliked = !!dislikedMap[sn];

    const img = link.querySelector(".theme-img");
    if (img) {
      img.style.filter = isDisliked ? "grayscale(100%)" : "none";
      img.style.opacity = isDisliked ? "0.1" : "1";
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
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.dislikedSn) {
    dislikedMap = changes.dislikedSn.newValue || {};
  }
  if (changes.animeScoreBySn) {
    scoreMap = changes.animeScoreBySn.newValue || {};
  }
  scheduleApplyDislikedStyles();
});

window.addEventListener("popstate", observerCallback);
window.addEventListener("hashchange", observerCallback);
setInterval(observerCallback, 1000);
observerCallback();
