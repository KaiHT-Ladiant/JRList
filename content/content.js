/**
 * Content script (ISOLATED world): DOM/JS URL collection.
 * Nuxt/Vue globals are harvested in MAIN world by the popup and passed in.
 */
(function () {
  "use strict";

  if (globalThis.__JRLIST_CONTENT_LOADED__) {
    return;
  }
  globalThis.__JRLIST_CONTENT_LOADED__ = true;

  const P = globalThis.UrlParser;
  if (!P) {
    console.warn("[JRList] UrlParser missing");
    return;
  }

  let lastResult = null;

  function collectDomUrls(map, baseOrigin, bases) {
    const attrs = [
      "href",
      "src",
      "action",
      "data-url",
      "data-href",
      "data-src",
      "formaction",
      "poster",
    ];
    for (const attr of attrs) {
      document.querySelectorAll("[" + attr + "]").forEach((el) => {
        const v = el.getAttribute(attr);
        if (v) P.addPath(map, v, "dom:" + attr, baseOrigin, bases);
      });
    }

    document.querySelectorAll("meta[content]").forEach((el) => {
      const content = el.getAttribute("content") || "";
      if (/https?:\/\//i.test(content) || content.startsWith("/")) {
        P.extractFromText(content, map, "dom:meta", baseOrigin, bases);
      }
    });

    document.querySelectorAll("script[src]").forEach((el) => {
      P.addPath(map, el.getAttribute("src"), "dom:script", baseOrigin, bases);
    });

    document.querySelectorAll("link[href]").forEach((el) => {
      P.addPath(map, el.getAttribute("href"), "dom:link", baseOrigin, bases);
    });

    const baseEl = document.querySelector("base[href]");
    if (baseEl) {
      P.addBase(bases, map, baseEl.getAttribute("href"), "dom:base", baseOrigin);
    }
  }

  function collectInlineScripts(map, baseOrigin, bases) {
    document.querySelectorAll("script:not([src])").forEach((el, i) => {
      const text = el.textContent || "";
      if (text.length > 0 && text.length < 2_000_000) {
        P.extractFromText(text, map, "inline-script:" + i, baseOrigin, bases);
      }
    });
  }

  async function fetchSameOriginScripts(map, baseOrigin, limit, bases) {
    const scripts = Array.from(document.querySelectorAll("script[src]"))
      .map((el) => el.getAttribute("src"))
      .filter(Boolean)
      .map((src) => {
        try {
          return new URL(src, baseOrigin).href;
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean);

    const unique = Array.from(new Set(scripts)).slice(0, limit || 40);
    let okCount = 0;
    await Promise.allSettled(
      unique.map(async (url) => {
        try {
          const sameOrigin = new URL(url).origin === new URL(baseOrigin).origin;
          if (!sameOrigin && !/(_nuxt|chunk|entry)/i.test(url)) {
            return;
          }
          const res = await fetch(url, { credentials: "omit", cache: "force-cache" });
          if (!res.ok) return;
          const text = await res.text();
          if (text.length > 5_000_000) return;
          P.extractFromText(
            text,
            map,
            "js:" + (url.split("/").pop() || "bundle"),
            baseOrigin,
            bases
          );
          okCount += 1;
        } catch (_) {}
      })
    );
    return okCount;
  }

  function collectComments(map, baseOrigin, bases) {
    const root = document.documentElement;
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
    let node;
    while ((node = walker.nextNode())) {
      P.extractFromText(node.nodeValue || "", map, "html-comment", baseOrigin, bases);
    }
  }

  function applyBridge(map, bridge, baseOrigin, bases) {
    if (!bridge) return;
    if (bridge.payloads) {
      for (const [name, data] of Object.entries(bridge.payloads)) {
        P.walkObject(data, map, "nuxt:" + name, baseOrigin, 0, new WeakSet(), bases);
        try {
          P.extractFromText(
            JSON.stringify(data),
            map,
            "nuxt-json:" + name,
            baseOrigin,
            bases
          );
        } catch (_) {}
      }
    }
    if (Array.isArray(bridge.routes)) {
      for (const route of bridge.routes) {
        P.addPath(map, route, "vue-router", baseOrigin, bases);
      }
    }
  }

  async function runScan(options) {
    const opts = Object.assign(
      {
        fetchScripts: true,
        scriptLimit: 40,
        bridge: null,
      },
      options || {}
    );

    const baseOrigin = location.origin;
    const map = new Map();
    const bases = new Set();
    const startedAt = Date.now();
    const bridge = opts.bridge || null;

    const framework = bridge?.framework || {
      nuxt: /__nuxt|__NUXT__|data-nuxt/i.test(
        (document.documentElement?.innerHTML || "").slice(0, 12000)
      ),
      vue: /data-v-|__nuxt|nuxt/i.test(
        (document.documentElement?.innerHTML || "").slice(0, 12000)
      ),
    };

    // Nuxt app.baseURL / cdnURL 명시 추출
    try {
      const cfg =
        bridge?.payloads?.__NUXT__?.config ||
        bridge?.payloads?.nuxtConfig ||
        null;
      const appBase = cfg?.app?.baseURL || cfg?.app?.cdnURL;
      if (appBase) P.addBase(bases, map, appBase, "nuxt:app.baseURL", baseOrigin);
      const runtimeBase =
        cfg?.public?.apiBase ||
        cfg?.public?.apiBaseUrl ||
        cfg?.public?.baseURL;
      if (runtimeBase) {
        P.addBase(bases, map, runtimeBase, "nuxt:runtimeConfig", baseOrigin);
      }
    } catch (_) {}

    applyBridge(map, bridge, baseOrigin, bases);
    collectDomUrls(map, baseOrigin, bases);
    collectInlineScripts(map, baseOrigin, bases);
    collectComments(map, baseOrigin, bases);

    try {
      const html = (document.documentElement?.innerHTML || "").slice(0, 500_000);
      P.extractFromText(html, map, "html", baseOrigin, bases);
    } catch (_) {}

    let scriptsScanned = 0;
    if (opts.fetchScripts) {
      scriptsScanned = await fetchSameOriginScripts(
        map,
        baseOrigin,
        opts.scriptLimit,
        bases
      );
    }

    try {
      // Nuxt 3 payload — 페이지/페이로드에 실제 참조가 있을 때만 추가
      if (framework.nuxt) {
        const html = (document.documentElement?.innerHTML || "").slice(0, 200_000);
        const hasPayloadRef =
          /_payload\.json|__NUXT_DATA__|data-nuxt-data/i.test(html) ||
          !!bridge?.payloads?.__NUXT_DATA_SCRIPT__ ||
          !!document.getElementById("__NUXT_DATA__");
        if (hasPayloadRef) {
          P.addPath(map, "/_payload.json", "nuxt:payload-ref", baseOrigin, bases);
        }
      }
      const buildId = bridge?.payloads?.__NUXT__?.config?.app?.buildId;
      if (buildId && framework.nuxt) {
        P.addPath(
          map,
          `/_nuxt/builds/meta/${buildId}.json`,
          "nuxt:build-meta",
          baseOrigin,
          bases
        );
      }
    } catch (_) {}

    // 전역 baseURL × path 재결합
    const resolvedBases = P.resolveAgainstBases(map, baseOrigin);

    const urls = P.toArray(map);
    lastResult = {
      ok: true,
      scannedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      page: {
        href: location.href,
        origin: baseOrigin,
        title: document.title,
      },
      framework,
      bases: resolvedBases,
      stats: {
        total: urls.length,
        byCategory: urls.reduce((acc, u) => {
          acc[u.category] = (acc[u.category] || 0) + 1;
          return acc;
        }, {}),
        scriptsScanned,
        bridgeOk: !!bridge,
        baseCount: resolvedBases.length,
      },
      urls,
    };

    try {
      chrome.storage.session.set({
        lastScan: lastResult,
        lastScanTabHint: location.href,
      });
    } catch (_) {}

    return lastResult;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return;

    if (msg.type === "PING") {
      sendResponse({ ok: true, href: location.href, version: 2 });
      return;
    }

    if (msg.type === "GET_LAST") {
      sendResponse({ ok: true, result: lastResult });
      return;
    }

    if (msg.type === "SCAN") {
      runScan(msg.options)
        .then((result) => sendResponse(result))
        .catch((err) =>
          sendResponse({
            ok: false,
            error: String(err && err.message ? err.message : err),
          })
        );
      return true;
    }
  });
})();
