const statusEl = document.getElementById("status");
const emailDisplayEl = document.getElementById("emailDisplay");
const providerSelect = document.getElementById("provider");
const oauthSignInBtn = document.getElementById("oauthSignIn");
const ssoInput = document.getElementById("ssoInput");
const ssoSignInBtn = document.getElementById("ssoSignIn");
const signOutBtn = document.getElementById("signOut");
const oauthUrlEl = document.getElementById("oauthUrl");
const redirectUrlEl = document.getElementById("redirectUrl");

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#fca5a5" : "#d1fae5";
}

function parseSsoInput(value) {
  const trimmed = value.trim();
  if (!trimmed) return {};

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(trimmed)) {
    return { providerId: trimmed };
  }
  return { domain: trimmed };
}

async function getStatus() {
  const response = await chrome.runtime.sendMessage({ type: "auth:status" });
  if (!response?.ok) {
    setStatus("Status: error", true);
    return;
  }

  redirectUrlEl.textContent = response.redirectUrl || "";

  if (response.signedIn) {
    setStatus("Status: signed in");
    emailDisplayEl.textContent = response.email ? `User: ${response.email}` : "";
  } else {
    setStatus("Status: signed out");
    emailDisplayEl.textContent = "";
  }
}

async function refreshDebugUrl() {
  const response = await chrome.runtime.sendMessage({
    type: "auth:debugUrl",
    provider: providerSelect.value,
  });

  if (!response?.ok) return;
  oauthUrlEl.textContent = response.authUrl || "";
  redirectUrlEl.textContent = response.redirectUrl || "";
}

async function signInWithOAuth() {
  setStatus("Status: opening OAuth...");
  const result = await chrome.runtime.sendMessage({
    type: "auth:oauth",
    provider: providerSelect.value,
  });

  if (!result?.ok) {
    setStatus(`Status: ${result?.error || "sign in failed"}`, true);
    return;
  }

  await getStatus();
}

async function signInWithSso() {
  const ssoParams = parseSsoInput(ssoInput.value);
  if (!ssoParams.domain && !ssoParams.providerId) {
    setStatus("Status: SSO domain or provider ID required", true);
    return;
  }

  setStatus("Status: opening enterprise SSO...");
  const result = await chrome.runtime.sendMessage({
    type: "auth:sso",
    ...ssoParams,
  });

  if (!result?.ok) {
    setStatus(`Status: ${result?.error || "SSO failed"}`, true);
    return;
  }

  await getStatus();
}

async function signOut() {
  setStatus("Status: signing out...");
  await chrome.runtime.sendMessage({ type: "auth:signout" });
  await getStatus();
}

oauthSignInBtn.addEventListener("click", signInWithOAuth);
providerSelect.addEventListener("change", refreshDebugUrl);
ssoSignInBtn.addEventListener("click", signInWithSso);
signOutBtn.addEventListener("click", signOut);

getStatus();
refreshDebugUrl();
