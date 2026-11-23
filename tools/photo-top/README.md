# 사진 기반 상의 에셋 빌드 (원단 타일 + 아틀라스)

`assets/nike-sport-tee-white.glb`가 이 파이프라인의 첫 결과입니다. 상품 사진의 원단
근접 촬영에서 **원단 타일**(색·노멀·러프니스)을 뜨고, 패턴의 UV 공간에 실제 배율로 깔아
아틀라스를 만든 뒤, 가슴의 그래픽(스우시·프린트·포니)을 사진에서 알파로 떠서 제 위치에
찍습니다.

## 파이프라인

    configs/<id>.json  이 옷의 사진·자르기·타일 크기·그래픽 위치·조각별 재질
    fabric.py          근접 촬영 → tile-color / tile-normal / tile-rough
    dump_pieces.py     실제 패턴 빌더를 QuickJS로 돌려 조각별 정점·UV (dump.mjs)
    build.py           아틀라스 합성 + GLB 패킹
    preview.py         GLB를 소프트웨어 래스터라이저로 그려 검사

## 실행

    python3 tools/photo-top/fabric.py nike-sport-tee-white
    python3 tools/photo-top/dump_pieces.py nike-sport-tee-white
    python3 tools/photo-top/build.py nike-sport-tee-white
    ASSET=nike-sport-tee-white.glb python3 tools/photo-top/preview.py front

## 아틀라스 규약

몸판 패널의 UV를 그대로 씁니다: u는 정면 중심에서 한 바퀴(각도/2π, 0.25가 옆선, 0.5가
등 중심), v는 목·어깨 꼭대기에서 밑단까지입니다. 원단 타일은 `atlas.circumference`와
`atlas.length`로 나눈 반복 수만큼 미러 반복되어, 사이즈가 달라도 결의 크기가 같습니다.
아틀라스 좌우 끝은 32px 크로스페이드해 중심 앞선이 이어집니다.

그래픽은 `decals`에 적습니다: 사진과 자르기, 임계값(어두운 정도 → 알파), 중심
`[둘레 비율, 어깨선 아래 m]`, 크기 `[가로 m, 세로 m]`, 잉크 색. 스우시는 2048 아틀라스에서
7.5cm가 154px이 되어 가장자리가 선명합니다.

## 재질

조각 이름으로 나눕니다(config의 `pieces`):

    atlas   Measured garment body
    tile    Sleeve, Folded bottom hem, Button placket, Point collar
    rib     Neck binding, Sleeve cuff, Turned cuff edge, Ribbed waistband
    shade   Folded hood, Lined hood opening   (같은 원단, 이중 천이라 한 톤 낮게)
    thread  Body finish topstitching, Cuff join stitching
    button  Button

`shade` 조각은 `tile` 과 같은 사진 타일을 `shade.gain`(기본 0.9)만큼 낮춰 입습니다.
후드처럼 몸판 위에 겹쳐 놓인 이중 천은 같은 톤이면 윤곽이 사라집니다.

결을 가로질러 재단하는 조각(칼라)은 `uv_swap` 에 이름을 적으면 u·v 를 바꿔
타일을 입힙니다. 스트라이프가 칼라 길이 방향으로 흐르게 됩니다.

소매 UV는 `sleeve_repeat`로 소매 둘레·길이를 타일 크기에 맞춥니다(티: 8×5.5).
사진 상의는 런타임에서 박음질 튜브를 짓지 않습니다(사진에 이미 스티치가 있습니다).

## 한 벌뿐인 옷

`photo-top.mjs`의 `PHOTO_TOPS`에 든 id는 사진 에셋이 유일한 옷입니다. 에셋이 도착하기
전에는 옷을 짓지 않고, 도착하면 그 표면으로 다시 짓습니다.

## 알려진 한계

플랫레이가 아니라 착장 사진만 있는 옷은 목선 안쪽의 인체 메쉬 이음부가 보일 수 있습니다.
원단 타일은 미러 반복이라 아주 강한 대각 주름이 있는 원단은 반복 무늬가 보일 수 있으니,
그런 원단은 `colour_detail`을 낮춰 색은 단색으로 두고 노멀이 결을 맡게 합니다.
