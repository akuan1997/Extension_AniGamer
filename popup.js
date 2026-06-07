const statusEl = document.getElementById("status");
const emailDisplayEl = document.getElementById("emailDisplay");
const oauthSignInBtn = document.getElementById("oauthSignIn");
const signOutBtn = document.getElementById("signOut");

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

async function signInWithGitHub() {
  setStatus("Status: opening GitHub...");
  const result = await chrome.runtime.sendMessage({
    type: "auth:oauth",
    provider: "github",
  });

  if (!result?.ok) {
    setStatus(`Status: ${result?.error || "sign in failed"}`, true);
    return;
  }

  await getStatus();
}

async function signOut() {
  setStatus("Status: signing out...");
  await chrome.runtime.sendMessage({ type: "auth:signout" });
  await getStatus();
}

oauthSignInBtn.addEventListener("click", signInWithGitHub);
signOutBtn.addEventListener("click", signOut);

getStatus();
