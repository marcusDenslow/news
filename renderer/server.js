// Optional headless renderer for JS-heavy paywalls. Tiny HTTP service: POST
// /render {url, cookie} -> launches Chromium with the cookie, renders the page,
// returns the final HTML. The web app extracts article text from it (tier 2 of
// fetchArticle). Only run this when you actually need JS-rendered sites.

const http = require("http");
const { chromium } = require("playwright");

const PORT = process.env.PORT || 4000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

let browser;
async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }
  return browser;
}

// Turn a raw "a=1; b=2" Cookie header into Playwright cookie objects scoped to
// the target URL's origin.
function parseCookies(cookieStr, url) {
  return cookieStr
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf("=");
      if (i < 0) return null;
      return { name: pair.slice(0, i).trim(), value: pair.slice(i + 1).trim(), url };
    })
    .filter((c) => c && c.name);
}

async function render(url, cookieStr) {
  const b = await getBrowser();
  const ctx = await b.newContext({ userAgent: UA, locale: "nb-NO" });
  try {
    if (cookieStr) await ctx.addCookies(parseCookies(cookieStr, url));
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 40_000 });
    await page.waitForTimeout(1500); // let late hydration settle
    return await page.content();
  } finally {
    await ctx.close();
  }
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200).end("ok");
    return;
  }
  if (req.method === "POST" && req.url === "/render") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const { url, cookie } = JSON.parse(body || "{}");
        if (!url) {
          res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "url required" }));
          return;
        }
        const html = await render(url, cookie || "");
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ html }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: String(e) }));
      }
    });
    return;
  }
  res.writeHead(404).end();
});

server.listen(PORT, () => console.log("renderer listening on :" + PORT));
