/**
 * Injected into PAGE (MAIN) world via chrome.scripting.executeScript.
 * Must return harvest payload (IIFE return value) for MV3 result capture.
 * Also posts a message for legacy content-script listeners.
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
      hasNuxtData: false,
      hasNuxtPayload: false,
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
      const html = document.documentElement.outerHTML.slice(0, 8000);
      if (/data-n-head|__nuxt|nuxt-link|data-v-/i.test(html)) {
        info.vue = true;
      }
      if (window.__VUE__ || window.Vue || document.querySelector("[data-v-]")) {
        info.vue = true;
      }
      if (window.Vue?.version) info.vueVersion = String(window.Vue.version);
    } catch (_) {}

    return info;
  }

  function harvest() {
    const framework = detectFramework();
    const payloads = {};
    const routes = [];

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
