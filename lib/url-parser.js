/**
 * Shared URL extraction helpers (content script + popup context).
 * Focused on Nuxt.js / Vue.js page surfaces and common JS URL patterns.
 *
 * baseURL 처리:
 *  - JS/설정에서 baseURL·baseUrl·apiBase 등을 수집
 *  - 같은 문서(및 스캔 전체)에서 나온 상대/경로를 각 base 와 axios 방식으로 결합
 */
(function (root) {
  "use strict";

  const ABSOLUTE_URL_RE = /https?:\/\/[^\s"'`<>\\)]+/gi;
  const PROTOCOL_RELATIVE_RE =
    /\/\/[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}[^\s"'`<>\\)]*/gi;
  const PATH_RE =
    /(?:^|["'`(=,\s])(\/(?:api|graphql|_nuxt|_ipx|__nuxt|_payload|v\d+|auth|oauth|admin|user|users|login|logout|signup|register|dashboard|static|assets|cdn|proxy|webhook|callback|oauth2|sso|internal|private|public)[^\s"'`<>\\)]*)/gi;
  const GENERIC_PATH_RE = /["'`](\/[a-zA-Z0-9._~!$&'()*+,;=:@%/-]{2,})["'`]/g;
  const RELATIVE_API_PATH_RE =
    /["'`]((?:\.?\.?\/)?(?:api|graphql|v\d+|auth|oauth|admin|users?|login|logout|callback|webhook|proxy)[a-zA-Z0-9._~!$&'()*+,;=:@%/-]*)["'`]/gi;
  const ROUTE_PATH_RE = /path\s*:\s*["'`]([^"'`]+)["'`]/gi;
  const FETCH_PATH_RE =
    /(?:fetch|axios|\$fetch|useFetch|useAsyncData|navigateTo|router\.(?:push|replace)|window\.open)\s*\(\s*["'`]([^"'`]+)["'`]/gi;

  const BASE_URL_ASSIGN_RE =
    /(?:baseURL|baseUrl|BASE_URL|apiBase|apiBaseUrl|apiURL|apiUrl|API_URL|API_BASE|cdnURL|cdnUrl|CDN_URL|assetURL|assetUrl|publicPath|publicURL|routerBase|appBase)\s*[:=]\s*["'`]([^"'`]{1,500})["'`]/gi;
  const BASE_URL_OBJ_RE =
    /["'`](?:baseURL|baseUrl|BASE_URL|apiBase|apiBaseUrl|apiURL|apiUrl|cdnURL|cdnUrl|publicPath)["'`]\s*:\s*["'`]([^"'`]{1,500})["'`]/gi;

  const BASE_KEY_RE =
    /^(baseURL|baseUrl|BASE_URL|apiBase|apiBaseUrl|apiURL|apiUrl|API_URL|API_BASE|cdnURL|cdnUrl|CDN_URL|assetURL|assetUrl|publicPath|publicURL|routerBase|appBase)$/i;

  const NOISE_EXT =
    /\.(?:css|png|jpe?g|gif|svg|ico|woff2?|ttf|eot|map|mp4|webm|mp3|wav|pdf)(?:\?|$)/i;
  const NOISE_HOST =
    /(?:google-analytics|googletagmanager|facebook\.net|doubleclick|hotjar|sentry\.io|cloudflareinsights)/i;

  function cleanRaw(raw) {
    if (!raw || typeof raw !== "string") return null;
    let u = raw.trim();
    u = u.replace(/[),.;]+$/g, "");
    u = u.replace(/\\u002f/gi, "/").replace(/\\\//g, "/");
    u = u.replace(/&amp;/g, "&");
    if (!u) return null;
    return u;
  }

  /** axios combineURLs 스타일 */
  function joinWithBase(base, rel) {
    const b = cleanRaw(base);
    const r = cleanRaw(rel);
    if (!b || !r) return null;
    if (/^https?:\/\//i.test(r) || r.startsWith("//")) return r;
    if (/^(data:|blob:|javascript:)/i.test(r)) return null;
    return b.replace(/\/+$/, "") + "/" + r.replace(/^\/+/, "");
  }

  function toAbsolute(raw, pageOrigin) {
    let u = cleanRaw(raw);
    if (!u) return null;
    if (u.startsWith("//")) u = "https:" + u;
    try {
      if (/^https?:\/\//i.test(u)) {
        const parsed = new URL(u);
        parsed.hash = "";
        u = parsed.href;
      } else if (u.startsWith("/") && pageOrigin) {
        u = new URL(u, pageOrigin).href;
      } else if (pageOrigin && !u.includes("://")) {
        u = new URL(u.replace(/^\.\//, ""), pageOrigin.replace(/\/?$/, "/") ).href;
      } else {
        return null;
      }
    } catch (_) {
      return null;
    }
    if (NOISE_EXT.test(u) || NOISE_HOST.test(u)) return null;
    return u;
  }

  function normalizeBase(raw, pageOrigin) {
    const abs = toAbsolute(raw === "/" ? "/" : raw, pageOrigin);
    return abs;
  }

  function normalizeUrl(raw, baseOrigin) {
    return toAbsolute(raw, baseOrigin);
  }

  function classify(url, forced) {
    if (forced) return forced;
    const lower = url.toLowerCase();
    if (/\/api\/|\/graphql|\/v\d+\//i.test(lower) || lower.includes("graphql"))
      return "api";
    if (/_nuxt|_payload|_ipx|__nuxt/i.test(lower)) return "nuxt";
    if (/\/(auth|oauth|login|logout|signup|register|sso)\b/i.test(lower))
      return "auth";
    if (/\/(admin|dashboard|internal|private)\b/i.test(lower)) return "admin";
    if (/^https?:\/\//i.test(url)) return "absolute";
    return "path";
  }

  function put(map, url, source, category, fromBase) {
    if (!url) return;
    if (!map.has(url)) {
      map.set(url, {
        url,
        category: category || classify(url),
        sources: new Set([source]),
        fromBase: fromBase || null,
      });
    } else {
      const item = map.get(url);
      item.sources.add(source);
      if (category === "base") item.category = "base";
      if (fromBase && !item.fromBase) item.fromBase = fromBase;
    }
  }

  function addBase(bases, map, raw, source, pageOrigin) {
    const normalized = normalizeBase(raw, pageOrigin);
    if (!normalized) return;
    bases.add(normalized);
    put(map, normalized, source, "base", null);
  }

  function addPath(map, raw, source, pageOrigin, bases) {
    const cleaned = cleanRaw(raw);
    if (!cleaned) return;

    // 1) 페이지 origin 기준 등록
    const pageAbs = toAbsolute(cleaned, pageOrigin);
    if (pageAbs) put(map, pageAbs, source, null, null);

    // 이미 절대 URL이면 base 결합 불필요
    if (/^https?:\/\//i.test(cleaned) || cleaned.startsWith("//")) return;

    // 2) 각 baseURL 과 결합
    if (!bases || !bases.size) return;
    for (const base of bases) {
      const combined = joinWithBase(base, cleaned);
      if (!combined) continue;
      const abs = toAbsolute(combined, pageOrigin);
      if (!abs) continue;
      if (pageAbs && abs === pageAbs) continue;
      put(map, abs, source + "@base", null, base);
    }
  }

  function extractBasesFromText(text, bases, map, source, pageOrigin) {
    if (!text) return;
    let m;
    BASE_URL_ASSIGN_RE.lastIndex = 0;
    while ((m = BASE_URL_ASSIGN_RE.exec(text)) !== null) {
      addBase(bases, map, m[1], source + ":baseURL", pageOrigin);
    }
    BASE_URL_OBJ_RE.lastIndex = 0;
    while ((m = BASE_URL_OBJ_RE.exec(text)) !== null) {
      addBase(bases, map, m[1], source + ":baseURL", pageOrigin);
    }
  }

  function collectPathsFromText(text) {
    const paths = [];
    if (!text) return paths;
    let m;

    ABSOLUTE_URL_RE.lastIndex = 0;
    while ((m = ABSOLUTE_URL_RE.exec(text)) !== null) paths.push(m[0]);

    PROTOCOL_RELATIVE_RE.lastIndex = 0;
    while ((m = PROTOCOL_RELATIVE_RE.exec(text)) !== null) paths.push(m[0]);

    PATH_RE.lastIndex = 0;
    while ((m = PATH_RE.exec(text)) !== null) paths.push(m[1]);

    GENERIC_PATH_RE.lastIndex = 0;
    while ((m = GENERIC_PATH_RE.exec(text)) !== null) {
      if (m[1].length > 2 && !NOISE_EXT.test(m[1])) paths.push(m[1]);
    }

    RELATIVE_API_PATH_RE.lastIndex = 0;
    while ((m = RELATIVE_API_PATH_RE.exec(text)) !== null) paths.push(m[1]);

    ROUTE_PATH_RE.lastIndex = 0;
    while ((m = ROUTE_PATH_RE.exec(text)) !== null) paths.push(m[1]);

    FETCH_PATH_RE.lastIndex = 0;
    while ((m = FETCH_PATH_RE.exec(text)) !== null) paths.push(m[1]);

    return paths;
  }

  function extractFromText(text, map, source, pageOrigin, bases) {
    if (!text || typeof text !== "string") return;
    const localBases = bases || new Set();

    extractBasesFromText(text, localBases, map, source, pageOrigin);

    const paths = collectPathsFromText(text);
    for (const p of paths) {
      addPath(map, p, source, pageOrigin, localBases);
    }
  }

  function walkObject(obj, map, source, pageOrigin, depth, seen, bases) {
    const localBases = bases || new Set();
    if (depth > 8 || obj == null) return;

    if (typeof obj === "string") {
      extractFromText(obj, map, source, pageOrigin, localBases);
      if (
        obj.startsWith("/") ||
        /^https?:\/\//i.test(obj) ||
        obj.startsWith("//")
      ) {
        addPath(map, obj, source, pageOrigin, localBases);
      }
      return;
    }
    if (typeof obj !== "object") return;
    if (seen.has(obj)) return;
    seen.add(obj);

    if (Array.isArray(obj)) {
      for (const item of obj) {
        walkObject(item, map, source, pageOrigin, depth + 1, seen, localBases);
      }
      return;
    }

    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string" && BASE_KEY_RE.test(k)) {
        addBase(localBases, map, v, source + ":" + k, pageOrigin);
      }
    }

    for (const [k, v] of Object.entries(obj)) {
      const keyHint = /url|path|href|src|endpoint|route|api|base|cdn|host/i.test(k)
        ? source + ":" + k
        : source;

      if (typeof v === "string") {
        if (BASE_KEY_RE.test(k)) {
          addBase(localBases, map, v, keyHint, pageOrigin);
          continue;
        }
        extractFromText(v, map, keyHint, pageOrigin, localBases);
        if (
          v.startsWith("/") ||
          /^https?:\/\//i.test(v) ||
          v.startsWith("//")
        ) {
          addPath(map, v, keyHint, pageOrigin, localBases);
        } else if (
          localBases.size &&
          v.length >= 2 &&
          v.length < 300 &&
          !NOISE_EXT.test(v) &&
          !/\s/.test(v) &&
          /^[a-zA-Z0-9._~@%+/=?-]/.test(v)
        ) {
          addPath(map, v, keyHint, pageOrigin, localBases);
        }
      } else {
        walkObject(v, map, keyHint, pageOrigin, depth + 1, seen, localBases);
      }
    }
  }

  /**
   * 스캔 종료 후 전역 base × 수집된 path 재결합
   */
  function resolveAgainstBases(map, pageOrigin) {
    const bases = [];
    const rels = [];

    for (const item of map.values()) {
      if (item.category === "base") {
        bases.push(item.url);
        continue;
      }
      try {
        if (item.url.startsWith(pageOrigin)) {
          const u = new URL(item.url);
          rels.push(u.pathname + u.search);
        } else if (item.url.startsWith("/")) {
          rels.push(item.url);
        }
      } catch (_) {}
    }

    const uniqueBases = Array.from(new Set(bases));
    const uniqueRels = Array.from(new Set(rels));

    for (const base of uniqueBases) {
      for (const rel of uniqueRels) {
        const combined = joinWithBase(base, rel);
        if (!combined) continue;
        const abs = toAbsolute(combined, pageOrigin);
        if (!abs) continue;
        put(map, abs, "resolve@base", null, base);
      }
    }
    return uniqueBases;
  }

  function toArray(map) {
    return Array.from(map.values())
      .map((item) => ({
        url: item.url,
        category: item.category,
        sources: Array.from(item.sources).sort(),
        fromBase: item.fromBase || null,
      }))
      .sort((a, b) => {
        if (a.category === "base" && b.category !== "base") return -1;
        if (b.category === "base" && a.category !== "base") return 1;
        return a.url.localeCompare(b.url);
      });
  }

  // 하위 호환 별칭
  function addResult(map, raw, source, baseOrigin) {
    addPath(map, raw, source, baseOrigin, null);
  }

  root.UrlParser = {
    normalizeUrl,
    normalizeBase,
    joinWithBase,
    classify,
    addResult,
    addPath,
    addBase,
    extractFromText,
    extractBasesFromText,
    walkObject,
    resolveAgainstBases,
    toArray,
    ABSOLUTE_URL_RE,
    NOISE_EXT,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
