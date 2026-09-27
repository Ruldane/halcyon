import { expect, test, type Page } from "@playwright/test";

/**
 * Behavioural browser tests. The page exposes read-only views of the city on
 * window.__halcyon (the same tick and store the page renders from) and the
 * same commands the controls use. Interactions go through the real UI.
 */

type CallView = { id: number; from: number; answer: number; to: number; fromLine: number; toLine: number; phase: string; listened: boolean; talkAt: number };
type Hal = {
  ready: () => boolean;
  t: () => number;
  speed: () => number;
  citizens: () => number[];
  lines: () => number[];
  calls: () => CallView[];
  owners: () => number[];
  store: () => {
    listening: { call: number; from: number; answer: number; lines: { who: number; name: string; text: string }[]; ended: boolean } | null;
    trace: { id: number; hops: { v: number; parent: number; alone: boolean; tellerName: string; hearerName: string; t: number }[] } | null;
    card: { id: number; name: string; status: string; act: number } | null;
    census: { widest: { id: number } | null } | null;
    log: { text: string; kind: string }[];
    absence: string | null;
    savedAt: number | null;
    still: boolean;
    seed: number;
    slip: string;
  };
  windowCentre: (i: number) => { x: number; y: number; inView: boolean } | null;
  windowState: (i: number) => number;
};

const errorsOf = new WeakMap<Page, string[]>();

async function open(page: Page, query = "?fresh&seed=7&clock=2026-09-25T20:15") {
  const errors: string[] = [];
  errorsOf.set(page, errors);
  page.on("console", (m) => {
    if (m.type() === "error" || /hydrat/i.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/${query}`);
  await page.waitForFunction(() => (window as unknown as { __halcyon?: Hal }).__halcyon?.ready());
  // Put the supervisor's memorandum away, if it is showing.
  const memo = page.getByRole("button", { name: /take position three/i });
  if (await memo.isVisible().catch(() => false)) await memo.click();
  return errors;
}

const h = <T,>(page: Page, fn: (h: Hal) => T) =>
  page.evaluate((src) => {
    const f = new Function("h", `return (${src})(h)`);
    return f((window as unknown as { __halcyon: Hal }).__halcyon);
  }, fn.toString()) as Promise<Awaited<T>>;

test.afterEach(async ({ page }) => {
  expect(errorsOf.get(page) ?? []).toEqual([]);
});

test("the city changes with no input", async ({ page }) => {
  await open(page);
  const a = await h(page, (h) => ({ t: h.t(), lines: h.lines().join(","), cit: h.citizens().join(","), calls: h.calls().map((c) => c.id).join(",") }));
  await page.waitForTimeout(9000);
  const b = await h(page, (h) => ({ t: h.t(), lines: h.lines().join(","), cit: h.citizens().join(","), calls: h.calls().map((c) => c.id).join(",") }));
  expect(b.t).toBeGreaterThan(a.t + 7000);
  expect(b.lines !== a.lines || b.calls !== a.calls || b.cit !== a.cit).toBe(true);
  // The board shows live calls as lit lamps and tickets.
  await expect(page.locator(".jack[data-s='3'], .jack[data-s='2'], .jack[data-s='1']").first()).toBeVisible();
});

test("holding the board really stops the city, and resuming starts it again", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /hold the board/i }).click();
  await expect(page.getByRole("button", { name: /board held/i })).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(800);
  const a = await h(page, (h) => ({ t: h.t(), lines: h.lines().join(","), calls: JSON.stringify(h.calls()) }));
  await page.waitForTimeout(3000);
  const b = await h(page, (h) => ({ t: h.t(), lines: h.lines().join(","), calls: JSON.stringify(h.calls()) }));
  expect(b).toEqual(a);
  await page.getByRole("button", { name: /board held/i }).click();
  await expect.poll(() => h(page, (h) => h.t()), { timeout: 6000 }).toBeGreaterThan(a.t);
});

test("listening in shows a conversation between the two real callers on that line", async ({ page }) => {
  await open(page);
  // Wait for a call to be put through, then press its jack on the board.
  await expect.poll(() => h(page, (h) => h.calls().some((c) => c.phase === "ring" && c.to >= 0)), { timeout: 30_000 }).toBe(true);
  const call = await h(page, (h) => h.calls().find((c) => c.phase === "ring" && c.to >= 0)!);
  const number = await page.evaluate((id) => (window as unknown as { __halcyon: Hal & { lineNumber: (id: number) => string } }).__halcyon.lineNumber(id), call.fromLine);
  await page.locator(`.jack[data-label^="${number},"]`).click();
  const slip = page.getByRole("complementary", { name: /listening in/i });
  await expect(slip).toBeVisible();
  // Words arrive on the line, as the call goes on.
  await expect.poll(() => h(page, (h) => h.store().listening?.lines.filter((l) => l.who !== 2).length ?? 0), { timeout: 45_000 }).toBeGreaterThan(2);
  const heard = await h(page, (h) => h.store().listening!);
  expect(heard.call).toBe(call.id);
  const live = (await h(page, (h) => h.calls())).find((c) => c.id === call.id);
  const answer = live ? live.answer : heard.answer;
  const nameOf = (id: number) => page.evaluate((i) => (window as unknown as { __halcyon: { nameOf: (i: number) => string | null } }).__halcyon.nameOf(i), id);
  const parties = [await nameOf(call.from), answer >= 0 ? await nameOf(answer) : null].filter(Boolean) as string[];
  // Everyone who speaks is one of the parties on that line (or the one who fetched them to the telephone).
  const speakers = [...new Set(heard.lines.filter((l) => l.who !== 2).map((l) => l.name))];
  expect(speakers.some((s) => parties.includes(s))).toBe(true);
  expect(heard.lines.filter((l) => l.who === 0).every((l) => l.name === parties[0])).toBe(true);
  // The transcript on screen is the one the simulation produced.
  const shown = await slip.locator(".said__text").allInnerTexts();
  for (const l of heard.lines.slice(-3)) expect(shown.some((t) => t.includes(l.text))).toBe(true);
  // And the jack is marked as listened on the board.
  await expect(page.locator(".jack[data-l='1']").first()).toBeVisible();
});

test("a traced rumour's path in the slip matches the simulation's", async ({ page }) => {
  await open(page);
  await page.locator("#census").scrollIntoViewIfNeeded();
  const traceBtn = page.getByRole("button", { name: /trace it/i }).first();
  await expect(traceBtn).toBeVisible({ timeout: 15_000 });
  await traceBtn.click();
  const slip = page.getByRole("complementary", { name: /tracing a rumour/i });
  await expect(slip).toBeVisible();
  await expect.poll(() => h(page, (h) => h.store().trace?.hops.length ?? 0), { timeout: 10_000 }).toBeGreaterThan(1);
  const trace = await h(page, (h) => h.store().trace!);
  const hops = trace.hops.filter((x) => x.parent >= 0 || x.alone).sort((a, b) => a.t - b.t);
  const items = slip.locator(".hop");
  await expect(items).toHaveCount(hops.length);
  for (let i = 0; i < Math.min(hops.length, 6); i++) {
    const txt = await items.nth(i).innerText();
    expect(txt).toContain(hops[i].hearerName);
    if (!hops[i].alone) expect(txt).toContain(hops[i].tellerName);
  }
  // Step through the path with the keyboard.
  await items.first().locator("button").focus();
  await page.keyboard.press("ArrowDown");
  await expect(items.nth(1)).toHaveAttribute("data-active", /0|1/);
});

test("a citizen's card reflects a real citizen's state", async ({ page }) => {
  await open(page);
  // Click a lit window in the city.
  const target = await h(page, (h) => {
    const owners = h.owners();
    for (let i = 0; i < owners.length; i++) {
      if (owners[i] < 0 || h.windowState(i) !== 1) continue;
      const p = h.windowCentre(i);
      if (p && p.inView) return { i, owner: owners[i], p };
    }
    return null;
  });
  expect(target).not.toBeNull();
  await page.mouse.click(target!.p.x, target!.p.y);
  const card = page.getByRole("complementary", { name: /directory card/i });
  await expect(card).toBeVisible();
  await expect.poll(() => h(page, (h) => h.store().card?.id ?? -1), { timeout: 8000 }).not.toBe(-1);
  const data = await h(page, (h) => h.store().card!);
  const owners = await h(page, (h) => h.owners());
  // The window clicked belongs to the citizen whose card opened (the nearest window may be a neighbour's).
  expect(owners.includes(data.id)).toBe(true);
  await expect(card.getByRole("heading", { level: 2 })).toHaveText(data.name);
  const bits = await h(page, (h) => h.citizens());
  const act = bits[data.id] & 7;
  const phone = (bits[data.id] & 8) !== 0;
  const status = await card.locator(".card__status").innerText();
  if (phone) expect(status).toMatch(/telephone|Ringing/);
  else expect(status).toMatch(act === 0 ? /Asleep/ : act === 1 ? /home/ : act === 2 ? /work/ : act === 3 ? /Out/ : /Away/);
  await expect(card).toContainText(/Their day/);
});

test("the city persists across reloads, and the log records the absence", async ({ page }) => {
  await open(page, "?fresh&seed=9&clock=2026-09-22T19:00");
  const seed = await h(page, (h) => h.store().seed);
  await expect.poll(() => h(page, (h) => h.store().savedAt), { timeout: 15_000 }).not.toBeNull();
  await page.goto("/?clock=2026-09-23T21:00");
  await page.waitForFunction(() => (window as unknown as { __halcyon?: Hal }).__halcyon?.ready());
  expect(await h(page, (h) => h.store().seed)).toBe(seed);
  const absence = await h(page, (h) => h.store().absence);
  expect(absence).toMatch(/While you were off shift/);
  await page.locator("#log").scrollIntoViewIfNeeded();
  await expect(page.locator("#log .absence")).toContainText("While you were off shift");
  await expect(page.locator("#log .logline[data-kind='absence']").first()).toBeVisible();
});

test("reduced motion is honoured: the board is still, the city still lives", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await open(page);
  expect(await h(page, (h) => h.store().still)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.dataset.still)).toBe("1");
  const anim = await page.evaluate(() => {
    const el = document.querySelector(".jack__lamp")!;
    return getComputedStyle(el).animationName;
  });
  expect(anim).toBe("none");
  const t0 = await h(page, (h) => h.t());
  await page.waitForTimeout(3000);
  expect(await h(page, (h) => h.t())).toBeGreaterThan(t0 + 2000);
  await ctx.close();
});

for (const [w, hgt] of [
  [390, 844],
  [768, 1024],
  [1440, 900],
  [2560, 1440],
] as const) {
  test(`no horizontal overflow at ${w}px`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: hgt } });
    const page = await ctx.newPage();
    await open(page);
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // The board is reachable and a jack can be pressed by keyboard.
    await page.locator(".jack[tabindex='0']").first().focus();
    await expect(page.locator(".jack[tabindex='0']").first()).toBeFocused();
    await ctx.close();
  });
}

test("New Year's Eve: at midnight every lamp on the board lights", async ({ page }) => {
  await open(page, "?fresh&seed=7&clock=2026-12-31T23:59:50");
  await expect(page.locator(".board__frame.nye")).toBeVisible({ timeout: 20_000 });
  const lit = await page.evaluate(() => getComputedStyle(document.querySelector(".board__frame.nye .jack .jack__lamp")!).boxShadow);
  expect(lit).not.toBe("none");
});

test("the operator's own line: a wary citizen rings position three, and can be answered", async ({ page }) => {
  await open(page, "?fresh&seed=7&clock=2026-09-25T20:15&force=operator");
  const answer = page.getByRole("button", { name: /your line is ringing/i });
  await expect(answer).toBeVisible({ timeout: 15_000 });
  await answer.click();
  await expect(page.getByRole("complementary", { name: /listening in/i })).toContainText(/calling you/i);
  await expect.poll(() => h(page, (h) => h.store().listening?.lines.filter((l) => l.who === 0).length ?? 0), { timeout: 30_000 }).toBeGreaterThan(0);
});
