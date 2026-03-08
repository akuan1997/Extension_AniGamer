const statusEl = document.getElementById("status");
const emailDisplayEl = document.getElementById("emailDisplay");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const signInBtn = document.getElementById("signIn");
const signUpBtn = document.getElementById("signUp");
const signOutBtn = document.getElementById("signOut");
const syncBtn = document.getElementById("sync");
const showLowScoresBtn = document.getElementById("showLowScores");
const lowScoreListEl = document.getElementById("lowScoreList");

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#fca5a5" : "#d1fae5";
}

async function getStatus() {
  const response = await chrome.runtime.sendMessage({ type: "auth:status" });
  if (!response?.ok) {
    setStatus("Status: error", true);
    return;
  }

  if (response.signedIn) {
    setStatus("Status: signed in");
    emailDisplayEl.textContent = response.email ? `User: ${response.email}` : "";
  } else {
    setStatus("Status: signed out");
    emailDisplayEl.textContent = "";
  }
}

async function signIn() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) {
    setStatus("Status: email/password required", true);
    return;
  }
  setStatus("Status: signing in...");
  const result = await chrome.runtime.sendMessage({
    type: "auth:signin",
    email,
    password,
  });
  if (!result) {
    setStatus("Status: no response from background", true);
    return;
  }
  if (!result?.ok) {
    setStatus(
      `Status: ${result?.error ? result.error : "sign in failed"}`,
      true
    );
    return;
  }
  await getStatus();
  await syncNow();
}

async function signUp() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) {
    setStatus("Status: email/password required", true);
    return;
  }
  setStatus("Status: creating account...");
  const result = await chrome.runtime.sendMessage({
    type: "auth:signup",
    email,
    password,
  });
  if (!result) {
    setStatus("Status: no response from background", true);
    return;
  }
  if (!result?.ok) {
    setStatus(
      `Status: ${result?.error ? result.error : "sign up failed"}`,
      true
    );
    return;
  }
  await getStatus();
  await syncNow();
}

async function signOut() {
  setStatus("Status: signing out...");
  await chrome.runtime.sendMessage({ type: "auth:signout" });
  await getStatus();
}

async function syncNow() {
  setStatus("Status: syncing...");
  const result = await chrome.runtime.sendMessage({ type: "sync:pull" });
  if (!result) {
    setStatus("Status: no response from background", true);
    return;
  }
  if (!result?.ok) {
    setStatus(`Status: ${result?.error || "sync failed"}`, true);
    return;
  }
  setStatus("Status: synced");
}

function renderLowScores(items) {
  if (!items.length) {
    lowScoreListEl.innerHTML = '<div class="muted tiny">No scores <= 4.5</div>';
    lowScoreListEl.classList.remove("hidden");
    return;
  }

  lowScoreListEl.innerHTML = items
    .map((item) => {
      const safeTitle = escapeHtml(item.title);
      const safeSn = encodeURIComponent(String(item.sn));
      return `<div class="list-item">
        <div class="list-title">
          <a href="https://ani.gamer.com.tw/animeRef.php?sn=${safeSn}" target="_blank" rel="noopener noreferrer">${safeTitle}</a>
        </div>
        <div class="list-score"><strong>${item.score}</strong></div>
      </div>`;
    })
    .join("");
  lowScoreListEl.classList.remove("hidden");
}

async function showLowScores() {
  const data = await chrome.storage.local.get({
    animeScoreBySn: {},
    animeTitleBySn: {},
  });
  const scoreMap = data.animeScoreBySn || {};
  const titleMap = data.animeTitleBySn || {};

  const items = Object.entries(scoreMap)
    .map(([sn, scoreText]) => {
      const score = Number.parseFloat(scoreText);
      const title = (titleMap[sn] || "").trim() || "(Unknown title)";
      return { sn, score, title };
    })
    .filter((item) => !Number.isNaN(item.score) && item.score <= 4.5)
    .sort((a, b) => b.score - a.score || Number(a.sn) - Number(b.sn))
    .map((item) => ({ sn: item.sn, score: item.score.toFixed(1), title: item.title }));

  renderLowScores(items);
}

signInBtn.addEventListener("click", signIn);
signUpBtn.addEventListener("click", signUp);
signOutBtn.addEventListener("click", signOut);
syncBtn.addEventListener("click", syncNow);
showLowScoresBtn.addEventListener("click", showLowScores);

getStatus();
