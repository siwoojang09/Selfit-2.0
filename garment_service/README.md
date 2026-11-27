# Selfit 2.0 무신사 후드 집업 가져오기

`fitting.html` → **샘플 등록** → **무신사 링크로 가져오기** → 상품·정면 사진·실측 확인 → **3D 생성** → **옷장에 저장하고 입혀보기**. 가져온 상품은 자체 포함형 GLB를 다운로드할 수 있습니다. GLB에는 M 또는 첫 번째 사이즈의 기준 메시가 들어갑니다. 피팅룸은 사이즈와 체형을 바꿀 때 동일한 재질을 새 패턴에 적용합니다.

## 로컬 실행

저장소 루트에서 Python 3.11 이상과 Node 22 이상을 사용합니다. 아래 예시는 임시 서버 자료를 웹 루트 밖에 둡니다.

```bash
python -m venv /tmp/selfit-venv
/tmp/selfit-venv/bin/pip install -r garment_service/requirements.txt
SELFIT_GARMENT_DATA=/tmp/selfit-garment-data \
  /tmp/selfit-venv/bin/python -m uvicorn garment_service.api:app --host 127.0.0.1 --port 8787 --no-access-log
```

다른 터미널에서 `python -m http.server 3187 --bind 127.0.0.1`을 실행하고 [피팅룸](http://127.0.0.1:3187/fitting.html)을 엽니다. HTTPS 호스트가 입력되기 전에도 GitHub Pages에서 KC9315 샘플을 체험할 수 있습니다.

Docker 이미지에는 [U²-Net 경량 모델의 ONNX 가중치](https://github.com/danielgatis/rembg/releases/tag/v0.0.0)가 포함됩니다. 로컬에서 모델을 쓰려면 같은 파일을 받고 SHA-256 `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`을 확인한 뒤 파일 경로를 `SELFIT_U2NETP_MODEL`에 설정합니다. 모델을 바꿀 때 `SELFIT_U2NETP_VERSION`도 바꿉니다. 투명 PNG는 알파 채널을 사용합니다. 모델 없이 구동하면 단색 배경 분리를 사용합니다.

## 상품 데이터

- **KC9315**는 저장소에 포함된 상품 사진·실측표·기존 정밀 GLB로 재현합니다. 실측이나 사진을 바꾸면 같은 패턴의 새 GLB를 생성합니다.
- **허가받은 상품 피드**는 `SELFIT_MUSINSA_FEED=/feeds`로 연결합니다. `/feeds/<무신사 상품번호>.json`에 `name`, `brand`, `sku`, `color`, `type: "ziphoodie"`, `front`, 선택 `back`, `sizes`를 둡니다. 사진은 같은 폴더에 있는 파일명으로 지정합니다. `sizes` 행의 형식은 `{"label":"M","length":62,"shoulder":62,"chest":60.5,"sleeve":58,"hem":null}`입니다.
- **공개 페이지 어댑터**는 사용 허가를 확인한 환경에서 `SELFIT_MUSINSA_PUBLIC=1`로 켭니다. 사이트의 자동 접근 설정을 확인한 뒤 공개 Product JSON-LD, cm 실측표, 허용된 이미지 CDN을 읽습니다. 동적 페이지나 접근 제한으로 필수 값이 없으면 직접 추가 화면으로 전환됩니다. 링크 입력 외 네트워크 요청에는 사용자 자격 증명을 보내지 않습니다.
- **직접 보완**은 바닥에 펼친 정면 사진과 총장·어깨너비·가슴단면·소매길이가 필요합니다. 뒷면과 밑단단면은 선택입니다. 정면만 있으면 뒷면은 대표 색상으로 추정합니다. 원단 물리는 코튼 프리셋을 사용합니다.

## HTTPS 배포

```bash
docker build -f garment_service/Dockerfile -t selfit-garment .
docker run --rm -p 8787:8787 -v selfit-garment:/data selfit-garment
```

컨테이너 앞단에 HTTPS를 설정한 뒤 `fitting.html`의 `selfit-garment-api` 메타 태그에 API 주소를 입력합니다. `SELFIT_ALLOWED_ORIGINS`는 쉼표로 구분하며 기본값은 로컬 3187과 `https://siwoojang09.github.io`입니다. 운영 서버는 쓰기 가능한 영속 볼륨을 붙인 단일 워커로 실행합니다. 공개 API 앞단에서 요청당 33MiB 업로드 한도와 방문자별 요청 빈도를 제한할 수 있습니다.

작업 상태와 재시도 정보는 SQLite에 저장합니다. 워커를 다시 시작하면 진행 중이던 작업을 재개합니다. 임시 상품 사진과 결과 URL은 3일간 유지되며, 동일한 사진과 실측의 버전별 생성 결과는 작업이 끝난 뒤 최소 14일간 재사용할 수 있습니다. 저장한 상품은 IndexedDB에 사진과 GLB를 보관하므로 작업 URL 만료 뒤에도 다시 입혀볼 수 있습니다.

실상품 검증은 KC9315를 기준으로 진행하고, 허가된 미등록 후드 집업 15종을 확보한 뒤 사진·실측 자동 수집, 파일 생성, 피팅 성공 기준으로 완료율을 측정합니다. 실측 자체를 기준으로 검증하며 사이즈표에 없는 값을 실측으로 기록하지 않습니다.
