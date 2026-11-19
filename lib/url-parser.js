/**
 * Shared URL extraction helpers (content script + popup context).
 * Focused on Nuxt.js / Vue.js / Next.js page surfaces and common JS URL patterns.
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
    /(?:^|["'`(=,\s])(\/(?:api|graphql|_nuxt|_next|_ipx|__nuxt|_payload|node_modules|v\d+|auth|oauth|admin|user|users|login|logout|signup|register|dashboard|static|assets|cdn|proxy|webhook|callback|oauth2|sso|internal|private|public)[^\s"'`<>\\)]*)/gi;
  const GENERIC_PATH_RE = /["'`](\/[a-zA-Z0-9._~!$&'()*+,;=:@%/-]{2,})["'`]/g;
  const RELATIVE_API_PATH_RE =
    /["'`]((?:\.?\.?\/)?(?:api|graphql|v\d+|auth|oauth|admin|users?|login|logout|callback|webhook|proxy)[a-zA-Z0-9._~!$&'()*+,;=:@%/-]*)["'`]/gi;
  const ROUTE_PATH_RE = /path\s*:\s*["'`]([^"'`]+)["'`]/gi;
  const FETCH_PATH_RE =
    /(?:fetch|axios|\$fetch|useFetch|useAsyncData|navigateTo|router\.(?:push|replace)|window\.open|Router\.(?:push|replace)|redirect)\s*\(\s*["'`]([^"'`]+)["'`]/gi;

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

  // Minified template crumbs that URL() happily resolves onto the page origin
  // e.g. "{e}" → https://site/%7Be%7D
  // e.g. "${window.location.protocol}//${this.state...}" → host/$%7Bwindow...%7D
  const PLACEHOLDER_ONLY_RE =
    /^(?:\.?\.?\/)?(?:\$?\{[A-Za-z_$][\w$]*\}|%[0-9A-Fa-f]{2}(?:\{|[A-Fa-f0-9]{2})+|:[A-Za-z_$][\w$]*)$/;
  const SINGLE_LETTER_BRACE_RE = /\$?\{[A-Za-z_$]\}|%7[Bb][A-Za-z_$]%7[Dd]/i;
  const CODE_FRAGMENT_RE = /^[{}\[\]();.,:_$]+$/;
  // JS template literals (raw or percent-encoded)
  const JS_TEMPLATE_LIT_RE = /\$\{[^}]+\}|\$%7[Bb][^%]*(?:%[0-9A-Fa-f]{2})*%7[Dd]/i;
  // Brace / ${} expressions that look like JS property access, not route params
  const JS_EXPR_BRACE_RE =
    /\$?\{[^}]*(?:\.[A-Za-z_$]|window\.|this\.|document\.|location\.|\([^)]*\)|\[[^\]]*\])[^}]*\}/i;

  function cleanRaw(raw) {
    if (!raw || typeof raw !== "string") return null;
    let u = raw.trim();
    u = u.replace(/[),.;]+$/g, "");
    u = u.replace(/\\u002f/gi, "/").replace(/\\\//g, "/");
    u = u.replace(/&amp;/g, "&");
    if (!u) return null;
    return u;
  }

  function pathForNoiseCheck(raw) {
    let u = cleanRaw(raw);
    if (!u) return "";
    try {
      if (/^https?:\/\//i.test(u) || u.startsWith("//")) {
        const href = u.startsWith("//") ? "https:" + u : u;
        const parsed = new URL(href);
        return decodeURIComponent(parsed.pathname + parsed.search);
      }
    } catch (_) {}
    try {
      return decodeURIComponent(u);
    } catch (_) {
      return u;
    }
  }

  /**
   * Drop minified / template junk that is not a real route or URL.
   * Examples:
   *  - "{e}", "/{e}", "${t}", "https://host/%7Be%7D"
   *  - "https://host/$%7Bwindow.location.protocol%7D//$%7Bthis.state...%7D"
   */
  function isJunkPath(raw) {
    const cleaned = cleanRaw(raw);
    if (!cleaned) return true;
    if (/^(data:|blob:|javascript:|#)/i.test(cleaned)) return true;

    // Decode the whole string once for template checks (path + query + opaque bits)
    const decodedFull = decodeURIComponentSafe(cleaned);

    // Any JS template literal in the raw/decoded URL is not a real endpoint
    if (
      JS_TEMPLATE_LIT_RE.test(cleaned) ||
      JS_TEMPLATE_LIT_RE.test(decodedFull) ||
      /\$%7[Bb]/i.test(cleaned)
    ) {
      return true;
    }

    let path = pathForNoiseCheck(cleaned);
    if (!path) return true;
    path = path.replace(/\\/g, "/").trim();

    // Strip trailing slash for comparisons (keep root)
    const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;
    const decodedPath = decodeURIComponentSafe(trimmed);

    if (CODE_FRAGMENT_RE.test(trimmed)) return true;
    if (PLACEHOLDER_ONLY_RE.test(trimmed)) return true;
    if (PLACEHOLDER_ONLY_RE.test(trimmed.replace(/^\//, ""))) return true;

    // "/{e}" or "/${e}" or "/%7Be%7D"
    if (/^\/\$?\{[A-Za-z_$][\w$]*\}$/.test(trimmed)) return true;
    if (/^\/%[0-9A-Fa-f]{2}.+%[0-9A-Fa-f]{2}$/.test(trimmed) && SINGLE_LETTER_BRACE_RE.test(cleaned)) {
      const bare = trimmed.replace(/\//g, "");
      if (/^\$?\{[A-Za-z_$]\}$/.test(decodeURIComponentSafe(bare))) return true;
    }

    // Any single-letter brace placeholder is almost always minified noise
    // e.g. /api/{e}, /users/${t}, https://x/%7Be%7D/y
    if (SINGLE_LETTER_BRACE_RE.test(cleaned) || SINGLE_LETTER_BRACE_RE.test(trimmed)) {
      return true;
    }

    // JS expressions inside braces / ${}: window.*, this.state.*, foo.bar, calls
    if (
      JS_EXPR_BRACE_RE.test(cleaned) ||
      JS_EXPR_BRACE_RE.test(decodedFull) ||
      JS_EXPR_BRACE_RE.test(trimmed) ||
      JS_EXPR_BRACE_RE.test(decodedPath)
    ) {
      return true;
    }

    // Protocol-relative template glue: ${protocol}//${hostOrPath}
    if (/\$\{[^}]+\}\/\/\$\{/.test(decodedFull) || /\$\{[^}]+\}\/\/\$\{/.test(decodedPath)) {
      return true;
    }

    // Path whose only non-slash content is a short placeholder / :param
    const withoutDyn = trimmed
      .replace(/\$?\{[A-Za-z_$][\w$.]*\}/g, "")
      .replace(/:[A-Za-z_$][\w$]*/g, "")
      .replace(/\/+/g, "/")
      .replace(/^\/|\/$/g, "");
    if (!withoutDyn && /\{|\}|:|\$/.test(trimmed)) return true;

    // Extremely short relative crumbs that aren't real paths
    if (!trimmed.startsWith("/") && !/^https?:\/\//i.test(cleaned) && trimmed.length <= 2) {
      if (!/^(api|v\d+)$/i.test(trimmed)) return true;
    }

    return false;
  }

  function decodeURIComponentSafe(s) {
    try {
      return decodeURIComponent(s);
    } catch (_) {
      return s;
    }
  }

  /** axios combineURLs 스타일 — 이미 base 아래 경로면 중복 결합하지 않음 */
  function getBasePath(base) {
    const b = cleanRaw(base);
    if (!b) return "";
    try {
      if (/^https?:\/\//i.test(b)) {
        return new URL(b).pathname.replace(/\/+$/, "") || "";
      }
    } catch (_) {}
    return b.replace(/\/+$/, "");
  }

  function pathAlreadyUnderBase(base, rel) {
    const b = cleanRaw(base);
    const r = cleanRaw(rel);
    if (!b || !r) return false;

    if (/^https?:\/\//i.test(r)) {
      try {
        const bu = new URL(b.startsWith("http") ? b : "http://local" + (b.startsWith("/") ? b : "/" + b));
        const ru = new URL(r);
        if (/^https?:\/\//i.test(b) && bu.origin !== ru.origin) return true;
        const bp = getBasePath(b);
        if (!bp || bp === "/") return false;
        const rp = ru.pathname.replace(/\/+$/, "") || "/";
        return rp === bp || rp.startsWith(bp + "/");
      } catch (_) {
        return true;
      }
    }

    const bp = getBasePath(b);
    if (!bp || bp === "/") return false;

    const relNorm = r.replace(/\/+$/, "");
    const bpNorm = bp.replace(/\/+$/, "");
    const bpBare = bpNorm.replace(/^\//, "");

    if (relNorm === bpNorm || relNorm === "/" + bpBare) return true;
    if (relNorm.startsWith(bpNorm + "/")) return true;
    if (relNorm.startsWith("/" + bpBare + "/")) return true;

    const lastSeg = bpBare.split("/").filter(Boolean).pop();
    if (lastSeg) {
      const relParts = relNorm.replace(/^\//, "").split("/");
      if (relParts[0] === lastSeg && bpNorm.endsWith("/" + lastSeg)) return true;
    }
    return false;
  }

  function shouldJoinWithBase(base, rel) {
    if (!base || !rel) return false;
    if (/^https?:\/\//i.test(rel) || rel.startsWith("//")) return false;
    if (pathAlreadyUnderBase(base, rel)) return false;
    // 사이트 루트 절대경로(/foo)는 API baseURL 과 무작위 결합하지 않음
    if (rel.startsWith("/")) {
      try {
        if (/^https?:\/\//i.test(base)) {
          const pageLike = /^\/(api|graphql|v\d+|auth|oauth|admin|users?|login|logout|callback|webhook|proxy)\b/i.test(rel);
          if (!pageLike) return false;
        }
      } catch (_) {
        return false;
      }
    }
    return true;
  }

  function joinWithBase(base, rel) {
    const b = cleanRaw(base);
    const r = cleanRaw(rel);
    if (!b || !r) return null;
    if (!shouldJoinWithBase(b, r)) return null;
    if (/^(data:|blob:|javascript:)/i.test(r)) return null;
    return b.replace(/\/+$/, "") + "/" + r.replace(/^\/+/, "");
  }

  function toAbsolute(raw, pageOrigin) {
    let u = cleanRaw(raw);
    if (!u) return null;
    if (isJunkPath(u)) return null;
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
    if (isJunkPath(u)) return null;
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
    if (/_next|__next_data__|__next_f/i.test(lower)) return "next";
    if (/node_modules|\/(express|nestjs|fastify|koa)\b/i.test(lower)) return "node";
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
    if (isJunkPath(cleaned)) return;

    // 1) 페이지 origin 기준 등록
    const pageAbs = toAbsolute(cleaned, pageOrigin);
    if (pageAbs) put(map, pageAbs, source, null, null);

    // 이미 절대 URL이면 base 결합 불필요
    if (/^https?:\/\//i.test(cleaned) || cleaned.startsWith("//")) return;

    // 2) 각 baseURL 과 결합 (중복 세그먼트 방지)
    if (!bases || !bases.size) return;
    for (const base of bases) {
      if (!shouldJoinWithBase(base, cleaned)) continue;
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
      if (m[1].length > 2 && !NOISE_EXT.test(m[1]) && !isJunkPath(m[1])) {
        paths.push(m[1]);
      }
    }

    RELATIVE_API_PATH_RE.lastIndex = 0;
    while ((m = RELATIVE_API_PATH_RE.exec(text)) !== null) {
      if (!isJunkPath(m[1])) paths.push(m[1]);
    }

    ROUTE_PATH_RE.lastIndex = 0;
    while ((m = ROUTE_PATH_RE.exec(text)) !== null) {
      if (!isJunkPath(m[1])) paths.push(m[1]);
    }

    FETCH_PATH_RE.lastIndex = 0;
    while ((m = FETCH_PATH_RE.exec(text)) !== null) {
      if (!isJunkPath(m[1])) paths.push(m[1]);
    }

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
        if (isJunkPath(v)) continue;
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
          !/[{}]/.test(v) &&
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
   * 스캔 종료 후: base × **상대 경로만** 재결합 (절대/루트 경로는 제외)
   */
  function resolveAgainstBases(map, pageOrigin) {
    const bases = [];
    const rels = [];

    for (const item of map.values()) {
      if (item.category === "base") {
        bases.push(item.url);
        continue;
      }
      // 이미 base 결합으로 만들어진 URL은 제외
      if (item.fromBase) continue;
      const raw = item.url;
      if (/^https?:\/\//i.test(raw)) continue;
      if (raw.startsWith("/")) continue;
      if (raw.length < 2 || raw.length > 200) continue;
      if (NOISE_EXT.test(raw)) continue;
      rels.push(raw);
    }

    const uniqueBases = Array.from(new Set(bases));
    const uniqueRels = Array.from(new Set(rels));

    for (const base of uniqueBases) {
      for (const rel of uniqueRels) {
        if (!shouldJoinWithBase(base, rel)) continue;
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
    pathAlreadyUnderBase,
    shouldJoinWithBase,
    joinWithBase,
    isJunkPath,
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
