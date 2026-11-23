// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

// Ejecuta public/sw.js tal cual con una caché y una red simuladas.
const SOURCE = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
const ORIGIN = "https://app.test";

type Handler = (event: unknown) => void;

function makeCache() {
  const store = new Map<string, Response>();
  const norm = (k: string | { url: string }) => (typeof k === "string" ? k : k.url);
  const noSearch = (u: string) => u.split("?")[0];
  return {
    store,
    async match(k: string | { url: string }, opts?: { ignoreSearch?: boolean }) {
      const key = norm(k);
      const hit = opts?.ignoreSearch
        ? [...store.keys()].find((x) => noSearch(x) === noSearch(key))
        : store.has(key)
          ? key
          : undefined;
      return hit ? store.get(hit)!.clone() : undefined;
    },
    async put(k: string | { url: string }, r: Response) {
      store.delete(norm(k)); // reinsertar = más reciente
      store.set(norm(k), r);
    },
    async addAll(urls: string[]) {
      for (const u of urls) store.set(u, new Response(u));
    },
    async keys() {
      return [...store.keys()].map((url) => ({ url }));
    },
    async delete(k: string | { url: string }) {
      return store.delete(norm(k));
    },
  };
}

function makeEnv() {
  const caches = new Map<string, ReturnType<typeof makeCache>>();
  const handlers: Record<string, Handler> = {};
  const net = { online: true, calls: [] as string[], respond: (_url: string): Response => new Response("") };
  const cacheApi = {
    async open(name: string) {
      if (!caches.has(name)) caches.set(name, makeCache());
      return caches.get(name)!;
    },
    async keys() {
      return [...caches.keys()];
    },
    async delete(name: string) {
      return caches.delete(name);
    },
    async match(k: string) {
      for (const c of caches.values()) {
        const hit = await c.match(k);
        if (hit) return hit;
      }
      return undefined;
    },
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Handler) => (handlers[type] = fn),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve(), matchAll: async () => [], openWindow: async () => null },
    registration: { showNotification: async () => undefined },
  };
  const fetchMock = async (req: { url: string } | string) => {
    const url = typeof req === "string" ? req : req.url;
    net.calls.push(url);
    if (!net.online) throw new TypeError("Failed to fetch");
    return net.respond(url);
  };
  vm.runInNewContext(SOURCE, {
    self,
    caches: cacheApi,
    fetch: fetchMock,
    Response,
    Headers,
    URL,
    Date,
    Promise,
    JSON,
    Number,
    String,
    Math,
    Array,
  });

  async function dispatch(request: { method?: string; url: string; mode?: string }) {
    const waits: Promise<unknown>[] = [];
    // Objeto en vez de variable suelta: TypeScript no sigue asignaciones hechas dentro de callbacks.
    const out: { promise?: Promise<Response> } = {};
    handlers.fetch({
      request: { method: "GET", mode: "cors", ...request },
      respondWith: (p: Promise<Response>) => (out.promise = p),
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    const response = out.promise ? await out.promise : null;
    await Promise.all(waits);
    return response;
  }
  const nav = (path: string) => dispatch({ url: ORIGIN + path, mode: "navigate" });
  const lifecycle = (type: "install" | "activate") =>
    new Promise((resolve) => handlers[type]({ waitUntil: (p: Promise<unknown>) => p.then(resolve) }));
  return {
    caches,
    cacheApi,
    net,
    dispatch,
    nav,
    install: () => lifecycle("install"),
    activate: () => lifecycle("activate"),
  };
}

const html = (body = "<html>datos</html>", status = 200) => {
  const r = new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
  Object.defineProperty(r, "type", { value: "basic" });
  return r;
};

describe("service worker: modo sin conexión", () => {
  let env: ReturnType<typeof makeEnv>;
  beforeEach(() => {
    env = makeEnv();
    env.net.respond = () => html();
  });

  it("con red: devuelve la página, la guarda y marca que no es copia", async () => {
    const res = await env.nav("/dashboard");
    expect(await res!.text()).toBe("<html>datos</html>");
    expect(env.caches.get("ourmoney-pages-v1")!.store.has(`${ORIGIN}/dashboard`)).toBe(true);
    const meta = await (await env.dispatch({ url: ORIGIN + "/__ourmoney/offline-status" }))!.json();
    expect(meta).toEqual({ fromCache: false, cachedAt: null });
  });

  it("sin red: sirve la última copia y avisa de cuándo es", async () => {
    await env.nav("/transactions");
    env.net.online = false;
    const res = await env.nav("/transactions");
    expect(await res!.text()).toBe("<html>datos</html>");
    const meta = await (await env.dispatch({ url: ORIGIN + "/__ourmoney/offline-status" }))!.json();
    expect(meta.fromCache).toBe(true);
    expect(typeof meta.cachedAt).toBe("number");
  });

  it("sin red y misma pantalla con otros parámetros: usa la guardada", async () => {
    await env.nav("/dashboard?period=a");
    env.net.online = false;
    const res = await env.nav("/dashboard?period=b");
    expect(await res!.text()).toBe("<html>datos</html>");
  });

  it("sin red y sin copia: pantalla de sin conexión", async () => {
    await env.install();
    env.net.online = false;
    const res = await env.nav("/budgets");
    expect(await res!.text()).toBe("/offline.html");
  });

  it("nunca guarda login, auth ni api", async () => {
    for (const path of ["/login", "/auth/callback", "/api/health", "/reset-password", "/forgot-password"])
      await env.nav(path);
    expect(env.caches.get("ourmoney-pages-v1")?.store.size ?? 0).toBe(0);
  });

  it("no guarda respuestas que no son una página correcta", async () => {
    env.net.respond = () => html("error", 500);
    const res = await env.nav("/dashboard");
    expect(res!.status).toBe(500);
    expect(env.caches.get("ourmoney-pages-v1")?.store.size ?? 0).toBe(0);
  });

  it("servidor caído (503) con copia: sirve la copia; sin copia: el 503", async () => {
    await env.nav("/dashboard");
    env.net.respond = () => html("caído", 503);
    expect(await (await env.nav("/dashboard"))!.text()).toBe("<html>datos</html>");
    expect((await env.nav("/otra"))!.status).toBe(503);
  });

  it("solo conserva las 40 páginas más recientes", async () => {
    for (let i = 0; i < 45; i++) await env.nav(`/p${i}`);
    const store = env.caches.get("ourmoney-pages-v1")!.store;
    expect(store.size).toBe(40);
    expect(store.has(`${ORIGIN}/p0`)).toBe(false);
    expect(store.has(`${ORIGIN}/p44`)).toBe(true);
  });

  it("los ficheros de /_next/static se guardan y la segunda vez no tocan la red", async () => {
    env.net.respond = () => {
      const r = new Response("js", { headers: { "content-type": "text/javascript" } });
      Object.defineProperty(r, "type", { value: "basic" });
      return r;
    };
    const url = ORIGIN + "/_next/static/chunks/app.abc123.js";
    await env.dispatch({ url });
    env.net.calls.length = 0;
    const res = await env.dispatch({ url });
    expect(await res!.text()).toBe("js");
    expect(env.net.calls).toEqual([]);
  });

  it("ignora lo que no es GET, lo de otros dominios y las peticiones normales", async () => {
    expect(await env.dispatch({ method: "POST", url: ORIGIN + "/api/ingest" })).toBeNull();
    expect(await env.dispatch({ url: "https://otro.test/x", mode: "navigate" })).toBeNull();
    expect(await env.dispatch({ url: ORIGIN + "/api/health" })).toBeNull();
  });

  it("al activarse borra cachés antiguas pero conserva las actuales", async () => {
    for (const name of ["ourmoney-shell-v2", "ourmoney-pages-v1", "ourmoney-static-v1", "otra"])
      await env.cacheApi.open(name);
    await env.activate();
    expect(await env.cacheApi.keys()).toEqual(["ourmoney-pages-v1", "ourmoney-static-v1"]);
  });
});
