import {readFile} from "node:fs/promises";
import {webcrypto} from "node:crypto";
import path from "node:path";
import vm from "node:vm";

function mockRequestClass(scope) {
  return class MockRequest {
    constructor(input, init = {}) {
      this.url = new URL(typeof input === "string" ? input : input.url, scope).href;
      this.method = init.method || input?.method || "GET";
      this.mode = init.mode || input?.mode || "same-origin";
    }
  };
}

class MockResponse {
  constructor(bytes, url, mime, status = 200, { redirected = false } = {}) {
    this.bytes = Buffer.from(bytes);
    this.url = url;
    this.status = status;
    this.ok = status >= 200 && status < 300;
    this.redirected = redirected;
    this.headers = new Headers({ "Content-Type": mime });
  }
  clone() {
    return new MockResponse(
      this.bytes,
      this.url,
      this.headers.get("Content-Type"),
      this.status,
      { redirected: this.redirected },
    );
  }
  async arrayBuffer() {
    return Uint8Array.from(this.bytes).buffer;
  }
}

function cacheKey(scope, input, ignoreSearch = false) {
  const url = new URL(typeof input === "string" ? input : input.url, scope);
  if (ignoreSearch) url.search = "";
  return url.href;
}

function cacheFor(fixture, name) {
  const { cacheStores, cacheKey, MockRequest, state } = fixture;
  if (!cacheStores.has(name)) cacheStores.set(name, new Map());
  const store = cacheStores.get(name);
  return {
    async put(input, response) {
      const key = cacheKey(input);
      if (
        state.cachePutFailure
        && state.cachePutFailure.cacheName === name
        && (state.cachePutFailure.url === null || state.cachePutFailure.url === key)
      ) {
        state.cachePutFailure = null;
        throw new Error(`injected-cache-put-failure:${name}:${key}`);
      }
      store.set(key, response.clone());
    },
    async match(input, options = {}) {
      const response = store.get(cacheKey(input, Boolean(options.ignoreSearch)));
      return response ? response.clone() : undefined;
    },
    async delete(input) {
      return store.delete(cacheKey(input));
    },
    async keys() {
      return [...store.keys()].map((url) => new MockRequest(url));
    },
  };
}

function networkResponse(fixture, bytes, url, relative, override) {
  return new MockResponse(
    bytes,
    override?.url || url.href,
    override?.mime || fixture.mimeByPath.get(relative),
    override?.status || 200,
    { redirected: Boolean(override?.redirected) },
  );
}

async function networkFetch(fixture, input) {
  if (!fixture.state.networkEnabled) throw new Error("offline");
  const url = new URL(typeof input === "string" ? input : input.url, fixture.scope);
  const relative = `./${url.pathname.slice(1)}`;
  fixture.networkRequestCounts.set(relative, (fixture.networkRequestCounts.get(relative) || 0) + 1);
  if (!fixture.mimeByPath.has(relative)) return new MockResponse("not found", url.href, "text/plain", 404);
  const override = fixture.networkOverrides.get(relative);
  const bytes = override?.bytes ?? (relative === "./release-shell-v1.json"
    ? Buffer.from(fixture.releaseManifestText, "utf8")
    : await readFile(path.join(fixture.root, relative.slice(2))));
  return networkResponse(fixture, bytes, url, relative, override);
}

function workerSelf(fixture) {
  const {scope,handlers,retainedClients,matchAllOptions,state} = fixture;
  return {
    registration: {
      scope,
      active: null,
      waiting: null,
    },
    location: new URL("https://example.test/sw.js"),
    clients: {
      async claim() {
        state.claimCalls += 1;
        if (state.claimShouldFail) throw new Error("injected-clients-claim-failure");
      },
      async matchAll(options) {
        matchAllOptions.push(structuredClone(options));
        return [...retainedClients];
      },
    },
    addEventListener(type, listener) {
      handlers.set(type, listener);
    },
    async skipWaiting() {
      state.skipWaitingCalls += 1;
    },
  };
}

function startWorker(fixture) {
  const {self,cacheStores,MockRequest,workerText} = fixture;
  const cacheFor = (name) => fixture.cacheFor(name);
  const networkFetch = (input) => fixture.networkFetch(input);
  const context = vm.createContext({
    self,
    caches: {
      async open(name) {
        return cacheFor(name);
      },
      async keys() {
        return [...cacheStores.keys()];
      },
      async delete(name) {
        return cacheStores.delete(name);
      },
    },
    crypto: webcrypto,
    fetch: networkFetch,
    Request: MockRequest,
    Response,
    Headers,
    URL,
    TextDecoder,
    Date,
    Buffer,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(workerText, context, { filename: "sw.js" });
  return context;
}

export function serviceWorkerFixture(options) {
  const fixture = {
    ...options,
    state: {networkEnabled:true,cachePutFailure:null,skipWaitingCalls:0,claimCalls:0,claimShouldFail:false},
    handlers:new Map(),cacheStores:new Map(),networkRequestCounts:new Map(),networkOverrides:new Map(),
    retainedClients:[],retainedClientNavigations:[],retainedClientChallenges:[],matchAllOptions:[],
    MockRequest:mockRequestClass(options.scope),MockResponse,
    mimeByPath:new Map(options.releaseManifest.entries.map((entry)=>[entry.path,entry.mime])),
  };
  fixture.mimeByPath.set("./release-shell-v1.json", "application/json");
  fixture.cacheKey = (input,ignoreSearch=false) => cacheKey(fixture.scope,input,ignoreSearch);
  fixture.cacheFor = (name) => cacheFor(fixture,name);
  fixture.networkFetch = (input) => networkFetch(fixture,input);
  fixture.stagingNames = () => [...fixture.cacheStores.keys()].filter((name)=>name.startsWith(`${fixture.beta8Name}-`) && name.endsWith("-staging"));
  fixture.self = workerSelf(fixture);
  fixture.context = startWorker(fixture);
  return fixture;
}
