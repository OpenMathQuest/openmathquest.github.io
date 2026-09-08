import assert from "node:assert/strict";
import vm from "node:vm";

class LocalFile extends Blob {
  constructor(parts, name, options = {}) {
    super(parts, options);
    this.name = String(name);
    this.lastModified = Number(options.lastModified) || 0;
  }
}

function qaDownloadDocument(effects, anchors) {
  return {
    body: {
      appendChild(anchor) {
        anchor.isConnected = true;
        effects.appended.push(anchor);
      },
    },
    createElement(name) {
      if (name !== "a") throw new Error(`unexpected element: ${name}`);
      const anchor = {
        download: "",
        hidden: false,
        href: "",
        isConnected: false,
        rel: "",
        click() { effects.clicks += 1; },
        remove() { this.isConnected = false; },
      };
      anchors.push(anchor);
      return anchor;
    },
  };
}

function qaReportNavigator(effects, { share, shareThrows }) {
  return {
    maxTouchPoints: 5,
    userAgent: "Mozilla/5.0 RAW-UA-SECRET Chrome/120.0.0.0 Safari/537.36",
    sendBeacon() { effects.network += 1; throw new Error("network forbidden"); },
    ...(share ? {
      canShare(payload) { return Array.isArray(payload?.files) && payload.files.length === 1; },
      async share(payload) {
        effects.shared.push(payload);
        if (shareThrows) throw shareThrows;
      },
    } : {}),
  };
}

export function qaReportContext(effects, anchors, options) {
  const { engine } = options;
  const document = qaDownloadDocument(effects, anchors);
  const navigator = qaReportNavigator(effects, options);
  return {
    Blob,
    Date,
    E: engine,
    File: LocalFile,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    Set,
    String,
    URL: {
      createObjectURL(blob) {
        effects.createdBlobs.push(blob);
        return `blob:qa-local-${effects.createdBlobs.length}`;
      },
      revokeObjectURL(url) { effects.revoked.push(url); },
    },
    document,
    effects,
    fetch() { effects.network += 1; throw new Error("network forbidden"); },
    innerHeight: 844,
    innerWidth: 390,
    location: { origin: "https://ORIGIN-SECRET.invalid", href: "https://ORIGIN-SECRET.invalid/?qa-tour=qa-tour-v1" },
    navigator,
    screen: { width: 390, height: 844 },
    setTimeout(callback) { effects.cleanup.push(callback); return effects.cleanup.length; },
    state: { childProgress: "PROGRESS-SECRET" },
    structuredClone,
    window: { devicePixelRatio: 3 },
  };
}

function qaSnapshotDocument(effects, contextAvailable) {
  const context = contextAvailable ? {
    drawImage() { effects.draws += 1; },
  } : null;
  return {
    styleSheets: [{ cssRules: [{ cssText: ".qa-question{color:#123456}" }] }],
    createElement(name) {
      assert.equal(name, "canvas");
      return {
        width: 0,
        height: 0,
        getContext(kind) { assert.equal(kind, "2d"); return context; },
        toDataURL(kind) {
          effects.toDataUrlTypes.push(kind);
          return "data:image/png;base64,AA==";
        },
      };
    },
  };
}

export function qaSnapshotHarness(captureSource, { imageFailure = false, contextAvailable = true } = {}) {
  const effects = {
    blobs: [],
    draws: 0,
    imageFailure,
    imageSources: [],
    revoked: [],
    toDataUrlTypes: [],
  };
  class LocalImage {
    set src(value) {
      effects.imageSources.push(value);
      if (effects.imageFailure) this.onerror?.(new Error("image-load-failed"));
      else this.onload?.();
    }
  }
  const clone = {
    outerHTML: '<section class="qa-question">Question</section>',
    querySelectorAll() { return []; },
  };
  const source = {
    cloneNode() { return clone; },
    getBoundingClientRect() { return { width: 319.2, height: 179.1 }; },
    querySelectorAll() { return []; },
  };
  const document = qaSnapshotDocument(effects, contextAvailable);
  const harness = new vm.Script(`(()=>{"use strict";
    const app={querySelector(selector){return selector===".qa-question"?effects.source:null;}};
    ${captureSource}
    return {capture:qaCaptureSnapshot};
  })()`, { filename: "math-quest-qa-tour-local-snapshot.js" }).runInNewContext({
    Blob,
    HTMLInputElement: class {},
    HTMLSelectElement: class {},
    HTMLTextAreaElement: class {},
    Image: LocalImage,
    URL: {
      createObjectURL(blob) {
        effects.blobs.push(blob);
        return `blob:qa-snapshot-${effects.blobs.length}`;
      },
      revokeObjectURL(url) { effects.revoked.push(url); },
    },
    app: undefined,
    assert,
    document,
    effects: { ...effects, source },
  });
  return { effects, harness };
}
