# 실사 사진 기반 데님 에셋 빌드

`assets/washed-denim-medium-blue.glb`는 무신사 실물 사진(정·후면 플랫레이)에서
직접 만든 에셋입니다. 앱은 이 파일을 `GLTFLoader`로 읽어 옷의 표면으로 쓰고,
핏·사이즈·보행 변형은 기존 실측 패턴(`measured-pants.mjs`)이 계산합니다.

## 파이프라인

    photos.py      사진에서 청바지만 분리하고, 행마다 실루엣·중심·밑위 갈라짐을 잰다
    dump_pieces.py 실제 패턴 빌더를 헤드리스(QuickJS)로 돌려 조각별 정점/UV를 뽑는다
    atlas.py       각 행의 안내선에 맞춰 정·후면 사진을 원통형 아틀라스로 굽는다
    glb.py         메시 + 텍스처를 하나의 바이너리 glTF 2.0으로 묶는다
    preview.py     GLB를 소프트웨어 래스터라이저로 그려 브라우저 없이 눈으로 검사한다

## 실행

    python3 tools/photo-denim/photos.py       # 사진 분리 (원본: attachments/2026-11-22/IMG_2531, IMG_2532)
    python3 tools/photo-denim/dump_pieces.py  # 패턴 형상 덤프 (esbuild + QuickJS)
    python3 tools/photo-denim/atlas.py        # 아틀라스·노멀·러프니스
    python3 tools/photo-denim/glb.py          # assets/washed-denim-medium-blue.glb
    python3 tools/photo-denim/preview.py front

중간 산출물은 `.devtest/photo-denim/`에 남습니다(저장소에는 올리지 않음).

## 아틀라스 규약

한 장의 아틀라스가 다리 하나의 360도를 담습니다. u = 각도/2π 그대로이며

    0.00–0.25  정면, 중심 → 바깥 솔기
    0.25–0.50  후면, 바깥 솔기 → 뒤 중심
    0.50–0.75  후면, 뒤 중심 → 안쪽 솔기
    0.75–1.00  정면, 안쪽 솔기 → 중심

밑위 위(좌판)에서는 한 줄이 정·후면 판 전체 폭을 덮고, 밑위 아래(다리)에서는
그 다리의 보이는 반쪽만 덮습니다. 두 매핑은 패턴의 fork 값으로 이어 붙입니다.

## 캐시와 버전

`photo-denim.mjs`의 `ASSET_VERSION`은 GLB를 다시 구울 때 함께 올립니다. GitHub Pages가
파일을 10분간 캐시하므로, 버전을 올리지 않으면 새 원단 대신 예전 파일이 로드됩니다.

`document.documentElement.dataset.denim`에 마지막 적용 상태(`parsing …`, `worn 6`,
`failed …`)가 남습니다. 브라우저에서 `document.documentElement.dataset.denim`으로 확인합니다.
