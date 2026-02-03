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

    if (!container.querySelector(".custom-button")) {
      const button = document.createElement("button");
      button.classList.add("custom-button");
      button.style.position = "absolute";
      button.style.top = "35px";
      button.style.right = "5px";
      button.style.zIndex = "10";
      button.style.backgroundColor = "transparent";
      button.style.border = "none";
      button.style.cursor = "pointer";
      button.style.pointerEvents = "auto";

      const downvoteIcon = document.createElement("i");
      downvoteIcon.style.color = isDisliked ? "#FF6F61" : "gray";
      downvoteIcon.style.fontSize = "24px";
      downvoteIcon.textContent = "X";

      button.appendChild(downvoteIcon);

      button.addEventListener("mouseover", () => {
        downvoteIcon.style.color = "#FF6F61";
      });
      button.addEventListener("mouseout", () => {
        downvoteIcon.style.color = isDisliked ? "#FF6F61" : "gray";
      });

      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        event.preventDefault();

        const prevIsDisliked = !!dislikedMap[sn];
        const nextIsDisliked = !prevIsDisliked;

        // Optimistic UI update
        downvoteIcon.style.color = nextIsDisliked ? "#FF6F61" : "gray";
        if (img) {
          img.style.filter = nextIsDisliked ? "grayscale(100%)" : "none";
          img.style.opacity = nextIsDisliked ? "0.1" : "1";
        }

        const result = await chrome.runtime.sendMessage({
          type: "sync:push",
          sn,
          disliked: nextIsDisliked,
        });

        if (result?.ok) {
          const nextMap = { ...dislikedMap };
          if (nextIsDisliked) {
            nextMap[sn] = true;
          } else {
            delete nextMap[sn];
          }
          dislikedMap = nextMap;
          chrome.storage.local.set({ dislikedSn: dislikedMap });
          return;
        }

        // Rollback on failure
        console.warn("sync:push failed", result?.error || result);
        downvoteIcon.style.color = prevIsDisliked ? "#FF6F61" : "gray";
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
