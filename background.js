const SUPABASE_URL = "https://nricslvprigwwrzbmizt.supabase.co";
const SUPABASE_KEY = "sb_publishable_koKkSFul0aH2UQkTeA5Zig_QJz_limr";

const STORAGE_SESSION_KEY = "supabaseSession";
const STORAGE_DISLIKED_KEY = "dislikedSn";

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function buildSessionFromAuth(data) {
  if (!data) return null;
  const expiresAt = data.expires_at || nowSeconds() + (data.expires_in || 0);
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type,
    expires_at: expiresAt,
    user: data.user,
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

  if (!response.ok) return null;
  const data = await response.json();
  const nextSession = buildSessionFromAuth(data);
  if (nextSession) await setSession(nextSession);
  return nextSession;
}

async function getValidSession() {
  let session = await getSession();
  if (!session) return null;

  if (session.expires_at && session.expires_at - 30 <= nowSeconds()) {
    const refreshed = await refreshSession(session);
    session = refreshed || null;
  }

  return session;
}

async function signUp(email, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      error:
        data?.msg ||
        data?.error_description ||
        data?.error ||
        "Sign up failed",
    };
  }

  const session = buildSessionFromAuth(data);
  if (session) await setSession(session);
  return { ok: true, session, user: data.user || session?.user };
}

async function signIn(email, password) {
  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      error: data?.error_description || data?.error || "Sign in failed",
    };
  }

  const session = buildSessionFromAuth(data);
  if (session) await setSession(session);
  return { ok: true, session, user: session?.user };
}

async function fetchDislikedList(session) {
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Missing user id" };

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/disliked?select=sn&user_id=eq.${encodeURIComponent(
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
    return { ok: false, error: data?.message || "Fetch failed" };
  }

  const map = {};
  data.forEach((row) => {
    if (row?.sn) map[row.sn] = true;
  });

  await new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_DISLIKED_KEY]: map }, resolve);
  });

  return { ok: true, count: data.length };
}

async function upsertDisliked(session, sn) {
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Missing user id" };

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/disliked?on_conflict=user_id,sn`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ user_id: userId, sn }),
    }
  );

  if (response.ok) return { ok: true };
  const data = await response.json().catch(() => ({}));
  return { ok: false, error: data?.message || "Insert failed" };
}

async function deleteDisliked(session, sn) {
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Missing user id" };

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/disliked?user_id=eq.${encodeURIComponent(
      userId
    )}&sn=eq.${encodeURIComponent(sn)}`,
    {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${session.access_token}`,
        Prefer: "return=minimal",
      },
    }
  );

  if (response.ok) return { ok: true };
  const data = await response.json().catch(() => ({}));
  return { ok: false, error: data?.message || "Delete failed" };
}

async function handleSyncPull() {
  const session = await getValidSession();
  if (!session) return { ok: false, error: "not_signed_in" };
  return fetchDislikedList(session);
}

async function handleSyncPush(sn, disliked) {
  const session = await getValidSession();
  if (!session) return { ok: false, error: "not_signed_in" };
  if (disliked) return upsertDisliked(session, sn);
  return deleteDisliked(session, sn);
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
          });
          return;
        }
        case "auth:signup": {
          const { email, password } = message;
          const result = await signUp(email, password);
          sendResponse(result);
          return;
        }
      case "auth:signin": {
        const { email, password } = message;
        const result = await signIn(email, password);
        sendResponse(result);
        return;
      }
        case "auth:signout": {
          await clearSession();
          sendResponse({ ok: true });
          return;
        }
        case "sync:pull": {
          const result = await handleSyncPull();
          sendResponse(result);
          return;
        }
        case "sync:push": {
          const { sn, disliked } = message;
          const result = await handleSyncPush(sn, disliked);
          sendResponse(result);
          return;
        }
        default:
          sendResponse({ ok: false, error: "unknown_message" });
      }
    } catch (error) {
      const messageText =
        error?.message || error?.toString?.() || "unknown_error";
      sendResponse({ ok: false, error: messageText });
    }
  })();

  return true;
});
