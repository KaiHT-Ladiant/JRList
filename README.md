<p align="center">
  <img src="assets/cover.png" alt="JRList cover" width="720" />
</p>

# JRList

**J**S URL **R**econ **List** — a Chrome Extension (Manifest V3) that extracts URLs, routes, and API paths from **Nuxt.js**, **Vue.js**, and **Next.js** web pages.

Useful for authorized penetration testing, bug bounty, and frontend reconnaissance.

> **Use only on targets you are authorized to test.**

[한국어 README](./README.ko.md)

---

## Features

- Detect Nuxt / Vue / Next signatures (`__NUXT__`, `__NEXT_DATA__`, Vue Router, etc.)
- Collect URLs from DOM, inline JS, `_nuxt` / `_next` bundles, and framework payloads
- Resolve relative paths using discovered `baseURL` / `apiBase` / Nuxt `app.baseURL` / Next `basePath`
- Categories: `base`, `api`, `nuxt`, `next`, `auth`, `admin`, `absolute`, `path`
- Search, filter, clipboard copy, TXT / JSON export
- On-demand script injection only (no always-on content scripts)

---

## Install

### From source (recommended for development)

```bash
git clone https://github.com/KaiHT-Ladiant/JRList.git
cd JRList
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the repository root (folder containing `manifest.json`)

### From release (CRX)

Download `JRList.crx` from [Releases](https://github.com/KaiHT-Ladiant/JRList/releases).

> Recent Chrome versions may block drag-and-drop installation of unsigned local CRX files (`CRX_REQUIRED_PROOF_MISSING`). That is expected for non–Web Store packages. Use **Load unpacked**, or publish via Chrome Web Store (below).

### Chrome Web Store (official signing)

Local CRX signing is **not** enough for normal Chrome installs. To get Google’s store signature:

1. Build `dist/JRList.zip` with `py scripts/pack_crx.py`
2. Open [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole) → **New item**
3. Upload the ZIP and submit for review (Public or Unlisted)

See the full checklist, listing draft text, and permission justifications:

- [docs/chrome-web-store.md](./docs/chrome-web-store.md)
- [PRIVACY.md](./PRIVACY.md) (privacy policy URL for the listing)

---

## Usage

1. Open a target page
2. Click the **JRList** toolbar icon
3. Click **Scan**
4. Filter results and export as copy / TXT / JSON

| Option | Description |
|--------|-------------|
| JS bundle scan | Fetch `script[src]` files and extract additional URL patterns (ON by default) |

---

## Build CRX / ZIP locally

```bash
py -m pip install cryptography
py scripts/pack_crx.py
```

| Output | Description |
|--------|-------------|
| `dist/JRList.crx` | CRX3 package (locally signed) |
| `dist/JRList.zip` | Source ZIP archive |
| `keys/extension.pem` | Signing key — **never commit or share** |

---

## Project structure

```text
JRList/
├── manifest.json
├── background/service-worker.js
├── content/content.js
├── lib/url-parser.js
├── lib/page-bridge.js
├── popup/
├── icons/
├── assets/cover.png
├── scripts/pack_crx.py
├── scripts/generate_icons.py
├── README.md
├── README.ko.md
└── LICENSE
```

---

## Permissions

| Permission | Purpose |
|------------|---------|
| `activeTab` | Scan the current tab |
| `scripting` | Inject scan scripts |
| `storage` | Store session scan results |
| `clipboardWrite` | Copy URL lists |
| `host_permissions` (`http/https`) | Access pages and JS bundles |

---

## Notes

- Cross-origin JS bundles may be unreadable due to CORS
- Obfuscated or runtime-only URLs may be missed by static parsing
- AV/EDR false positives are possible for recon-style extensions

---

## Contributing

Issues and pull requests are welcome.

### Contributors

- Community contributors via pull requests

---

## Disclaimer

This tool is intended for **authorized security research and testing** only. The authors and contributors are not responsible for misuse.

## License

[MIT](./LICENSE)
