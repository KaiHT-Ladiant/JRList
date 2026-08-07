# Privacy Policy — JRList

**Last updated:** 2026-08-07

JRList (“the Extension”) is a Chrome extension that helps authorized users extract URLs, routes, and API-related paths from web pages (including Nuxt.js, Vue.js, and Next.js sites) for security research and frontend reconnaissance.

## Data we collect

JRList **does not** collect, transmit, sell, or share personal data with the developer or any third party.

| Data | Where it stays | Sent off-device? |
|------|----------------|-----------------|
| Current page URL / HTML / JS readable by the open tab | Processed locally in your browser | No |
| Extracted URL list | Shown in the popup; may be saved in `chrome.storage.session` on your device | No |
| Clipboard (only if you click **Copy**) | Written locally via the Clipboard API | No |
| Analytics / advertising / accounts | Not used | — |

## Permissions (why they exist)

- **activeTab** — Scan only the tab you are using when you open the extension.
- **scripting** — Inject scan helpers when you click **Scan** (not always-on for every page).
- **storage** — Keep the latest scan result in session storage on your machine.
- **clipboardWrite** — Copy results when you choose **Copy**.
- **Host access (http/https)** — Read page content and same-origin JS bundles needed for URL extraction on sites you visit.

## User control

- Scanning runs only when you click **Scan**.
- You can remove the Extension at any time from `chrome://extensions`.
- Clearing browser data / removing the Extension removes local session results.

## Intended use

Use JRList only on systems and websites you are **authorized** to test. Misuse is solely the user’s responsibility.

## Contact

For privacy questions about this Extension, open an issue on the public repository:

https://github.com/KaiHT-Ladiant/JRList/issues

## Changes

If this policy changes, the date at the top of this file will be updated in the repository.
