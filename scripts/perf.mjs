// Frame-time measurement with an optionally throttled CPU.
// usage: node scripts/perf.mjs <width> <height> <cpuThrottle> [query]
import { chromium } from "@playwright/test";

const [w = "1440", h = "900", rate = "1", query = "?fresh&seed=7&clock=2026-09-25T20:15"] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
await page.goto(`http://localhost:3260/${query}`);
await page.waitForFunction(() => window.__halcyon?.ready(), null, { timeout: 30000 });
await page.keyboard.press("Escape");
const cdp = await page.context().newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(rate) });
// Sample rAF intervals for 12 s, beginning after a settling second.
await page.waitForTimeout(1500);
const res = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const times = [];
      let last = performance.now();
      const start = last;
      const tick = (t) => {
        times.push(t - last);
        last = t;
        if (t - start < 12000) requestAnimationFrame(tick);
        else {
          times.sort((a, b) => a - b);
          const q = (p) => times[Math.floor(times.length * p)];
          resolve({ frames: times.length, median: q(0.5), p90: q(0.9), p99: q(0.99), tier: window.__halcyonPerf?.tier, calls: window.__halcyon.calls().length, citizens: window.__halcyon.citizens().length });
        }
      };
      requestAnimationFrame(tick);
    }),
);
console.log(JSON.stringify({ viewport: `${w}x${h}`, cpu: `${rate}x`, ...res }));
await browser.close();
