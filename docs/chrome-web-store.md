# Chrome Web Store — Add item checklist

JRList 로컬 CRX는 Web Store 서명이 없어 `CRX_REQUIRED_PROOF_MISSING` 이 납니다.  
일반 설치·서명이 필요하면 **Chrome Web Store에 항목(Item)을 추가**하면 됩니다.

## 1. Prepare package

```bash
py -m pip install cryptography
py scripts/pack_crx.py
```

Upload this file to the Store (not the `.crx`):

- `dist/JRList.zip`

Do **not** upload `keys/extension.pem`.

## 2. Developer Console

1. Open https://chrome.google.com/webstore/devconsole  
2. Pay the one-time developer registration fee (if not already registered)  
3. **New item** → upload `dist/JRList.zip`  
4. Fill listing fields (draft text below)  
5. Privacy / permission justifications  
6. Submit for review (Public or **Unlisted**)

## 3. Listing draft (EN)

| Field | Suggestion |
|-------|------------|
| **Name** | JRList |
| **Summary** (≤132 chars) | Extract URLs, routes, and API paths from Nuxt, Vue, and Next.js pages for authorized recon. |
| **Category** | Developer Tools |
| **Language** | English (+ Korean optional) |
| **Privacy policy URL** | `https://github.com/KaiHT-Ladiant/JRList/blob/main/PRIVACY.md` |
| **Visibility** | Unlisted (team/private share) or Public |

### Detailed description (paste)

```text
JRList (JS URL Recon List) scans the active browser tab and extracts URLs, routes, and API-related paths from Nuxt.js, Vue.js, and Next.js pages.

Features:
• Detect Nuxt / Vue / Next signatures (__NUXT__, __NEXT_DATA__, etc.)
• Parse DOM, inline scripts, and framework payloads
• Resolve paths using discovered baseURL / basePath
• Filter by category and export TXT / JSON

Intended for authorized penetration testing, bug bounty, and frontend reconnaissance only. Use only on targets you have permission to test.

Install note: For local development you can still Load unpacked from the GitHub source. Store installs receive official Chrome Web Store signing.
```

## 4. Permission justifications (paste in console)

| Permission | Justification |
|------------|----------------|
| activeTab | Scan the user’s active tab when they open the popup and click Scan. |
| scripting | Inject URL extraction helpers only on demand (Scan), not on every page load. |
| storage | Store the last scan result in session storage on the user’s device. |
| clipboardWrite | Copy extracted URLs when the user clicks Copy. |
| Host permission (http/https) | Read page HTML/JS and fetch same-origin bundles (e.g. `_nuxt`, `_next`) to discover endpoints on sites the user visits. |

**Single purpose:** Help developers/security testers list URLs and routes exposed by modern JS framework frontends on pages they choose to scan.

**Remote code:** No. All logic ships inside the extension package.

**Data usage:** No data is collected or transmitted to the developer. See PRIVACY.md.

## 5. Assets

Ready locally (gitignored under `dist/` — not uploaded to GitHub):

| Asset | File | Size |
|-------|------|------|
| Screenshot 1 | `dist/store/screenshot-1-1280x800.png` | 1280×800 |
| Screenshot 2 | `dist/store/screenshot-2-1280x800.png` | 1280×800 |
| Small promo | `dist/store/promo-small-440x280.png` | 440×280 |
| Marquee promo | `dist/store/promo-marquee-1400x560.png` | 1400×560 |
| Icon 128 | `dist/store/icon-128.png` or `icons/icon128.png` | 128×128 |

Regenerate / resize:

```bash
py scripts/prepare_store_assets.py
```

Privacy policy (host anywhere public — GitHub optional): see `PRIVACY.md` content.

## 6. After publish

- Store build is signed by Google → installs without `CRX_REQUIRED_PROOF_MISSING`
- Extension ID will differ from the local CRX id unless you upload the same public key via `manifest.key` (advanced; usually not needed)
- GitHub Release CRX remains for archive / enterprise experiments only

## Korean quick steps

1. `py scripts/pack_crx.py` → `dist/JRList.zip` 확인  
2. https://chrome.google.com/webstore/devconsole → **새 항목**  
3. ZIP 업로드 → 위 영문 설명/권한 사유 붙여넣기  
4. 개인정보처리방침 URL: `PRIVACY.md` GitHub 링크  
5. **비공개(Unlisted)** 또는 공개로 심사 제출  

공개 배포 전에 스토어 스크린샷 2장 이상 준비하는 것을 권장합니다.
