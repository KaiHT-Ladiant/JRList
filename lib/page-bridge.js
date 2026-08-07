/**
 * Injected into PAGE (MAIN) world via chrome.scripting.executeScript.
 * Must return harvest payload (IIFE return value) for MV3 result capture.
 * Collects Nuxt / Vue / Next.js globals that isolated content scripts cannot read.
 */
(function () {
  "use strict";

  function safeClone(value, depth, seen) {
    if (depth > 6) return "[MaxDepth]";
    if (value == null) return value;
    const t = typeof value;
    if (t === "string" || t === "number" || t === "boolean") return value;
    if (t === "function") return "[Function]";
    if (t !== "object") return String(value);
    if (seen.has(value)) return "[Circular]";
    seen.add(value);

    try {
      if (Array.isArray(value)) {
        return value.slice(0, 300).map((v) => safeClone(v, depth + 1, seen));
      }
      const out = {};
      const keys = Object.keys(value).slice(0, 300);
      for (const k of keys) {
        try {
          out[k] = safeClone(value[k], depth + 1, seen);
        } catch (_) {
          out[k] = "[Unreadable]";
        }
      }
      return out;
    } catch (_) {
      return "[Error]";
    }
  }

  function collectVueRoutes(app) {
    const routes = [];
    try {
      const router =
        app?.config?.globalProperties?.$router ||
        app?._context?.config?.globalProperties?.$router ||
        app?.$router;
      const list = router?.getRoutes?.() || router?.options?.routes || [];
      if (!Array.isArray(list)) return routes;

      const walk = (items, parent) => {
        for (const r of items) {
          const path = r.path || r.record?.path || "";
          const full = parent
            ? (parent.replace(/\/$/, "") + "/" + String(path).replace(/^\//, "")).replace(
                /\/+/g,
                "/"
              )
            : path;
          if (full) routes.push(full);
          const children = r.children || r.record?.children;
          if (children) walk(children, full || parent || "");
        }
      };
      walk(list, "");
    } catch (_) {}
    return routes;
  }

  function detectFramework() {
    const info = {
      nuxt: false,
      nuxtVersion: null,
      vue: false,
      vueVersion: null,
      next: false,
      nextVersion: null,
      hasNuxtData: false,
      hasNuxtPayload: false,
      hasNextData: false,
      nextRouter: null,
    };

    try {
      const hasNuxtEl = !!(
        document.getElementById("__nuxt") ||
        document.getElementById("__NUXT__") ||
        document.querySelector("#__nuxt, [data-nuxt-data], script#__NUXT_DATA__")
      );
      if (
        window.__NUXT__ ||
        window.__NUXT_DATA__ ||
        window.$nuxt ||
        typeof window.useNuxtApp === "function" ||
        hasNuxtEl
      ) {
        info.nuxt = true;
      }
      if (document.getElementById("__NUXT_DATA__")) info.hasNuxtData = true;
      if (document.querySelector("script[type='application/json'][data-nuxt-data]")) {
        info.hasNuxtData = true;
        info.nuxt = true;
      }
      if (window.__NUXT__) {
        info.hasNuxtPayload = true;
        info.nuxtVersion = window.__NUXT__.config?.app?.buildId ? "3?" : "2";
      }

      const hasNextDataEl = !!document.getElementById("__NEXT_DATA__");
      const hasNextStatic = !!document.querySelector(
        'script[src*="/_next/"], link[href*="/_next/"], script[src*="/_next/static/"]'
      );
      const hasNextRoot = !!document.querySelector("#__next, [data-nextjs-scroll-focus-boundary]");
      if (
        window.__NEXT_DATA__ ||
        hasNextDataEl ||
        window.next?.version ||
        window.next?.router ||
        typeof window.__next_f !== "undefined" ||
        hasNextStatic ||
        hasNextRoot
      ) {
        info.next = true;
      }
      if (window.__NEXT_DATA__ || hasNextDataEl) info.hasNextData = true;
      if (window.next?.version) info.nextVersion = String(window.next.version);
      if (window.__NEXT_DATA__?.version) {
        info.nextVersion = info.nextVersion || String(window.__NEXT_DATA__.version);
      }
      if (window.next?.router) {
        try {
          info.nextRouter = window.next.router.pathname || window.next.router.asPath || null;
        } catch (_) {}
      }

      const html = document.documentElement.outerHTML.slice(0, 8000);
      if (/data-n-head|__nuxt|nuxt-link|data-v-/i.test(html)) {
        info.vue = true;
      }
      if (window.__VUE__ || window.Vue || document.querySelector("[data-v-]")) {
        info.vue = true;
      }
      if (window.Vue?.version) info.vueVersion = String(window.Vue.version);
      if (/__NEXT_DATA__|\/_next\/|next-route-announcer|data-nextjs/i.test(html)) {
        info.next = true;
      }
    } catch (_) {}

    return info;
  }

  function collectNextRoutes(nextData) {
    const routes = [];
    if (!nextData || typeof nextData !== "object") return routes;
    try {
      if (nextData.page) routes.push(String(nextData.page));
      if (nextData.props?.pageProps?.__N_SSG || nextData.props?.pageProps?.__N_SSP) {
        /* keep page path only */
      }
      const asPath = nextData.props?.pageProps?.__N_REDIRECT || nextData.asPath;
      if (typeof nextData.query === "object" && nextData.page) {
        routes.push(String(nextData.page));
      }
      if (typeof asPath === "string") routes.push(asPath.split("?")[0]);
    } catch (_) {}
    return routes;
  }

  function harvest() {
    const framework = detectFramework();
    const payloads = {};
    const routes = [];
    const nextMeta = {
      buildId: null,
      basePath: null,
      assetPrefix: null,
      page: null,
    };

    try {
      if (window.__NUXT__) {
        payloads.__NUXT__ = safeClone(window.__NUXT__, 0, new WeakSet());
      }
    } catch (_) {}

    try {
      if (window.__NUXT_DATA__) {
        payloads.__NUXT_DATA__ = safeClone(window.__NUXT_DATA__, 0, new WeakSet());
      }
    } catch (_) {}

    try {
      const el = document.getElementById("__NUXT_DATA__");
      if (el?.textContent) {
        payloads.__NUXT_DATA_SCRIPT__ = JSON.parse(el.textContent);
        framework.nuxt = true;
        framework.hasNuxtData = true;
      }
    } catch (_) {}

    try {
      const nuxtEls = document.querySelectorAll(
        "script[type='application/json'][data-nuxt-data], script#__NUXT_DATA__"
      );
      nuxtEls.forEach((el, i) => {
        try {
          payloads["nuxt_json_" + i] = JSON.parse(el.textContent);
          framework.nuxt = true;
        } catch (_) {}
      });
    } catch (_) {}

    // --- Next.js ---
    try {
      if (window.__NEXT_DATA__) {
        payloads.__NEXT_DATA__ = safeClone(window.__NEXT_DATA__, 0, new WeakSet());
        framework.next = true;
        framework.hasNextData = true;
        nextMeta.buildId = window.__NEXT_DATA__.buildId || null;
        nextMeta.basePath = window.__NEXT_DATA__.basePath || null;
        nextMeta.assetPrefix = window.__NEXT_DATA__.assetPrefix || null;
        nextMeta.page = window.__NEXT_DATA__.page || null;
        routes.push(...collectNextRoutes(window.__NEXT_DATA__));
      }
    } catch (_) {}

    try {
      const nextEl = document.getElementById("__NEXT_DATA__");
      if (nextEl?.textContent) {
        const parsed = JSON.parse(nextEl.textContent);
        payloads.__NEXT_DATA_SCRIPT__ = parsed;
        framework.next = true;
        framework.hasNextData = true;
        nextMeta.buildId = nextMeta.buildId || parsed.buildId || null;
        nextMeta.basePath = nextMeta.basePath || parsed.basePath || null;
        nextMeta.assetPrefix = nextMeta.assetPrefix || parsed.assetPrefix || null;
        nextMeta.page = nextMeta.page || parsed.page || null;
        routes.push(...collectNextRoutes(parsed));
      }
    } catch (_) {}

    try {
      if (window.next?.router) {
        framework.next = true;
        const r = window.next.router;
        if (r.pathname) routes.push(String(r.pathname));
        if (r.asPath) routes.push(String(r.asPath).split("?")[0]);
        if (r.basePath) nextMeta.basePath = nextMeta.basePath || r.basePath;
        payloads.nextRouter = safeClone(
          {
            pathname: r.pathname,
            asPath: r.asPath,
            basePath: r.basePath,
            locale: r.locale,
            locales: r.locales,
            defaultLocale: r.defaultLocale,
            query: r.query,
          },
          0,
          new WeakSet()
        );
      }
    } catch (_) {}

    try {
      // App Router RSC flight buffer (strings only, shallow)
      if (typeof window.__next_f !== "undefined" && Array.isArray(window.__next_f)) {
        framework.next = true;
        const flightStrings = [];
        const limit = Math.min(window.__next_f.length, 80);
        for (let i = 0; i < limit; i++) {
          const entry = window.__next_f[i];
          if (Array.isArray(entry)) {
            for (const part of entry) {
              if (typeof part === "string" && part.length > 2 && part.length < 5000) {
                flightStrings.push(part);
              }
            }
          } else if (typeof entry === "string" && entry.length > 2 && entry.length < 5000) {
            flightStrings.push(entry);
          }
        }
        if (flightStrings.length) {
          payloads.__next_f_sample__ = flightStrings.slice(0, 40);
        }
      }
    } catch (_) {}

    try {
      const apps = window.__VUE_DEVTOOLS_GLOBAL_HOOK__?.apps || [];
      for (const app of apps) {
        routes.push(...collectVueRoutes(app));
      }
    } catch (_) {}

    try {
      if (window.$nuxt?.$router) {
        routes.push(...collectVueRoutes(window.$nuxt));
        const r = window.$nuxt.$router.options?.routes || [];
        const walk = (list, parent) => {
          for (const route of list) {
            const full = parent
              ? (parent.replace(/\/$/, "") + "/" + String(route.path || "").replace(/^\//, "")).replace(
                  /\/+/g,
                  "/"
                )
              : route.path;
            if (full) routes.push(full);
            if (route.children) walk(route.children, full || parent || "");
          }
        };
        walk(r, "");
      }
    } catch (_) {}

    try {
      const config = window.__NUXT__?.config || window.__NUXT__?.$config;
      if (config) payloads.nuxtConfig = safeClone(config, 0, new WeakSet());
    } catch (_) {}

    const payload = {
      framework,
      payloads,
      routes: Array.from(new Set(routes.filter(Boolean))),
      nextMeta,
      origin: location.origin,
      href: location.href,
    };

    try {
      window.postMessage(
        {
          source: "jrlist",
          type: "PAGE_HARVEST",
          payload,
        },
        "*"
      );
    } catch (_) {}

    return payload;
  }

  return harvest();
})();
