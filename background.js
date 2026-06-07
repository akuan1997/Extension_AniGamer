const SUPABASE_URL = "https://nkqujduwuxulmqioezej.supabase.co";
const SUPABASE_KEY = "sb_publishable_ZB3VrxWap8UFuP3bgq-DIw_lbHWH_JF";

const STORAGE_SESSION_KEY = "supabaseSession";
const OAUTH_REDIRECT_PATH = "supabase-auth";

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function buildSessionFromAuth(data) {
  if (!data) return null;
  const expiresAt = Number(data.expires_at) || nowSeconds() + Number(data.expires_in || 0);
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type || "bearer",
    expires_at: expiresAt,
    user: data.user || null,
  };
}

async function getSession() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [STORAGE_SESSION_KEY]: null }, (result) => {
      resolve(result[STORAGE_SESSION_KEY]);
    });
  });
}

async function setSession(session) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_SESSION_KEY]: session }, resolve);
  });
}

async function clearSession() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(STORAGE_SESSION_KEY, resolve);
  });
}

async function signOut() {
  const session = await getSession();
  if (session?.access_token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
    }).catch(() => null);
  }

  await clearSession();
}

async function fetchUser(accessToken) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  return data;
}

async function refreshSession(session) {
  if (!session?.refresh_token) return null;
  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return null;

  const nextSession = buildSessionFromAuth(data);
  if (nextSession?.access_token && !nextSession.user) {
    nextSession.user = await fetchUser(nextSession.access_token);
  }
  if (nextSession) await setSession(nextSession);
  return nextSession;
}

async function getValidSession() {
  let session = await getSession();
  if (!session) return null;

  if (session.expires_at && session.expires_at - 30 <= nowSeconds()) {
    session = await refreshSession(session);
  }

  return session;
}

function getRedirectUrl() {
  return chrome.identity.getRedirectURL(OAUTH_REDIRECT_PATH);
}

function parseCallbackParams(callbackUrl) {
  const url = new URL(callbackUrl);
  const params = new URLSearchParams(url.search);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));

  for (const [key, value] of hashParams.entries()) {
    if (!params.has(key)) params.set(key, value);
  }

  return params;
}

async function launchAuthFlow(authUrl) {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      (callbackUrl) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        if (!callbackUrl) {
          reject(new Error("Missing auth callback URL"));
          return;
        }
        resolve(callbackUrl);
      }
    );
  });
}

async function launchAuthFlowInTab(authUrl) {
  const redirectUrl = getRedirectUrl();

  return new Promise((resolve, reject) => {
    let authTabId = null;
    let timeoutId = null;

    const cleanup = () => {
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      chrome.tabs.onRemoved.removeListener(handleRemoved);
      if (timeoutId) clearTimeout(timeoutId);
    };

    const finish = (callbackUrl) => {
      cleanup();
      if (authTabId !== null) {
        chrome.tabs.remove(authTabId).catch(() => null);
      }
      resolve(callbackUrl);
    };

    const handleUpdated = (tabId, changeInfo, tab) => {
      if (tabId !== authTabId) return;
      const nextUrl = changeInfo.url || tab?.url || "";
      if (nextUrl.startsWith(redirectUrl)) {
        finish(nextUrl);
      }
    };

    const handleRemoved = (tabId) => {
      if (tabId !== authTabId) return;
      cleanup();
      reject(new Error("Authorization tab was closed before sign in completed"));
    };

    chrome.tabs.onUpdated.addListener(handleUpdated);
    chrome.tabs.onRemoved.addListener(handleRemoved);

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Authorization timed out"));
    }, 120000);

    chrome.tabs.create({ url: authUrl, active: true }, (tab) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        cleanup();
        reject(new Error(runtimeError.message));
        return;
      }

      authTabId = tab?.id ?? null;
      if (authTabId === null) {
        cleanup();
        reject(new Error("Unable to open authorization tab"));
      }
    });
  });
}

async function saveSessionFromCallback(callbackUrl) {
  const params = parseCallbackParams(callbackUrl);
  const error = params.get("error") || params.get("error_description");
  if (error) return { ok: false, error };

  const session = buildSessionFromAuth({
    access_token: params.get("access_token"),
    refresh_token: params.get("refresh_token"),
    token_type: params.get("token_type"),
    expires_in: params.get("expires_in"),
    expires_at: params.get("expires_at"),
  });

  if (!session?.access_token) {
    return { ok: false, error: "Missing access token in auth callback" };
  }

  session.user = await fetchUser(session.access_token);
  await setSession(session);
  return { ok: true, session, user: session.user };
}

async function signInWithOAuth(provider) {
  const authUrlString = buildOAuthUrl(provider);
  let callbackUrl;
  try {
    callbackUrl = await launchAuthFlow(authUrlString);
  } catch (error) {
    const message = error?.message || "";
    if (!message.includes("Authorization page could not be loaded")) {
      throw error;
    }
    callbackUrl = await launchAuthFlowInTab(authUrlString);
  }
  return saveSessionFromCallback(callbackUrl);
}

function buildOAuthUrl(provider) {
  const authUrl = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
  authUrl.searchParams.set("provider", provider || "github");
  authUrl.searchParams.set("redirect_to", getRedirectUrl());
  authUrl.searchParams.set("flow_type", "implicit");
  return authUrl.toString();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (!message || !message.type) {
        sendResponse({ ok: false, error: "invalid_message" });
        return;
      }

      switch (message.type) {
        case "auth:status": {
          const session = await getValidSession();
          sendResponse({
            ok: true,
            signedIn: !!session,
            email: session?.user?.email || null,
            redirectUrl: getRedirectUrl(),
          });
          return;
        }
        case "auth:oauth": {
          const result = await signInWithOAuth("github");
          sendResponse(result);
          return;
        }
        case "auth:signout": {
          await signOut();
          sendResponse({ ok: true });
          return;
        }
        default:
          sendResponse({ ok: false, error: "unknown_message" });
      }
    } catch (error) {
      const messageText = error?.message || error?.toString?.() || "unknown_error";
      sendResponse({ ok: false, error: messageText });
    }
  })();

  return true;
});
