const statusEl = document.getElementById("status");
const emailDisplayEl = document.getElementById("emailDisplay");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const signInBtn = document.getElementById("signIn");
const signUpBtn = document.getElementById("signUp");
const signOutBtn = document.getElementById("signOut");
const syncBtn = document.getElementById("sync");

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

signInBtn.addEventListener("click", signIn);
signUpBtn.addEventListener("click", signUp);
signOutBtn.addEventListener("click", signOut);
syncBtn.addEventListener("click", syncNow);

getStatus();
