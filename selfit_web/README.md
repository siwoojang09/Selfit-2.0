# Selfit 웹 앱 실행

저장소 루트에서 Python 3.11 이상과 Node 22 이상을 준비합니다. Node는 서버가 화면과 같은 상품 목록을 읽는 데 사용합니다.

```bash
python -m venv .venv
.venv/bin/pip install -r selfit_web/requirements.txt
.venv/bin/uvicorn selfit_web.api:app --host 127.0.0.1 --port 4192
```

[로컬 앱](http://127.0.0.1:4192/)에서 회원가입, 로그인, 쇼핑, 코디와 댓글을 시험할 수 있습니다. 서로 다른 브라우저 프로필에서 두 계정으로 로그인하면 같은 코디와 댓글을 볼 수 있습니다. 계정, 코디, 테스트 주문은 `.selfit-web-data/selfit.sqlite3`에 저장됩니다. 코디와 댓글에는 닉네임만 공개됩니다. 피팅룸은 `fitting.html`, 기존 실측 핏 추천은 `discovery.html`입니다.

- 판매처가 확인된 두 상품은 무신사 상품 상세에서 실제 구매합니다. 판매가와 재고는 판매처에서 표시합니다.
- 테스트 상품은 장바구니와 주문 내역까지 확인할 수 있습니다. 결제 승인, 카드 정보와 배송지 입력은 제공하지 않습니다.
- 회원가입은 이메일 형식만 확인합니다. 인증 메일과 비밀번호 재설정은 아직 연결되어 있지 않습니다.
- 코디 신고는 SQLite의 `reports`에 저장됩니다. 운영 검토 화면은 아직 연결되어 있지 않습니다.

## 서버 배포

```bash
docker build -f selfit_web/Dockerfile -t selfit-web .
docker run --rm -p 4192:4192 -v selfit-web-data:/data \
  -e SELFIT_WEB_ORIGIN=https://selfit.example.com selfit-web
```

도메인과 HTTPS 프록시를 연결한 뒤 `SELFIT_WEB_ORIGIN`을 실제 접속 주소로 설정합니다. 공개 환경에서는 같은 HTTPS 주소에서 앱과 API를 제공합니다. GitHub Pages에서는 로그인·회원가입 화면 미리보기, 쇼핑 목록, 무신사 판매처 링크, 피팅룸과 예시 코디를 열 수 있습니다. 로그인과 공유, 주문은 서버가 있어야 작동합니다. 이미지 생성 서비스는 기존의 별도 프로세스를 유지합니다.
