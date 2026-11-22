# Selfit 2.0

내가 가진 옷의 실측 치수를 기준으로 다른 브랜드의 비슷한 핏과 사이즈를 찾아보고,
3D 드레싱룸에서 실제 착장을 확인하는 웹 앱입니다.

이 저장소는 공개된 Selfit 2.0 웹 앱(`https://drape-studio-fabric-lab.sunlitcity8.chatgpt.site/`)의
정적 소스 파일과 에셋을 그대로 내려받아 보관한 사본입니다.

## 화면 구성

| 파일 | 설명 |
| --- | --- |
| `index.html` | 홈 / 탐색 화면. 히어로, 옷장, 핏 매칭 결과를 해시 라우팅(`#home`, `#fit`, `#body` 등)으로 보여줍니다. `#fit`, `#body`로 들어오면 `fitting.html`로 이동합니다. |
| `fitting.html` | 3D 드레싱룸. 왼쪽 샘플 옷장, 가운데 턴테이블 위의 3D 무대, 오른쪽 착용 룩과 실측 핏 분석의 3단 레이아웃입니다. 샘플 등록(택 촬영 OCR / 직접 입력), 사이즈 비교, 보행 시뮬레이션을 제공합니다. |
| `mobile-check.html` | 개발 확인용. `fitting.html`을 390×844와 430×900 프레임에 넣어 모바일 레이아웃을 봅니다. |

## 폴더 구조

```
index.html            홈(탐색) 페이지
fitting.html          드레싱룸 페이지
discovery.css         홈 화면 스타일
compare-fit.css       핏 비교 도표 스타일
style.css             드레싱룸 스타일
register-fit.css      샘플 등록 폼 스타일

discovery.mjs         홈 화면 진입점
app.js                드레싱룸 진입점 (engine.js 뒤에 모듈로 로드)
engine.js             드레싱룸 부트스트랩 (scene.mjs 로드)

catalog-data.mjs      기본 샘플(실측표) 데이터 + IndexedDB 저장소
fit-matches.mjs       브랜드별 비교 상품 데이터와 핏 매칭
reference-store.mjs   내 옷(기준 옷) 실측 저장
compare-fit.mjs       사이즈 비교 도표(SVG) 생성
register-fit.mjs      샘플 등록 UI, 택 OCR(Tesseract.js) 연동

photo-denim.mjs       실사 사진 데님 에셋 로더 (assets/washed-denim-medium-blue.glb)
photo-hoodie.mjs      실사 사진 집업 에셋 로더 (assets/adidas-kc9315.glb)

scene.mjs             3D 씬 구성(웜 스톤 배경, 턴테이블 대좌), 직물 텍스처, 보행 시뮬레이션
mannequin.mjs         3D 마네킹 생성
body-library.mjs      인체 메쉬 로더 (female/male)
body-skin.mjs         인체 메쉬 스키닝
anatomy-assets/       인체 메쉬 바이너리(load.mjs, female.bin, male.bin)
hoodie-fit.mjs        상의 패턴/핏 계산
pants-fit.mjs         하의 패턴/핏 계산
measured-pants.mjs    실측 바지 단면 데이터
fit-body-sections.mjs 신체 단면 데이터
wardrobe.mjs          옷장(행거) 3D 구성
projection.mjs        실사 사진 → 3D 의상 투영
sample-garment.mjs    샘플 의상 메쉬 생성
cloth.mjs             천 물리
garment-contact.mjs   의상 접촉 처리
hoodie-finishes.mjs   후드 집업 마감(지퍼, 소맷단 등)
hoodie-textile.mjs    직물 타일 텍스처 적용
software.mjs          WebGL 미지원 시 소프트웨어 렌더러

catalog/              샘플 상품 이미지 (webp)
discovery-art/        홈 화면 상품/히어로 이미지
looks/                모델·코디별 착장 사진
textures/             직물 텍스처 타일
hero.webp             기준 착장 사진(projection 용)
vendor/three.module.js  Three.js (r160 계열 단일 모듈 파일)
vendor/GLTFLoader.js  실사 사진 에셋(GLB) 로더
vendor/ocr/           Tesseract.js OCR 엔진과 한/영 학습 데이터
assets/               실물 사진으로 구운 의상 에셋 (GLB)
tools/photo-denim/    청바지 에셋 빌드 파이프라인 (사진 → 아틀라스 → GLB)
tools/photo-hoodie/   아디다스 집업 에셋 빌드 파이프라인
```

## 드레싱룸 화면 구성

세 단으로 나뉜 웜 스톤(따뜻한 회백색) 에디토리얼 레이아웃입니다.

| 영역 | 내용 |
| --- | --- |
| 왼쪽 옷장 | 브랜드 헤더(`Selfit 2.0`), 검색, 분류 탭(전체·아우터·상의·하의), 브랜드 칩(ALL·ADIDAS·DRAPE STUDIO), 2열 샘플 카드(하트 위시리스트) |
| 가운데 무대 | 턴테이블 대좌 위의 3D 착장. 상단 알약(착장·3D 체형 / 여성·남성), 왼쪽 도구 레일(전체 화면·확대·축소·기본 시점·정지 착장·환경 설정), 오른쪽 착용 아이템 썸네일, 하단 보행·디테일·`360°` 표시 |
| 오른쪽 룩 | `Your Look`(착용 상·하의 카드), `Style & Fit`(실측 여유 막대, 사이즈 알약, 신체 치수 설정, 3D 착장 버튼, 실측표), `Recommended` |

모바일(≈820px 이하)에서는 무대 → 룩 → 옷장 순으로 세로로 쌓입니다.
색은 `#F8F7F4` 바탕, 흰 카드와 `#EAE7E1` 헤어라인, 세리프 제목, 숯색 `#1A1A1A` 알약 버튼입니다.

## 실행 방법

ES 모듈과 `fetch`/`import.meta.url`을 사용하므로 `file://`로 열면 동작하지 않습니다.
정적 서버로 열어 주세요.

```bash
python3 -m http.server 8080
# 브라우저에서 http://localhost:8080/ 접속
```

## 기술 스택

- 바닐라 JavaScript(ES 모듈), HTML, CSS — 프레임워크나 빌드 도구 없음
- Three.js (`vendor/three.module.js`)로 3D 착장·보행 시뮬레이션
- Tesseract.js (`vendor/ocr/`)로 옷 택 OCR (한국어 + 영어)
- IndexedDB(`drape-sample-wardrobe`)에 사용자가 등록한 샘플과 실측 저장
- 캐시: 모든 로컬 모듈 import와 `fitting.html`의 스크립트 태그가 같은 `?v=` 문자열을 달고 있고,
  사진 에셋은 `photo-*.mjs`의 `ASSET_VERSION`을 씁니다. 배포할 때는 **모든 파일의 문자열을 함께 올려야**
  하며(같은 URL로 두 번 배포하면 브라우저가 예전 스크립트를 계속 씁니다), `fitting.html` 자체는
  GitHub Pages가 10분간 캐시하므로 라이브 확인 시 `&u=<커밋>` 같은 파라미터로 엽니다.

## 참고

- 원본 사이트에서 내려받으면서 Cloudflare 챌린지 주입 스크립트(`window.__CF$cv$params`)만 제거했습니다.
  그 외 HTML/CSS/JS/에셋은 원본과 동일합니다.
- 원본 서버는 `/fitting` 경로로 `fitting.html`을 제공하므로, 이 저장소에서는 해당 내용을 `fitting.html`로 저장했습니다.
- `vendor/ocr/`의 학습 데이터(`eng.traineddata.gz`, `kor.traineddata.gz`)와 OCR 엔진은 원본 사이트에 있던 파일입니다.
- 이 저장소는 Public입니다. 정적 사이트이므로 GitHub Pages(main 브랜치, `/` 경로)로 그대로 배포할 수 있습니다.
- 원본 사이트의 상품 사진·착장 사진·브랜드명 등은 해당 권리자에게 권리가 있으며, 원본 데모를 보관·열람하기 위한 사본임을 감안해 주세요.
