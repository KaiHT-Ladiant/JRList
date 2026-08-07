<p align="center">
  <img src="assets/cover.png" alt="JRList cover" width="720" />
</p>

<h1 align="center">JRList</h1>

<p align="center">
  <strong>J</strong>S URL <strong>R</strong>econ <strong>List</strong><br />
  Chrome Extension (Manifest V3) that extracts URLs, routes, and API paths from<br />
  <strong>Nuxt.js</strong> · <strong>Vue.js</strong> · <strong>Next.js</strong> pages
</p>

<p align="center">
  <a href="https://github.com/KaiHT-Ladiant/JRList/releases"><img alt="Release" src="https://img.shields.io/github/v/release/KaiHT-Ladiant/JRList?include_prereleases&label=release" /></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg" /></a>
  <a href="./PRIVACY.md"><img alt="Privacy" src="https://img.shields.io/badge/privacy-policy-important" /></a>
</p>

<p align="center">
  <a href="./README.ko.md">한국어</a> ·
  <a href="https://github.com/KaiHT-Ladiant/JRList/releases">Releases</a> ·
  <a href="./PRIVACY.md">Privacy Policy</a>
</p>

---

Helper for **authorized** penetration testing, bug bounty, and frontend recon.

> Use only on targets you are allowed to test.

---

## Features

| Area | What JRList does |
|------|------------------|
| Frameworks | Detects Nuxt / Vue / Next (`__NUXT__`, `__NEXT_DATA__`, Vue Router, `__next_f`, …) |
| Sources | DOM attributes, inline scripts, comments, framework payloads, `_nuxt` / `_next` bundles |
| baseURL | Joins relative paths using `baseURL` / `apiBase` / Nuxt `app.baseURL` / Next `basePath` (avoids duplicate joins like `/v1/v1`) |
| Categories | `base`, `api`, `nuxt`, `next`, `auth`, `admin`, `absolute`, `path` |
| Export | Search / filter, clipboard copy, TXT / JSON |
| Injection | On-demand only when you click **Scan** (no always-on content scripts) |

---

## Install

### Recommended — Load unpacked

```bash
git clone https://github.com/KaiHT-Ladiant/JRList.git
cd JRList
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this repository root (`manifest.json`)

### Releases (CRX / ZIP)

Download from [Releases](https://github.com/KaiHT-Ladiant/JRList/releases).

| File | Notes |
|------|--------|
| `JRList.zip` | Prefer for Web Store upload / unpack |
| `JRList.crx` | Locally signed archive only |

> Installing a non–Web Store `.crx` often fails with **`CRX_REQUIRED_PROOF_MISSING`**. That is Chrome policy, not a broken file. Use **Load unpacked**, or install a Web Store–published build when available.

---

## Usage

1. Open a target page  
2. Click the **JRList** toolbar icon  
3. Click **Scan**  
4. Filter and export (Copy / TXT / JSON)

| Option | Description |
|--------|-------------|
| JS bundle scan | Fetch `script[src]` and extract more URL patterns (ON by default) |

---

## How it works

1. Popup injects content scripts into the active tab  
2. MAIN-world harvest reads framework globals (`__NUXT__`, `__NEXT_DATA__`, …) despite CSP  
3. DOM / scripts / bundles are parsed; `baseURL` values resolve relative paths  
4. Heuristic endpoints (e.g. Nuxt `_payload.json`, Next `/_next/data/...`) are added **only when real references exist**

---

## Build locally

```bash
py -m pip install cryptography
py scripts/pack_crx.py
```

| Output | Description |
|--------|-------------|
| `dist/JRList.zip` | Extension package (Web Store upload) |
| `dist/JRList.crx` | Locally signed CRX3 |
| `keys/extension.pem` | Signing key — **never commit or share** |

Optional store assets (local only, under `dist/store/`):

```bash
py scripts/prepare_store_assets.py
```

Web Store listing checklist: [docs/chrome-web-store.md](./docs/chrome-web-store.md)

---

## Project structure

```text
JRList/
├── manifest.json
├── background/service-worker.js
├── content/content.js
├── lib/
│   ├── url-parser.js
│   └── page-bridge.js
├── popup/
├── icons/
├── assets/cover.png
├── scripts/
│   ├── pack_crx.py
│   ├── generate_icons.py
│   └── prepare_store_assets.py
├── docs/chrome-web-store.md
├── PRIVACY.md
├── README.md
├── README.ko.md
└── LICENSE
```

---

## Permissions

| Permission | Purpose |
|------------|---------|
| `activeTab` | Scan the active tab after user action |
| `scripting` | Inject scan helpers on **Scan** |
| `storage` | Keep last result in session storage (device-local) |
| `clipboardWrite` | Copy results when user clicks Copy |
| `host_permissions` (`http`/`https`) | Read pages and same-origin JS bundles |

JRList does **not** send scan data to the developer. See [PRIVACY.md](./PRIVACY.md).

---

## Limitations

- Cross-origin JS may be unreadable (CORS)
- Obfuscated / runtime-only URLs may be missed
- Recon-style extensions can trigger AV/EDR false positives

---

## Contributing

Issues and pull requests are welcome.

### Contributors

- Community contributors via pull requests

---

## Disclaimer

For **authorized security research and testing** only. Authors and contributors are not responsible for misuse.

## License

[MIT](./LICENSE)
