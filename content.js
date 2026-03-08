let dislikedMap = {};
let lastSyncAt = 0;

function loadCacheAndApply() {
  chrome.storage.local.get({ dislikedSn: {} }, (result) => {
    dislikedMap = result.dislikedSn || {};
    applyDislikedStyles();
  });
}

function requestRemoteSync() {
  const now = Date.now();
  if (now - lastSyncAt < 10000) return;
  lastSyncAt = now;
  chrome.runtime.sendMessage({ type: "sync:pull" });
}

function addLocationObserver(callback) {
  const config = { childList: true, subtree: true };
  const observer = new MutationObserver(callback);
  observer.observe(document.body, config);
}

function observerCallback() {
  if (
    window.location.href.startsWith("https://ani.gamer.com.tw/animeList.php") ||
    window.location.href.startsWith("https://ani.gamer.com.tw/search.php")
  ) {
    initContentScript();
  }
}

function initContentScript() {
  loadCacheAndApply();
  requestRemoteSync();

  const domObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length) {
        applyDislikedStyles();
      }
    });
  });

  domObserver.observe(document.body, { childList: true, subtree: true });
}

function applyDislikedStyles() {
  const containerLinks = document.querySelectorAll(".theme-list-main");

  containerLinks.forEach((link) => {
    const href = link.getAttribute("href") || "";
    const snMatch = href.match(/sn=(\d+)/);
    if (!snMatch) return;
    const sn = snMatch[1];
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
      scoreBadge.textContent = "5.0";
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
    applyDislikedStyles();
  }
});

addLocationObserver(observerCallback);
observerCallback();
