import { activate, activateNamedButton, expect, openFirstQuestion, openFreshHome } from "./fixtures.mjs";
import { readFile } from "node:fs/promises";

function observeBackupEnvironment(mode) {
  const probe = { canShareCalls: 0, shareCalls: 0, files: [], created: [], revoked: [], clicks: [], timers: [] };
  window.__mqBackupProbe = probe;
  Object.defineProperty(navigator, "canShare", { configurable: true, value: ({ files }) => {
    probe.canShareCalls += 1;
    return files.length === 1 && files[0] instanceof File;
  } });
  Object.defineProperty(navigator, "share", { configurable: true, value: async ({ files }) => {
    probe.shareCalls += 1;
    probe.files = await Promise.all(files.map(async (file) => ({ name: file.name, type: file.type, bytes: await file.text() })));
    if (mode === "cancel") throw new DOMException("Synthetic share cancellation", "AbortError");
    if (mode === "reject") throw new DOMException("Synthetic destination failure", "NotAllowedError");
  } });
  const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    const url = create(blob);
    probe.created.push(url);
    return url;
  };
  URL.revokeObjectURL = (url) => { probe.revoked.push(url); return revoke(url); };
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    probe.clicks.push({ href: this.href, download: this.download, rel: this.rel });
    return click.call(this);
  };
  const schedule = window.setTimeout.bind(window);
  window.setTimeout = (callback, delay, ...argumentsList) => {
    probe.timers.push(delay);
    return schedule(callback, delay, ...argumentsList);
  };
}

async function savedProgress(page) {
  return page.evaluate(() => localStorage.getItem("math-quest:progress:v2"));
}

async function expectExportPayload(page, before) {
  const probe = await page.evaluate(() => window.__mqBackupProbe);
  expect(probe.canShareCalls).toBe(1);
  expect(probe.shareCalls).toBe(1);
  expect(probe.files).toEqual([{ name: "math-quest-backup.json", type: "application/json", bytes: before }]);
  expect(JSON.parse(probe.files[0].bytes).schemaVersion).toBe(3);
  expect(await savedProgress(page)).toBe(before);
  return probe;
}

async function expectPendingDownload(page, download, before) {
  const probe = await expectExportPayload(page, before);
  expect({
    filename: download.suggestedFilename(), urls: probe.created, revoked: probe.revoked,
    clicks: probe.clicks, cleanupTimers: probe.timers.filter((delay) => delay === 60_000),
  }).toEqual({
    filename: "math-quest-backup.json", urls: [probe.created[0]], revoked: [],
    clicks: [{ href: probe.created[0], download: "math-quest-backup.json", rel: "noopener" }], cleanupTimers: [60_000],
  });
  return probe.created;
}

async function downloadResources(page) {
  return page.evaluate(() => ({
    anchors: document.querySelectorAll('a[download="math-quest-backup.json"]').length,
    revoked: window.__mqBackupProbe.revoked,
  }));
}

async function expectDownloadCleanup(page, download, before) {
  const created = await expectPendingDownload(page, download, before);
  const downloadedBytes = await readFile(await download.path(), "utf8");
  expect(downloadedBytes).toBe(before);
  expect(await downloadResources(page)).toEqual({ anchors: 1, revoked: [] });
  await page.clock.fastForward(59_999);
  expect(await downloadResources(page)).toEqual({ anchors: 1, revoked: [] });
  await page.clock.fastForward(1);
  expect(await downloadResources(page)).toEqual({ anchors: 0, revoked: created });
  expect(await savedProgress(page)).toBe(before);
}

async function openPrivateBackup(page) {
  await openFreshHome(page);
  await activateNamedButton(page, "Grown-ups corner");
  await activateNamedButton(page, "Backup and restore");
  const before = await savedProgress(page);
  expect(before).not.toBeNull();
  const button = page.locator('button[data-action="export"]');
  await expect(button).toBeVisible();
  return { before, button };
}

async function activatePrivateBackup(page, button, mode) {
  if (mode === "reject") await page.clock.pauseAt(Date.now() + 1_000);
  const download = mode === "reject" ? page.waitForEvent("download") : null;
  await activate(button, page);
  const messages = {
    success: "Backup shared to the destination you chose.",
    cancel: "Export cancelled. No file was shared or downloaded.",
    reject: "Backup download started. Keep the file private.",
  };
  await expect(page.locator("[data-backup-status]")).toHaveText(messages[mode]);
  await expect(button).toBeEnabled();
  return download;
}

function expectNoDownload(probe, downloads) {
  expect({
    created: probe.created, revoked: probe.revoked, clicks: probe.clicks,
    cleanupTimers: probe.timers.filter((delay) => delay === 60_000), downloads,
  }).toEqual({ created: [], revoked: [], clicks: [], cleanupTimers: [], downloads: [] });
}

export async function exercisePrivateBackupExport(page, mode) {
  await page.clock.install();
  await page.addInitScript(observeBackupEnvironment, mode);
  const downloads = [];
  page.on("download", (download) => downloads.push(download));
  const { before, button } = await openPrivateBackup(page);
  try {
    const download = await activatePrivateBackup(page, button, mode);
    if (download) {
      await expectDownloadCleanup(page, download, before);
      expect(downloads).toHaveLength(1);
      return;
    }
    const probe = await expectExportPayload(page, before);
    expectNoDownload(probe, downloads);
  } finally { await page.clock.resume(); }
}

function denyProgressProtection(mode) {
  const probe = { lockRequests: 0, writes: [], readFailures: 0 };
  window.__mqProgressProbe = probe;
  const write = Storage.prototype.setItem, read = Storage.prototype.getItem;
  Storage.prototype.setItem = function (key, value) {
    if (this === localStorage) probe.writes.push({ key, value });
    return write.call(this, key, value);
  };
  Storage.prototype.getItem = function (key) {
    if (mode === "unreadable" && this === localStorage && key === "math-quest:progress:v2") {
      probe.readFailures += 1;
      throw new DOMException("Synthetic unreadable progress", "SecurityError");
    }
    return read.call(this, key);
  };
  if (mode === "missing") {
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    return;
  }
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request() {
    probe.lockRequests += 1;
    throw new DOMException("Synthetic writer lease failure", "InvalidStateError");
  } } });
}

async function expectProtectionScreen(tab, mode) {
  await tab.addInitScript(denyProgressProtection, mode);
  await tab.goto("/index.html", { waitUntil: "domcontentloaded" });
  await expect(tab.locator("[data-progress-protection]")).toBeVisible();
  await expect(tab.getByRole("heading", { name: "This browser cannot protect progress", exact: true })).toBeVisible();
  await expect(tab.locator('[data-action="start"]')).toHaveCount(0);
  await expect(tab.getByRole("button", { name: "Continue without a name", exact: true })).toHaveCount(0);
  const probe = await tab.evaluate(() => window.__mqProgressProbe);
  expect({ writes: probe.writes, lockRequests: probe.lockRequests, readFailed: probe.readFailures > 0 })
    .toEqual({ writes: [], lockRequests: mode === "broken" ? 1 : 0, readFailed: mode === "unreadable" });
}

export async function exerciseProgressProtection(page, mathQuestGuard) {
  for (const mode of ["missing", "broken", "unreadable"]) {
    const tab = await page.context().newPage();
    mathQuestGuard.observePage(tab);
    try {
      await expectProtectionScreen(tab, mode);
    } finally { await tab.close(); }
  }
  await openFreshHome(page);
  await expect(page.getByRole("button", { name: /Start/u })).toBeEnabled();
}

async function expectRejectedQaQueries(page) {
  for (const query of ["?qa-tour=QA-TOUR-V1", "?qa-tour=qa-tour-v2", "?other=qa-tour-v1"]) {
    await page.goto(`/index.html${query}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Continue without a name", exact: true })).toBeVisible();
    await expect(page.locator("[data-lab-action=qa-start]")).toHaveCount(0);
    await expect(page.locator(".lab-workspace, .qa-question, section.question")).toHaveCount(0);
  }
}

async function prepareSavedQaSession(page) {
  await openFirstQuestion(page);
  await activate(page.locator('button[data-action="home"]'), page);
  await expect(page.locator('button[data-action="start"]')).toBeVisible();
  const before = await savedProgress(page);
  expect(JSON.parse(before).activeSession).not.toBeNull();
  return before;
}

async function expectPrivateQaConfirmation(page, before) {
  await page.goto("/index.html?qa-tour=qa-tour-v1", { waitUntil: "domcontentloaded" });
  const confirmation = page.locator(".qa-confirm");
  await expect(confirmation).toBeVisible();
  await expectPrivateQaExplanation(confirmation);
  await expect(page.locator(".lab-workspace, .qa-question, section.question")).toHaveCount(0);
  await expect(page.locator("[data-lab-action=qa-start]")).toBeFocused();
  await expect(page.locator("[data-lab-action=qa-cancel]")).toBeVisible();
  expect(await savedProgress(page)).toBe(before);
  return confirmation;
}

async function expectPrivateQaExplanation(confirmation) {
  await expect(confirmation.getByRole("heading", { name: "Private QA Test Tour", exact: true })).toBeVisible();
  await expect(confirmation).toContainText("50 test questions");
  await expect(confirmation).toContainText("never changes a child's progress");
  await expect(confirmation).toContainText("sends nothing over the network");
}

async function cancelPrivateQa(page, before, confirmation) {
  await activate(page.locator("[data-lab-action=qa-cancel]"), page);
  await expect(page.locator('button[data-action="start"]')).toBeVisible();
  await expect(confirmation).toHaveCount(0);
  expect(new URL(page.url()).search).toBe("");
  expect(await savedProgress(page)).toBe(before);
}

async function startPrivateQa(page, before, confirmation) {
  await page.goto("/index.html?qa-tour=qa-tour-v1", { waitUntil: "domcontentloaded" });
  await expect(confirmation).toBeVisible();
  await activate(page.locator("[data-lab-action=qa-start]"), page);
  await expect(page.locator('.qa-question[data-qa-tour="qa-tour-v1"]')).toBeVisible();
  await expect(confirmation).toHaveCount(0);
  expect(await savedProgress(page)).toBe(before);
}

async function expectBackgroundQaRequestRejected(page, mathQuestGuard) {
  expect(mathQuestGuard.unexpectedRequests).toEqual([]);
  const url = "http://127.0.0.1:8771/index.html?qa-tour=qa-tour-v1";
  const body = await readFile(new URL("../../assets/icons/icon-192.png", import.meta.url));
  // Supply a valid existing image only for the deliberately introduced request.
  // The real QA navigations remain served by the application after cleanup.
  const respond = (route) => route.request().resourceType() === "image"
    ? route.fulfill({ status: 200, contentType: "image/png", body }) : route.continue();
  await page.route(url, respond);
  try {
    await page.evaluate((source) => new Promise((resolve) => {
      const probe = new Image();
      probe.onload = probe.onerror = () => resolve();
      probe.src = source;
    }), url);
    expect(mathQuestGuard.unexpectedRequests, "NC-QA-BACKGROUND-QUERY-REQUEST-REJECTED")
      .toEqual([`GET ${url}`]);
    mathQuestGuard.unexpectedRequests.pop();
  } finally { await page.unroute(url, respond); }
}

export async function exercisePrivateQaEntry(page, mathQuestGuard) {
  await expectRejectedQaQueries(page);
  await expectBackgroundQaRequestRejected(page, mathQuestGuard);
  const before = await prepareSavedQaSession(page);
  const confirmation = await expectPrivateQaConfirmation(page, before);
  await cancelPrivateQa(page, before, confirmation);
  await startPrivateQa(page, before, confirmation);
}

async function savedPlacementDraft(page) {
  return page.evaluate(() => localStorage.getItem("math-quest:placement-draft:v1"));
}

async function openPlacementQuestion(page) {
  await openFreshHome(page);
  await activateNamedButton(page, "Grown-ups corner");
  await activateNamedButton(page, "Starting point");
  await activateNamedButton(page, "Start the check");
  const question = page.locator("[data-placement-screen]");
  await expect(question).toBeVisible();
  return question.getAttribute("data-question-id");
}

async function prepareRealPlacementDraft(page) {
  const questionId = await openPlacementQuestion(page);
  await activate(page.locator('button[data-action="placement-pause"]'), page);
  await activateNamedButton(page, "Home");
  await expect(page.locator('button[data-action="start"]')).toBeVisible();
  const progress = await savedProgress(page), draft = await savedPlacementDraft(page);
  expect(JSON.parse(progress).activeSession).toBeNull();
  expect(draft).not.toBeNull();
  return { progress, draft, questionId };
}

export async function exerciseQaPlacementDraftEntry(page) {
  const before = await prepareRealPlacementDraft(page);
  const confirmation = await expectPrivateQaConfirmation(page, before.progress);
  await expect(page.locator("[data-placement-screen]")).toHaveCount(0);
  expect(await savedPlacementDraft(page)).toBe(before.draft);
  await cancelPrivateQa(page, before.progress, confirmation);
  expect(await savedPlacementDraft(page)).toBe(before.draft);
  await expectOrdinaryPlacementResume(page, before);
}

async function expectOrdinaryPlacementResume(page, before) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-placement-screen]")).toBeVisible();
  await expect(page.locator("[data-placement-screen]")).toHaveAttribute("data-question-id", before.questionId);
  expect(await savedProgress(page)).toBe(before.progress);
}

async function corruptSavedProgress(page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("math-quest:e2e:corrupt-progress")) return;
    localStorage.setItem("math-quest:progress:v2", "{");
    sessionStorage.setItem("math-quest:e2e:corrupt-progress", "seeded");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-save-recovery]")).toBeVisible();
  await expect(page.locator('[data-action="start"]')).toHaveCount(0);
  const input = page.locator("#importFile");
  await expect(input).toHaveAccessibleName("Import a backup");
  expect(await savedProgress(page)).toBe("{");
  return input;
}

async function importAndVerifyRecovery(page, input, backup) {
  await input.setInputFiles({ name: "math-quest-backup.json", mimeType: "application/json", buffer: Buffer.from(backup, "utf8") });
  await expect(page.locator('[data-action="start"]')).toBeVisible();
  const restored = JSON.parse(await savedProgress(page)), original = JSON.parse(backup);
  expect(restored.placementDraftGeneration).toBe(original.placementDraftGeneration + 1);
  expect({ ...restored, placementDraftGeneration: original.placementDraftGeneration }).toEqual(original);
  return restored;
}

export async function exerciseSavedProgressRecovery(page) {
  await openFreshHome(page);
  const backup = await savedProgress(page);
  const input = await corruptSavedProgress(page);
  const restored = await importAndVerifyRecovery(page, input, backup);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-action="start"]')).toBeVisible();
  expect(JSON.parse(await savedProgress(page))).toEqual(restored);
}
