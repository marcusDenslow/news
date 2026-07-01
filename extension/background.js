// News Hub Capture — background service worker (MV3).
//
// Two modes, both running inside the user's own authenticated browser session so
// no cookie/credential ever leaves the machine — only extracted article text:
//   1. Manual   — popup "Capture this page" grabs the current tab.
//   2. Backfill — on a timer, asks the hub which recent articles from the user's
//                 chosen (premium) domains lack full text, then opens each in a
//                 background window, extracts, and pushes it. This is the
//                 "continuous stream" mode: set the domains once, walk away.

const CONFIG_DEFAULTS = {
  hubUrl: "",
  token: "",
  autoEnabled: false,
  autoDomains: "", // comma-separated, e.g. "varden.no, aftenposten.no"
  intervalMin: 15,
  linkedDomains: [], // domains handed to the hub for server-side (headless) fetch
};

function getConfig() {
  return chrome.storage.sync.get(CONFIG_DEFAULTS);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- extraction (runs in the page, isolated world, after Readability inject) ----
function extractArticle() {
  try {
    const clone = document.cloneNode(true);
    const parsed = new Readability(clone).parse();
    const canonical = document.querySelector('link[rel="canonical"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    const urls = [
      location.href,
      canonical ? canonical.href : "",
      ogUrl ? ogUrl.getAttribute("content") : "",
    ].filter(Boolean);
    if (!parsed || !parsed.content) return { ok: false, reason: "no-article" };
    return {
      ok: true,
      url: (canonical && canonical.href) || location.href,
      urls,
      title: parsed.title || document.title || "",
      html: parsed.content,
      byline: parsed.byline || "",
      siteName: parsed.siteName || "",
      textLength: (parsed.textContent || "").trim().length,
    };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

async function extractInTab(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["vendor/Readability.js"] });
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: extractArticle });
  return res && res.result;
}

async function postToHub(result) {
  const { hubUrl, token } = await getConfig();
  if (!hubUrl || !token) return { ok: false, reason: "not-configured" };
  const endpoint = hubUrl.replace(/\/+$/, "") + "/api/capture";
  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({
        url: result.url,
        urls: result.urls,
        title: result.title,
        html: result.html,
        byline: result.byline,
        siteName: result.siteName,
      }),
    });
  } catch (e) {
    return { ok: false, reason: "network: " + e };
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, reason: "hub " + res.status + ": " + t.slice(0, 140) };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: true, textLength: result.textLength, stored: data.stored };
}

// ---- manual capture of the active tab ----
async function captureActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return { ok: false, reason: "no-tab" };
  if (!/^https?:/.test(tab.url || "")) return { ok: false, reason: "unsupported-page" };
  let result;
  try {
    result = await extractInTab(tab.id);
  } catch (e) {
    return { ok: false, reason: "extract: " + e };
  }
  if (!result || !result.ok) return { ok: false, reason: (result && result.reason) || "no-article" };
  if (result.textLength < 200) return { ok: false, reason: "too-short (guest stub?)" };
  return postToHub(result);
}

// ---- server-side linking: hand a site's cookie to the hub (one click) ----
const rootDomain = (host) => (host || "").toLowerCase().replace(/^www\./, "");

// Reads ALL cookies for the domain — including httpOnly session cookies that
// document.cookie can't see. That's why this must run in the extension.
async function readCookieHeader(domain) {
  const cookies = await chrome.cookies.getAll({ domain });
  const seen = new Set();
  const parts = [];
  for (const c of cookies) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    parts.push(c.name + "=" + c.value);
  }
  return parts.join("; ");
}

async function sendCookie(domain, cookie) {
  const { hubUrl, token } = await getConfig();
  if (!hubUrl || !token) return { ok: false, reason: "not-configured" };
  if (!cookie) return { ok: false, reason: "no cookie (are you logged in?)" };
  let res;
  try {
    res = await fetch(hubUrl.replace(/\/+$/, "") + "/api/premium/cookie", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ domain, cookie }),
    });
  } catch (e) {
    return { ok: false, reason: "network: " + e };
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, reason: "hub " + res.status + ": " + t.slice(0, 140) };
  }
  return { ok: true, domain };
}

async function linkSite() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/.test(tab.url || "")) return { ok: false, reason: "open the news site first" };
  const domain = rootDomain(new URL(tab.url).hostname);
  const cookie = await readCookieHeader(domain);
  const r = await sendCookie(domain, cookie);
  if (r.ok) {
    const { linkedDomains } = await getConfig();
    if (!linkedDomains.includes(domain)) {
      await chrome.storage.sync.set({ linkedDomains: [...linkedDomains, domain] });
    }
  }
  return r;
}

// Re-push linked cookies periodically so the hub's stored copy stays fresh.
async function syncLinkedCookies() {
  const { linkedDomains } = await getConfig();
  for (const domain of linkedDomains || []) {
    const cookie = await readCookieHeader(domain);
    if (cookie) await sendCookie(domain, cookie);
  }
}

// ---- backfill ----
function waitForTabLoad(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(ok);
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") finish(true);
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => finish(false), timeoutMs);
  });
}

async function backfillOne(url, windowId) {
  let tab;
  try {
    tab = await chrome.tabs.create({ url, active: false, windowId });
  } catch (e) {
    return { ok: false, reason: "tab-create: " + e };
  }
  try {
    await waitForTabLoad(tab.id, 25000);
    await sleep(2500 + Math.random() * 2000); // let JS / paywall content render
    const result = await extractInTab(tab.id);
    if (!result || !result.ok) return { ok: false, reason: (result && result.reason) || "no-article" };
    if (result.textLength < 200) return { ok: false, reason: "too-short" };
    return await postToHub(result);
  } catch (e) {
    return { ok: false, reason: "backfill: " + e };
  } finally {
    if (tab && tab.id) chrome.tabs.remove(tab.id).catch(() => {});
  }
}

let backfilling = false;

async function runBackfill(trigger) {
  if (backfilling) return { ok: false, reason: "already-running" };
  const { hubUrl, token, autoEnabled, autoDomains } = await getConfig();
  if (trigger === "alarm" && !autoEnabled) return { ok: false, reason: "disabled" };
  if (!hubUrl || !token) return { ok: false, reason: "not-configured" };
  const domains = (autoDomains || "").split(",").map((s) => s.trim()).filter(Boolean).join(",");
  if (!domains) return { ok: false, reason: "no-domains" };

  backfilling = true;
  let done = 0;
  let failed = 0;
  try {
    const listUrl =
      hubUrl.replace(/\/+$/, "") + "/api/capture/pending?limit=8&domains=" + encodeURIComponent(domains);
    let res;
    try {
      res = await fetch(listUrl, { headers: { Authorization: "Bearer " + token } });
    } catch (e) {
      return { ok: false, reason: "network: " + e };
    }
    if (!res.ok) return { ok: false, reason: "pending " + res.status };
    const { pending } = await res.json();
    if (!pending || !pending.length) return { ok: true, done: 0, failed: 0, empty: true };

    // A dedicated minimized window keeps backfill tabs out of the user's way.
    let win;
    try {
      win = await chrome.windows.create({ focused: false, state: "minimized" });
    } catch {
      win = null;
    }
    const windowId = win ? win.id : undefined;

    for (const item of pending) {
      const r = await backfillOne(item.url, windowId);
      if (r.ok) done++;
      else failed++;
      await sleep(4000 + Math.random() * 5000); // polite jitter between fetches
    }

    if (windowId) chrome.windows.remove(windowId).catch(() => {});
    return { ok: true, done, failed };
  } catch (e) {
    return { ok: false, reason: String(e), done, failed };
  } finally {
    backfilling = false;
  }
}

// ---- alarms ----
async function setupAlarm() {
  const { intervalMin } = await getConfig();
  chrome.alarms.create("backfill", { periodInMinutes: Math.max(5, Number(intervalMin) || 15) });
}

chrome.runtime.onInstalled.addListener(setupAlarm);
chrome.runtime.onStartup.addListener(setupAlarm);
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "backfill") {
    syncLinkedCookies(); // keep the hub's stored cookies fresh
    runBackfill("alarm");
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.intervalMin) setupAlarm();
});

// ---- popup messages ----
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "capture") {
    (async () => sendResponse(await captureActiveTab()))();
    return true;
  }
  if (msg && msg.type === "runBackfillNow") {
    (async () => sendResponse(await runBackfill("manual")))();
    return true;
  }
  if (msg && msg.type === "linkSite") {
    (async () => sendResponse(await linkSite()))();
    return true;
  }
  return false;
});
