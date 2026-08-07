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

  let currentResult = null;

  function setStatus(text, type) {
    statusEl.textContent = text;
    statusEl.classList.remove("ok", "error");
    if (type) statusEl.classList.add(type);
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
    ];
    for (const item of items) {
      const span = document.createElement("span");
      span.className = "badge " + (item.on ? "on" : "off");
      span.textContent = item.label + (item.on ? " 감지" : " 미감지");
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

      const a = document.createElement("a");
      a.className = "url-text";
      a.href = item.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = item.url;
      a.title = item.url;

      const sources = document.createElement("div");
      sources.className = "sources";
      const bits = (item.sources || []).join(", ");
      sources.textContent = item.fromBase
        ? `base: ${item.fromBase} · ${bits}`
        : bits;

      main.appendChild(a);
      main.appendChild(sources);
      li.appendChild(cat);
      li.appendChild(main);
      frag.appendChild(li);
    }
    urlList.appendChild(frag);
  }

  function applyResult(result) {
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

    const fw = [];
    if (result.framework?.nuxt) fw.push("Nuxt");
    if (result.framework?.vue) fw.push("Vue");
    if (result.framework?.next) fw.push("Next");
    const fwText = fw.length ? fw.join(" + ") + " 감지" : "프레임워크 미감지 (일반 스캔)";
    setStatus(
      `${fwText} · ${result.stats.total}개 URL · ${result.durationMs}ms`,
      "ok"
    );
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
            hasNuxtData: !!document.getElementById("__NUXT_DATA__"),
            hasNuxtPayload: !!window.__NUXT__,
            hasNextData: !!(window.__NEXT_DATA__ || document.getElementById("__NEXT_DATA__")),
          };
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
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
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
  searchInput.addEventListener("input", renderList);
  categorySelect.addEventListener("change", renderList);

  try {
    chrome.storage.session.get(["lastScan"]).then((data) => {
      if (data.lastScan?.ok) applyResult(data.lastScan);
    });
  } catch (_) {}
})();
