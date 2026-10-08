import { afterEach, describe, expect, it, vi } from "vitest";
import { serviceWorkerSource } from "../service-worker-source";

const ORIGIN = "https://jeera.test";
type Listener = (event: unknown) => void;

class SWRequest extends Request {
  constructor(input: string | Request, init?: RequestInit) {
    super(typeof input === "string" ? new URL(input, ORIGIN).href : input, init);
  }
}

const keyOf = (req: string | { url: string }) => new URL(typeof req === "string" ? req : req.url, ORIGIN).href;

/** Exécute le vrai `sw.js` dans un faux environnement de service worker. */
function loadWorker(fetchImpl: (input: string | { url: string }) => Promise<Response>, buildId = "b2") {
  const listeners: Record<string, Listener> = {};
  const store = new Map<string, Map<string, Response>>();
  const caches = {
    open: async (name: string) => {
      if (!store.has(name)) store.set(name, new Map());
      const entries = store.get(name)!;
      return {
        match: async (req: string | { url: string }) => entries.get(keyOf(req))?.clone(),
        put: async (req: string | { url: string }, res: Response) => void entries.set(keyOf(req), res),
        keys: async () => [...entries.keys()].map((url) => new Request(url)),
        delete: async (req: string | { url: string }) => entries.delete(keyOf(req)),
      };
    },
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
  };
  const self = {
    location: new URL(ORIGIN),
    addEventListener: (type: string, fn: Listener) => void (listeners[type] = fn),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
    registration: {},
  };
  const fetchSpy = vi.fn(fetchImpl);
  new Function("self", "caches", "fetch", "Request", source(buildId))(self, caches, fetchSpy, SWRequest);
  return { listeners, store, fetchSpy };
}
const source = (buildId: string) => serviceWorkerSource(buildId);

const html = (route: string) =>
  new Response(`<html><body data-route="${route}"><script src="/_next/static/chunks/${route.replace(/\W/g, "") || "home"}.js"></script></body></html>`, {
    headers: { "Content-Type": "text/html" },
  });

const onlineFetch = async (input: string | { url: string }) => {
  const url = new URL(keyOf(input));
  if (url.pathname.startsWith("/_next/static/")) return new Response("js");
  return html(url.pathname);
};

async function install(worker: ReturnType<typeof loadWorker>) {
  let done: Promise<unknown> = Promise.resolve();
  worker.listeners.install({ waitUntil: (p: Promise<unknown>) => void (done = p) });
  await done;
  worker.listeners.activate({ waitUntil: (p: Promise<unknown>) => void (done = p) });
  await done;
}

function navigate(worker: ReturnType<typeof loadWorker>, path: string) {
  let response: Promise<Response> | null = null;
  worker.listeners.fetch({
    request: { url: ORIGIN + path, method: "GET", mode: "navigate", destination: "document" },
    respondWith: (p: Promise<Response>) => void (response = p),
    waitUntil: () => undefined,
  });
  return response as Promise<Response> | null;
}

afterEach(() => vi.useRealTimers());

describe("service worker : une navigation n'échoue jamais", () => {
  it("installe la coquille des quatre onglets et leurs fichiers, purge les caches d'avant", async () => {
    const worker = loadWorker(onlineFetch);
    worker.store.set("jeera-shell-b1", new Map());
    worker.store.set("jeera-cache-1791", new Map());
    await install(worker);
    const shell = worker.store.get("jeera-shell-b2")!;
    expect([...shell.keys()].map((url) => new URL(url).pathname).sort()).toEqual(["/", "/historique", "/progres", "/reglages"]);
    expect(worker.store.get("jeera-static-v1")!.size).toBe(4);
    expect(worker.store.has("jeera-shell-b1")).toBe(false);
    expect(worker.store.has("jeera-cache-1791")).toBe(false);
  });

  it("sert la coquille du cache sans attendre le réseau, même en ligne", async () => {
    const worker = loadWorker(onlineFetch);
    await install(worker);
    worker.fetchSpy.mockClear();
    const response = await navigate(worker, "/progres")!;
    expect(await response.text()).toContain('data-route="/progres"');
    expect(worker.fetchSpy).not.toHaveBeenCalled();
  });

  it("hors ligne, une page jamais vue donne la page de repli en français, pas une erreur Safari", async () => {
    const worker = loadWorker(onlineFetch);
    await install(worker);
    worker.fetchSpy.mockImplementation(async () => {
      throw new TypeError("Load failed");
    });
    const response = await navigate(worker, "/historique/abc")!;
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("data-offline-fallback");
  });

  it("réseau muet : repli au bout du délai au lieu d'un écran noir", async () => {
    vi.useFakeTimers();
    const worker = loadWorker(onlineFetch);
    await install(worker);
    worker.fetchSpy.mockImplementation(() => new Promise<Response>(() => undefined));
    const pending = navigate(worker, "/historique/abc")!;
    await vi.advanceTimersByTimeAsync(4_001);
    expect(await (await pending).text()).toContain("data-offline-fallback");
  });

  it("sans réseau à l'installation, le nouveau worker échoue et l'ancien reste en place", async () => {
    const worker = loadWorker(async () => {
      throw new TypeError("Load failed");
    });
    let done: Promise<unknown> = Promise.resolve();
    worker.listeners.install({ waitUntil: (p: Promise<unknown>) => void (done = p) });
    await expect(done).rejects.toThrow();
  });

  it("ne touche jamais aux données ni aux payloads RSC", () => {
    const worker = loadWorker(onlineFetch);
    const respondWith = vi.fn();
    worker.listeners.fetch({ request: { url: ORIGIN + "/api/data", method: "GET", mode: "cors", destination: "" }, respondWith, waitUntil: () => undefined });
    worker.listeners.fetch({ request: { url: ORIGIN + "/progres?_rsc=1", method: "GET", mode: "cors", destination: "" }, respondWith, waitUntil: () => undefined });
    worker.listeners.fetch({ request: { url: ORIGIN + "/", method: "POST", mode: "cors", destination: "" }, respondWith, waitUntil: () => undefined });
    expect(respondWith).not.toHaveBeenCalled();
  });
});
