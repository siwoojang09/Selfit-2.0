# Selfit 2.0

내가 가진 옷의 실측 치수를 기준으로 다른 브랜드의 비슷한 핏과 사이즈를 찾아보고,
3D 드레싱룸에서 실제 착장을 확인하는 웹 앱입니다.

이 저장소는 공개된 Selfit 2.0 웹 앱(`https://drape-studio-fabric-lab.sunlitcity8.chatgpt.site/`)의
정적 소스 파일과 에셋을 그대로 내려받아 보관한 사본입니다.

## 화면 구성

| 파일 | 설명 |
| --- | --- |
| `index.html` | 홈 / 탐색 화면. 히어로, 옷장, 핏 매칭 결과를 해시 라우팅(`#home`, `#fit`, `#body` 등)으로 보여줍니다. `#fit`, `#body`로 들어오면 `fitting.html`로 이동합니다. |
| `fitting.html` | 3D 드레싱룸. 샘플 옷장, 3D 착장 뷰, 실측 핏 분석, 사이즈 비교, 샘플 등록(택 촬영 OCR / 직접 입력)을 제공합니다. |

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

scene.mjs             3D 씬 구성, 직물 텍스처, 보행 시뮬레이션
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

## 참고

- 원본 사이트에서 내려받으면서 Cloudflare 챌린지 주입 스크립트(`window.__CF$cv$params`)만 제거했습니다.
  그 외 HTML/CSS/JS/에셋은 원본과 동일합니다.
- 원본 서버는 `/fitting` 경로로 `fitting.html`을 제공하므로, 이 저장소에서는 해당 내용을 `fitting.html`로 저장했습니다.
- `vendor/ocr/`의 학습 데이터(`eng.traineddata.gz`, `kor.traineddata.gz`)와 OCR 엔진은 원본 사이트에 있던 파일입니다.
- 이 저장소는 Public입니다. 정적 사이트이므로 GitHub Pages(main 브랜치, `/` 경로)로 그대로 배포할 수 있습니다.
- 원본 사이트의 상품 사진·착장 사진·브랜드명 등은 해당 권리자에게 권리가 있으며, 원본 데모를 보관·열람하기 위한 사본임을 감안해 주세요.
