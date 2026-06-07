const SUPABASE_URL = "https://nkqujduwuxulmqioezej.supabase.co";
const SUPABASE_KEY = "sb_publishable_ZB3VrxWap8UFuP3bgq-DIw_lbHWH_JF";

const STORAGE_SESSION_KEY = "supabaseSession";
const STORAGE_ANIME1_HIDDEN_CAT_KEY = "anime1HiddenCatByCat";
const STORAGE_ANIME1_FOLLOWED_CAT_KEY = "anime1FollowedCatByCat";
const STORAGE_ANIME1_COUNT_CAT_KEY = "anime1CountByCat";
const ANIME1_VISIBILITY_TABLE = "anime1_visibility";
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

async function saveAnime1HiddenCatMap(map) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_ANIME1_HIDDEN_CAT_KEY]: map }, resolve);
  });
}

async function getAnime1HiddenCatMap() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [STORAGE_ANIME1_HIDDEN_CAT_KEY]: {} }, (result) => {
      resolve(result[STORAGE_ANIME1_HIDDEN_CAT_KEY] || {});
    });
  });
}

async function saveAnime1FollowedCatMap(map) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_ANIME1_FOLLOWED_CAT_KEY]: map }, resolve);
  });
}

async function getAnime1FollowedCatMap() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [STORAGE_ANIME1_FOLLOWED_CAT_KEY]: {} }, (result) => {
      resolve(result[STORAGE_ANIME1_FOLLOWED_CAT_KEY] || {});
    });
  });
}

async function saveAnime1CountCatMap(map) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_ANIME1_COUNT_CAT_KEY]: map }, resolve);
  });
}

async function getAnime1CountCatMap() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [STORAGE_ANIME1_COUNT_CAT_KEY]: {} }, (result) => {
      resolve(result[STORAGE_ANIME1_COUNT_CAT_KEY] || {});
    });
  });
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

async function pullAnime1Visibility() {
  const session = await getValidSession();
  const userId = session?.user?.id;
  if (!session || !userId) return { ok: false, error: "not_signed_in" };

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${ANIME1_VISIBILITY_TABLE}?select=cat,show,count&user_id=eq.${encodeURIComponent(
      userId
    )}`,
    {
      method: "GET",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${session.access_token}`,
        Accept: "application/json",
      },
    }
  );

  const data = await response.json().catch(() => []);
  if (!response.ok) {
    return { ok: false, error: data?.message || "Fetch anime1 visibility failed" };
  }

  const hiddenMap = {};
  const followedMap = {};
  const countMap = {};
  data.forEach((row) => {
    if (row?.cat === undefined || row?.cat === null) return;
    const cat = String(row.cat);
    hiddenMap[cat] = row.show === "hide";
    followedMap[cat] = row.show === "follow";
    if (row.count !== undefined && row.count !== null) {
      const count = Number.parseInt(String(row.count), 10);
      countMap[cat] = Number.isNaN(count) || count < 0 ? 0 : count;
    }
  });

  const [currentHiddenMap, currentFollowedMap, currentCountMap] = await Promise.all([
    getAnime1HiddenCatMap(),
    getAnime1FollowedCatMap(),
    getAnime1CountCatMap(),
  ]);

  await saveAnime1HiddenCatMap({ ...currentHiddenMap, ...hiddenMap });
  await saveAnime1FollowedCatMap({ ...currentFollowedMap, ...followedMap });
  await saveAnime1CountCatMap({ ...currentCountMap, ...countMap });
  return { ok: true, count: data.length };
}

async function upsertAnime1Visibility(cat, show) {
  const session = await getValidSession();
  const userId = session?.user?.id;
  if (!session || !userId) return { ok: false, error: "not_signed_in" };

  const catNumber = Number.parseInt(String(cat), 10);
  if (!Number.isInteger(catNumber) || catNumber < 0) {
    return { ok: false, error: "invalid_cat" };
  }

  const nextShow = ["hide", "follow"].includes(show) ? show : "show";
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${ANIME1_VISIBILITY_TABLE}?on_conflict=user_id,cat`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        user_id: userId,
        cat: catNumber,
        show: nextShow,
        updated_at: new Date().toISOString(),
      }),
    }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    return { ok: false, error: data?.message || "Upsert anime1 visibility failed" };
  }

  return { ok: true };
}

async function upsertAnime1Count(cat, count) {
  const session = await getValidSession();
  const userId = session?.user?.id;
  if (!session || !userId) return { ok: false, error: "not_signed_in" };

  const catNumber = Number.parseInt(String(cat), 10);
  if (!Number.isInteger(catNumber) || catNumber < 0) {
    return { ok: false, error: "invalid_cat" };
  }

  const countNumber = Number.parseInt(String(count), 10);
  if (!Number.isInteger(countNumber) || countNumber < 0) {
    return { ok: false, error: "invalid_count" };
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${ANIME1_VISIBILITY_TABLE}?on_conflict=user_id,cat`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        user_id: userId,
        cat: catNumber,
        count: countNumber,
        updated_at: new Date().toISOString(),
      }),
    }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    return { ok: false, error: data?.message || "Upsert anime1 count failed" };
  }

  return { ok: true };
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
        case "anime1:visibilityPull": {
          const result = await pullAnime1Visibility();
          sendResponse(result);
          return;
        }
        case "anime1:visibilityUpsert": {
          const result = await upsertAnime1Visibility(message.cat, message.show);
          sendResponse(result);
          return;
        }
        case "anime1:countUpsert": {
          const result = await upsertAnime1Count(message.cat, message.count);
          sendResponse(result);
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
