(() => {
  "use strict";

  const scanBtn = document.getElementById("scanBtn");
  const copyBtn = document.getElementById("copyBtn");
  const exportJsonBtn = document.getElementById("exportJsonBtn");
  const exportTxtBtn = document.getElementById("exportTxtBtn");
  const searchInput = document.getElementById("searchInput");
  const categorySelect = document.getElementById("categorySelect");
  const fetchScriptsToggle = document.getElementById("fetchScriptsToggle");
  const statusEl = document.getElementById("status");
  const statsEl = document.getElementById("stats");
  const urlList = document.getElementById("urlList");
  const pageUrlEl = document.getElementById("pageUrl");
  const frameworkBadges = document.getElementById("frameworkBadges");
  const viewPanel = document.getElementById("viewPanel");
  const viewTitle = document.getElementById("viewTitle");
  const viewMeta = document.getElementById("viewMeta");
  const viewCode = document.getElementById("viewCode");
  const viewCopyBtn = document.getElementById("viewCopyBtn");
  const viewCloseBtn = document.getElementById("viewCloseBtn");

  let currentResult = null;
  let statusResetTimer = null;
  let viewText = "";

  function frameworkLabels(framework) {
    const fw = [];
    if (framework?.nuxt) fw.push("Nuxt");
    if (framework?.vue) fw.push("Vue");
    if (framework?.next) fw.push("Next");
    if (framework?.node) fw.push("Node");
    return fw;
  }

  function frameworkStatusText(framework) {
    const fw = frameworkLabels(framework);
    return fw.length ? fw.join(" + ") + " 감지" : "프레임워크 미감지 (일반 스캔)";
  }

  function setStatus(text, type) {
    statusEl.textContent = text;
    statusEl.classList.remove("ok", "error");
    if (type) statusEl.classList.add(type);
  }

  function flashStatus(text, type, ms) {
    if (statusResetTimer) clearTimeout(statusResetTimer);
    setStatus(text, type);
    statusResetTimer = setTimeout(() => {
      if (!currentResult?.ok) return;
      setStatus(
        `${frameworkStatusText(currentResult.framework)} · ${currentResult.stats.total}개 URL · ${currentResult.durationMs}ms`,
        "ok"
      );
    }, ms || 1600);
  }

  function closeViewPanel() {
    if (!viewPanel) return;
    viewPanel.classList.add("hidden");
    viewPanel.setAttribute("aria-hidden", "true");
    viewText = "";
    if (viewCode) viewCode.textContent = "";
  }

  function openViewPanel(title, meta, text) {
    if (!viewPanel) return;
    viewText = text || "";
    viewTitle.textContent = title || "JS 보기";
    viewMeta.textContent = meta || "";
    viewCode.textContent = viewText;
    viewPanel.classList.remove("hidden");
    viewPanel.setAttribute("aria-hidden", "false");
  }

  async function formatAndViewUrl(url) {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error("활성 탭을 찾을 수 없습니다.");
    await ensureContentScript(tab.id);
    flashStatus("JS 불러오는 중…");
    const fetched = await chrome.tabs.sendMessage(tab.id, {
      type: "FETCH_TEXT",
      url,
      limit: 1_200_000,
    });
    if (!fetched?.ok) {
      throw new Error(fetched?.error || "스크립트를 가져오지 못했습니다.");
    }
    const raw = fetched.text || "";
    const pretty =
      globalThis.JsFormat && typeof globalThis.JsFormat.beautify === "function"
        ? globalThis.JsFormat.beautify(raw)
        : raw;
    const metaParts = [
      fetched.url || url,
      `${raw.length.toLocaleString()} → ${pretty.length.toLocaleString()} chars`,
      "들여쓰기만 적용 (난독화 해제가 아님)",
    ];
    if (fetched.truncated) metaParts.push("입력 잘림");
    if (fetched.contentType) metaParts.push(fetched.contentType);
    openViewPanel("JS 정리 보기", metaParts.join(" · "), pretty);
    flashStatus("JS 정리 완료 (들여쓰기)", "ok");
  }

  async function persistScan(result) {
    if (!result?.ok) return;
    try {
      await chrome.storage.session.set({
        lastScan: result,
        lastScanTabHint: result.page?.href || "",
        lastFilters: {
          query: searchInput.value || "",
          category: categorySelect.value || "all",
          fetchScripts: !!fetchScriptsToggle.checked,
        },
      });
    } catch (err) {
      console.warn("[JRList] session persist failed", err);
    }
  }

  async function persistFilters() {
    try {
      await chrome.storage.session.set({
        lastFilters: {
          query: searchInput.value || "",
          category: categorySelect.value || "all",
          fetchScripts: !!fetchScriptsToggle.checked,
        },
      });
    } catch (_) {}
  }

  function resolveOpenUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) throw new Error("빈 URL입니다.");
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return raw;
    const base =
      currentResult?.page?.href ||
      currentResult?.page?.origin ||
      pageUrlEl.textContent ||
      "";
    if (!base) throw new Error("기준 페이지 URL이 없어 열 수 없습니다.");
    return new URL(raw, base).href;
  }

  /** Open without activating the tab so the popup keeps focus and stays open. */
  async function openUrlKeepPopup(url) {
    await chrome.tabs.create({ url: resolveOpenUrl(url), active: false });
  }

  async function copyOneUrl(url) {
    await navigator.clipboard.writeText(url);
    flashStatus("URL 복사됨", "ok");
  }

  function setBusy(busy) {
    scanBtn.disabled = busy;
    scanBtn.textContent = busy ? "스캔 중…" : "스캔";
  }

  function setExportEnabled(enabled) {
    copyBtn.disabled = !enabled;
    exportJsonBtn.disabled = !enabled;
    exportTxtBtn.disabled = !enabled;
  }

  function renderBadges(framework) {
    frameworkBadges.innerHTML = "";
    const items = [
      { label: "Nuxt", on: !!framework?.nuxt },
      { label: "Vue", on: !!framework?.vue },
      { label: "Next", on: !!framework?.next },
      {
        label: "Node",
        on: !!framework?.node,
        title: (framework?.nodeSignals || []).join(", ") || "",
      },
    ];
    for (const item of items) {
      const span = document.createElement("span");
      span.className = "badge " + (item.on ? "on" : "off");
      span.textContent = item.label + (item.on ? " 감지" : " 미감지");
      if (item.title) span.title = item.title;
      frameworkBadges.appendChild(span);
    }
  }

  function renderStats(result) {
    if (!result?.stats) {
      statsEl.classList.add("hidden");
      statsEl.innerHTML = "";
      return;
    }
    const parts = [
      `<div class="stat">총 <strong>${result.stats.total}</strong></div>`,
      `<div class="stat">${result.durationMs}ms</div>`,
    ];
    if (result.stats.baseCount) {
      parts.push(`<div class="stat">base: <strong>${result.stats.baseCount}</strong></div>`);
    }
    const by = result.stats.byCategory || {};
    for (const [k, v] of Object.entries(by)) {
      parts.push(`<div class="stat">${k}: <strong>${v}</strong></div>`);
    }
    statsEl.innerHTML = parts.join("");
    statsEl.classList.remove("hidden");
  }

  function filteredUrls() {
    if (!currentResult?.urls) return [];
    const q = (searchInput.value || "").trim().toLowerCase();
    const cat = categorySelect.value;
    return currentResult.urls.filter((item) => {
      if (cat !== "all" && item.category !== cat) return false;
      if (!q) return true;
      return (
        item.url.toLowerCase().includes(q) ||
        (item.sources || []).join(" ").toLowerCase().includes(q)
      );
    });
  }

  function renderList() {
    const items = filteredUrls();
    urlList.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("li");
      empty.innerHTML = `<div class="empty">${
        currentResult ? "필터 결과가 없습니다." : "아직 결과가 없습니다."
      }</div>`;
      urlList.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    for (const item of items) {
      const li = document.createElement("li");
      const cat = document.createElement("span");
      cat.className = "cat " + item.category;
      cat.textContent = item.category;

      const main = document.createElement("div");
      main.className = "url-main";

      const row = document.createElement("div");
      row.className = "url-row";

      // <a target="_blank"> closes the Chrome popup on click. Use a button
      // that copies, plus a background-tab open so the popup stays up.
      const urlBtn = document.createElement("button");
      urlBtn.type = "button";
      urlBtn.className = "url-text";
      urlBtn.textContent = item.url;
      urlBtn.title = "클릭: 복사 · Ctrl/⌘+클릭: 백그라운드 탭으로 열기";
      urlBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.metaKey || ev.ctrlKey) {
          openUrlKeepPopup(item.url).catch((err) =>
            flashStatus(String(err.message || err), "error")
          );
          return;
        }
        copyOneUrl(item.url).catch((err) =>
          flashStatus(String(err.message || err), "error")
        );
      });

      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "url-open";
      openBtn.title = "백그라운드 탭으로 열기 (팝업 유지)";
      openBtn.setAttribute("aria-label", "열기");
      openBtn.textContent = "↗";
      openBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        openUrlKeepPopup(item.url)
          .then(() => flashStatus("백그라운드 탭에서 열림", "ok"))
          .catch((err) => flashStatus(String(err.message || err), "error"));
      });

      row.appendChild(urlBtn);
      row.appendChild(openBtn);

      const canFormat =
        globalThis.JsFormat?.looksLikeJsUrl?.(item.url) ||
        /\.m?js(?:\?|$)/i.test(item.url) ||
        /\/_next\/|\/_nuxt\//i.test(item.url);
      if (canFormat) {
        const fmtBtn = document.createElement("button");
        fmtBtn.type = "button";
        fmtBtn.className = "url-format";
        fmtBtn.title = "가져와서 들여쓰기 정리 (난독화 해제 아님)";
        fmtBtn.setAttribute("aria-label", "JS 정리");
        fmtBtn.textContent = "{}";
        fmtBtn.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          formatAndViewUrl(item.url).catch((err) =>
            flashStatus(String(err.message || err), "error")
          );
        });
        row.appendChild(fmtBtn);
      }

      const sources = document.createElement("div");
      sources.className = "sources";
      const bits = (item.sources || []).join(", ");
      sources.textContent = item.fromBase
        ? `base: ${item.fromBase} · ${bits}`
        : bits;

      main.appendChild(row);
      main.appendChild(sources);
      li.appendChild(cat);
      li.appendChild(main);
      frag.appendChild(li);
    }
    urlList.appendChild(frag);
  }

  function applyResult(result, opts) {
    currentResult = result;
    if (!result?.ok) {
      setStatus(result?.error || "스캔 실패", "error");
      setExportEnabled(false);
      renderBadges(null);
      renderStats(null);
      renderList();
      return;
    }

    pageUrlEl.textContent = result.page?.href || "";
    renderBadges(result.framework);
    renderStats(result);
    renderList();
    setExportEnabled(result.urls.length > 0);

    const restored = opts?.restored ? " · 이전 결과 복원" : "";
    setStatus(
      `${frameworkStatusText(result.framework)} · ${result.stats.total}개 URL · ${result.durationMs}ms${restored}`,
      "ok"
    );

    if (opts?.persist !== false) {
      persistScan(result);
    }
  }

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function ping(tabId) {
    return chrome.tabs.sendMessage(tabId, { type: "PING" });
  }

  async function ensureContentScript(tabId) {
    try {
      const pong = await ping(tabId);
      if (pong?.ok) return true;
    } catch (_) {}

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["lib/url-parser.js", "content/content.js"],
    });

    // listener registration race 방지
    for (let i = 0; i < 8; i++) {
      try {
        const pong = await ping(tabId);
        if (pong?.ok) return true;
      } catch (_) {}
      await sleep(40);
    }
    throw new Error(
      "content script 주입 후 응답이 없습니다. 페이지를 새로고침한 뒤 다시 시도하세요."
    );
  }

  async function harvestMainWorld(tabId) {
    try {
      const injected = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        files: ["lib/page-bridge.js"],
      });
      let result = injected?.[0]?.result;
      if (result && typeof result === "object") return result;
    } catch (err) {
      console.warn("[JRList] MAIN file harvest failed", err);
    }

    // 일부 환경에서 file IIFE 반환값이 비는 경우 인라인 폴백
    try {
      const fallback = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: () => {
          const htmlSnap = (document.documentElement?.outerHTML || "").slice(0, 20000);
          const nodeSignals = [];
          const nodeChecks = [
            [/process\.env\b/, "process.env"],
            [/\b__dirname\b/, "__dirname"],
            [/\bBuffer\.(?:from|alloc|isBuffer)\b/, "Buffer"],
            [/\bmodule\.exports\b/, "module.exports"],
            [/\brequire\s*\(/, "require("],
            [/node_modules\//, "node_modules"],
            [/\bexpress\b/i, "express"],
            [/\b@nestjs\b/i, "nestjs"],
            [/\bfastify\b/i, "fastify"],
          ];
          for (const [re, name] of nodeChecks) {
            if (re.test(htmlSnap)) nodeSignals.push(name);
          }
          const framework = {
            nuxt: !!(
              window.__NUXT__ ||
              window.__NUXT_DATA__ ||
              window.$nuxt ||
              document.querySelector("#__nuxt, #__NUXT_DATA__, script#__NUXT_DATA__")
            ),
            vue: !!(
              window.__VUE__ ||
              window.Vue ||
              document.querySelector("[data-v-], #__nuxt")
            ),
            next: !!(
              window.__NEXT_DATA__ ||
              document.getElementById("__NEXT_DATA__") ||
              window.next?.router ||
              typeof window.__next_f !== "undefined" ||
              document.querySelector('script[src*="/_next/"], #__next')
            ),
            node: false,
            nodeSignals,
            hasNuxtData: !!document.getElementById("__NUXT_DATA__"),
            hasNuxtPayload: !!window.__NUXT__,
            hasNextData: !!(window.__NEXT_DATA__ || document.getElementById("__NEXT_DATA__")),
          };
          if (framework.nuxt) nodeSignals.push("stack:nuxt");
          if (framework.next) nodeSignals.push("stack:next");
          framework.nodeSignals = Array.from(new Set(nodeSignals));
          framework.node =
            framework.nuxt || framework.next || framework.nodeSignals.length > 0;
          const payloads = {};
          const nextMeta = { buildId: null, basePath: null, assetPrefix: null, page: null };
          try {
            if (window.__NUXT__) payloads.__NUXT__ = JSON.parse(JSON.stringify(window.__NUXT__));
          } catch (_) {
            try {
              payloads.__NUXT__ = { keys: Object.keys(window.__NUXT__ || {}) };
            } catch (_) {}
          }
          try {
            const el = document.getElementById("__NUXT_DATA__");
            if (el?.textContent) payloads.__NUXT_DATA_SCRIPT__ = JSON.parse(el.textContent);
          } catch (_) {}
          try {
            const nd =
              window.__NEXT_DATA__ ||
              (document.getElementById("__NEXT_DATA__")
                ? JSON.parse(document.getElementById("__NEXT_DATA__").textContent)
                : null);
            if (nd) {
              payloads.__NEXT_DATA__ = nd;
              nextMeta.buildId = nd.buildId || null;
              nextMeta.basePath = nd.basePath || null;
              nextMeta.assetPrefix = nd.assetPrefix || null;
              nextMeta.page = nd.page || null;
            }
          } catch (_) {}
          return {
            framework,
            payloads,
            routes: [],
            nextMeta,
            origin: location.origin,
            href: location.href,
          };
        },
      });
      const result = fallback?.[0]?.result;
      if (result && typeof result === "object") return result;
    } catch (err) {
      console.warn("[JRList] MAIN fallback harvest failed", err);
    }
    return null;
  }

  async function scan() {
    setBusy(true);
    setStatus("페이지를 스캔하는 중…");
    try {
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error("활성 탭을 찾을 수 없습니다.");
      if (!tab.url || /^(chrome|edge|about|chrome-extension|devtools):/i.test(tab.url)) {
        throw new Error("시스템/확장 페이지는 스캔할 수 없습니다.");
      }

      pageUrlEl.textContent = tab.url;

      await ensureContentScript(tab.id);
      setStatus("프레임워크 전역 수집 중…");
      const bridge = await harvestMainWorld(tab.id);

      setStatus("URL 추출 중…");
      const result = await chrome.tabs.sendMessage(tab.id, {
        type: "SCAN",
        options: {
          fetchScripts: fetchScriptsToggle.checked,
          scriptLimit: 40,
          bridge,
        },
      });

      if (!result || typeof result !== "object") {
        throw new Error(
          "스캔 응답이 비어 있습니다. 확장 프로그램을 새로고침(Reload)한 뒤 페이지를 새로고침하세요."
        );
      }
      applyResult(result);
    } catch (err) {
      const message = String(err && err.message ? err.message : err);
      applyResult({
        ok: false,
        error: message,
      });
    } finally {
      setBusy(false);
    }
  }

  function download(filename, text, mime) {
    // Programmatic <a download> often closes the extension popup. Prefer a
    // data: URL + temporary anchor that we revoke after a tick; still save
    // session first so reopening does not force a rescan.
    persistScan(currentResult);
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return (
      d.getFullYear() +
      p(d.getMonth() + 1) +
      p(d.getDate()) +
      "-" +
      p(d.getHours()) +
      p(d.getMinutes()) +
      p(d.getSeconds())
    );
  }

  async function copyUrls() {
    const lines = filteredUrls()
      .map((u) => u.url)
      .join("\n");
    if (!lines) return;
    await navigator.clipboard.writeText(lines);
    setStatus(`클립보드에 ${filteredUrls().length}개 URL 복사됨`, "ok");
  }

  function exportJson() {
    if (!currentResult) return;
    const payload = {
      ...currentResult,
      urls: filteredUrls(),
      exportedAt: new Date().toISOString(),
    };
    download(
      `url-list-${stamp()}.json`,
      JSON.stringify(payload, null, 2),
      "application/json"
    );
  }

  function exportTxt() {
    const lines = filteredUrls()
      .map((u) => u.url)
      .join("\n");
    download(`url-list-${stamp()}.txt`, lines + "\n", "text/plain");
  }

  if (!scanBtn || !copyBtn || !exportJsonBtn || !exportTxtBtn) {
    document.body.innerHTML =
      '<div style="padding:16px;color:#ffc9c9">UI 로드 실패: 버튼 요소 없음. 확장을 Reload 하세요.</div>';
    return;
  }

  scanBtn.addEventListener("click", scan);
  copyBtn.addEventListener("click", () => {
    copyUrls().catch((err) => setStatus(String(err.message || err), "error"));
  });
  exportJsonBtn.addEventListener("click", exportJson);
  exportTxtBtn.addEventListener("click", exportTxt);
  if (viewCloseBtn) viewCloseBtn.addEventListener("click", closeViewPanel);
  if (viewCopyBtn) {
    viewCopyBtn.addEventListener("click", () => {
      if (!viewText) return;
      navigator.clipboard
        .writeText(viewText)
        .then(() => flashStatus("정리된 JS 복사됨", "ok"))
        .catch((err) => flashStatus(String(err.message || err), "error"));
    });
  }
  searchInput.addEventListener("input", () => {
    renderList();
    persistFilters();
  });
  categorySelect.addEventListener("change", () => {
    renderList();
    persistFilters();
  });
  fetchScriptsToggle.addEventListener("change", () => {
    persistFilters();
  });

  try {
    chrome.storage.session
      .get(["lastScan", "lastFilters"])
      .then((data) => {
        if (data.lastFilters) {
          if (typeof data.lastFilters.query === "string") {
            searchInput.value = data.lastFilters.query;
          }
          if (data.lastFilters.category) {
            categorySelect.value = data.lastFilters.category;
          }
          if (typeof data.lastFilters.fetchScripts === "boolean") {
            fetchScriptsToggle.checked = data.lastFilters.fetchScripts;
          }
        }
        if (data.lastScan?.ok) {
          applyResult(data.lastScan, { restored: true, persist: false });
        }
      })
      .catch(() => {});
  } catch (_) {}
})();
