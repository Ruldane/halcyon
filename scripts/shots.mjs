// Visual QA: screenshots of the running site at chosen viewports and clocks.
// usage: node scripts/shots.mjs <name> <width> <height> "<query>" [waitMs] [actions]
import { chromium } from "@playwright/test";

const [name = "shot", w = "1440", h = "900", query = "", wait = "6000", actions = ""] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
const logs = [];
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(`http://localhost:3260/${query}`);
await page.waitForFunction(() => window.__halcyon?.ready(), null, { timeout: 30000 }).catch(() => logs.push("never ready"));
await page.waitForTimeout(Number(wait));
for (const a of actions.split(";").filter(Boolean)) {
  const [kind, arg] = a.split(":");
  if (kind === "close-note") await page.keyboard.press("Escape");
  if (kind === "listen") {
    await page.evaluate(() => {
      const c = window.__halcyon.calls().find((x) => x.phase === "talk" || x.phase === "ring");
      if (c) window.__halcyon.listen(c.id);
    });
  }
  if (kind === "trace") {
    await page.evaluate(() => {
      const r = window.__halcyon.store().census?.widest;
      if (r) window.__halcyon.trace(r.id);
    });
  }
  if (kind === "card") await page.evaluate((id) => window.__halcyon.inspect(Number(id)), arg ?? "5");
  if (kind === "wait") await page.waitForTimeout(Number(arg));
  if (kind === "scroll") await page.evaluate((y) => window.scrollTo(0, Number(y)), arg);
  if (kind === "full") {
    await page.screenshot({ path: `../.shots/halcyon-${name}-full.png`, fullPage: true });
  }
}
await page.screenshot({ path: `../.shots/halcyon-${name}.png` });
const info = await page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth - window.innerWidth,
  calls: window.__halcyon?.calls().length,
  perf: window.__halcyon?.perf(),
}));
console.log(JSON.stringify(info));
console.log(logs.slice(0, 20).join("\n"));
await browser.close();
