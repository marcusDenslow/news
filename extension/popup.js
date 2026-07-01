const $ = (id) => document.getElementById(id);

const DEFAULTS = {
  hubUrl: "",
  token: "",
  autoEnabled: false,
  autoDomains: "",
  intervalMin: 15,
};

function status(msg, kind) {
  const el = $("status");
  el.textContent = msg;
  el.className = "status " + (kind || "");
}

async function load() {
  const c = await chrome.storage.sync.get(DEFAULTS);
  $("hubUrl").value = c.hubUrl;
  $("token").value = c.token;
  $("autoEnabled").checked = !!c.autoEnabled;
  $("autoDomains").value = c.autoDomains;
  $("intervalMin").value = c.intervalMin;
}

async function save() {
  await chrome.storage.sync.set({
    hubUrl: $("hubUrl").value.trim(),
    token: $("token").value.trim(),
    autoEnabled: $("autoEnabled").checked,
    autoDomains: $("autoDomains").value.trim(),
    intervalMin: Math.max(5, Number($("intervalMin").value) || 15),
  });
  status("Saved.", "ok");
}

async function capture() {
  if (!$("hubUrl").value.trim() || !$("token").value.trim()) {
    status("Set the Hub URL and token first.", "err");
    return;
  }
  await save();
  status("Capturing…", "");
  $("capture").disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: "capture" });
    if (res && res.ok) status(`Sent full article (${res.textLength} chars).`, "ok");
    else status("Failed: " + ((res && res.reason) || "unknown"), "err");
  } catch (e) {
    status("Failed: " + e, "err");
  } finally {
    $("capture").disabled = false;
  }
}

async function runNow() {
  await save();
  if (!$("autoDomains").value.trim()) {
    status("Add at least one domain first.", "err");
    return;
  }
  status("Backfilling… (this can take a minute)", "");
  $("runNow").disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: "runBackfillNow" });
    if (res && res.ok && res.empty) status("Nothing to backfill — all caught up.", "ok");
    else if (res && res.ok) status(`Backfilled ${res.done} article(s), ${res.failed} failed.`, res.failed ? "err" : "ok");
    else status("Failed: " + ((res && res.reason) || "unknown"), "err");
  } catch (e) {
    status("Failed: " + e, "err");
  } finally {
    $("runNow").disabled = false;
  }
}

async function linkSite() {
  if (!$("hubUrl").value.trim() || !$("token").value.trim()) {
    status("Set the Hub URL and token first.", "err");
    return;
  }
  await save();
  status("Linking… (make sure you're logged in here)", "");
  $("linkSite").disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: "linkSite" });
    if (res && res.ok) status(`Linked ${res.domain} — hub will fetch it headlessly.`, "ok");
    else status("Failed: " + ((res && res.reason) || "unknown"), "err");
  } catch (e) {
    status("Failed: " + e, "err");
  } finally {
    $("linkSite").disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  $("save").addEventListener("click", save);
  $("capture").addEventListener("click", capture);
  $("runNow").addEventListener("click", runNow);
  $("linkSite").addEventListener("click", linkSite);
});
