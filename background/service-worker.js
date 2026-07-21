/**
 * Background service worker — lightweight message relay / install hook.
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log("[JRList] installed");
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "GET_TAB_INFO") {
    sendResponse({
      ok: true,
      tabId: sender.tab?.id ?? null,
      url: sender.tab?.url ?? null,
    });
  }
});
