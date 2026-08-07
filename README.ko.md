<p align="center">
  <img src="assets/cover.png" alt="JRList cover" width="720" />
</p>

<h1 align="center">JRList</h1>

<p align="center">
  <strong>J</strong>S URL <strong>R</strong>econ <strong>List</strong><br />
  Nuxt.js · Vue.js · Next.js 페이지에서 URL·라우트·API 경로를 추출하는<br />
  Chrome Extension (Manifest V3)
</p>

<p align="center">
  <a href="https://github.com/KaiHT-Ladiant/JRList/releases"><img alt="Release" src="https://img.shields.io/github/v/release/KaiHT-Ladiant/JRList?include_prereleases&label=release" /></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg" /></a>
  <a href="./PRIVACY.md"><img alt="Privacy" src="https://img.shields.io/badge/privacy-policy-important" /></a>
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="https://github.com/KaiHT-Ladiant/JRList/releases">Releases</a> ·
  <a href="./PRIVACY.md">개인정보처리방침</a>
</p>

---

**허가된** 펜테스트·버그바운티·프론트 리콘용 보조 도구입니다.

> 허가받은 대상에만 사용하세요.

---

## 기능

| 구분 | 내용 |
|------|------|
| 프레임워크 | Nuxt / Vue / Next 감지 (`__NUXT__`, `__NEXT_DATA__`, Vue Router, `__next_f` 등) |
| 수집 소스 | DOM, 인라인 JS, 주석, 프레임워크 payload, `_nuxt` / `_next` 번들 |
| baseURL | `baseURL` / `apiBase` / Nuxt `app.baseURL` / Next `basePath`로 상대경로 결합 (`/v1/v1` 중복 방지) |
| 카테고리 | `base`, `api`, `nuxt`, `next`, `auth`, `admin`, `absolute`, `path` |
| 내보내기 | 검색·필터, 클립보드, TXT / JSON |
| 주입 | **스캔** 클릭 시에만 (상시 content script 없음) |

---

## 설치

### 권장 — 압축해제 로드

```bash
git clone https://github.com/KaiHT-Ladiant/JRList.git
cd JRList
```

1. `chrome://extensions`
2. **개발자 모드** ON
3. **압축해제된 확장 프로그램을 로드합니다** → 저장소 루트 선택

### Releases (CRX / ZIP)

[Releases](https://github.com/KaiHT-Ladiant/JRList/releases)에서 다운로드합니다.

| 파일 | 비고 |
|------|------|
| `JRList.zip` | Web Store 업로드 / 압축 해제용 |
| `JRList.crx` | 로컬 서명 아카이브 |

> Web Store 밖 `.crx`는 **`CRX_REQUIRED_PROOF_MISSING`** 이 날 수 있습니다. Chrome 정책이며 파일이 깨진 것이 아닙니다. **압축해제 로드**를 쓰거나, Web Store에 게시된 빌드를 설치하세요.

---

## 사용법

1. 대상 페이지 열기  
2. **JRList** 아이콘 클릭  
3. **스캔**  
4. 필터 후 복사 / TXT / JSON

| 옵션 | 설명 |
|------|------|
| JS 번들 스캔 | `script[src]` fetch 후 URL 추가 추출 (기본 ON) |

---

## 동작 개요

1. 팝업이 활성 탭에 content script 주입  
2. MAIN world에서 프레임워크 전역 수집 (CSP 대응)  
3. DOM / 스크립트 / 번들 파싱 및 baseURL 결합  
4. Nuxt `_payload.json`, Next `/_next/data/...` 등은 **실제 참조가 있을 때만** 추가

---

## 로컬 빌드

```bash
py -m pip install cryptography
py scripts/pack_crx.py
```

| 출력 | 설명 |
|------|------|
| `dist/JRList.zip` | 확장 패키지 (Web Store 업로드) |
| `dist/JRList.crx` | 로컬 서명 CRX3 |
| `keys/extension.pem` | 서명키 — **커밋/공유 금지** |

스토어 에셋(로컬 `dist/store/`):

```bash
py scripts/prepare_store_assets.py
```

체크리스트: [docs/chrome-web-store.md](./docs/chrome-web-store.md)

---

## 프로젝트 구조

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

## 권한

| Permission | 용도 |
|------------|------|
| `activeTab` | 사용자 액션 후 현재 탭 스캔 |
| `scripting` | **스캔** 시 헬퍼 주입 |
| `storage` | 세션 결과 로컬 저장 |
| `clipboardWrite` | 복사 버튼 |
| `host_permissions` (`http`/`https`) | 페이지·same-origin 번들 접근 |

스캔 데이터를 개발자에게 전송하지 않습니다. → [PRIVACY.md](./PRIVACY.md)

---

## 한계

- Cross-origin JS는 CORS로 못 읽을 수 있음  
- 난독화·런타임 조합 URL은 놓칠 수 있음  
- AV/EDR 오탐 가능  

---

## 기여

Issue / PR 환영합니다.

### Contributors

- Community contributors via pull requests

---

## Disclaimer

**허가된 보안 연구·테스트** 전용입니다. 오남용에 대한 책임은지지 않습니다.

## License

[MIT](./LICENSE)
