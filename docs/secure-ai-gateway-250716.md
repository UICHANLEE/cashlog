# Cashlog 보안 AI 게이트웨이 운영안 (250716)

## 1. 결정 사항

운영 목표 구조는 아래 한 가지로 고정한다.

```text
React Native / Web
  | HTTPS + Supabase user JWT
  v
Cloudflare Tunnel
  v
Home Server
  |- Nginx: body limit, timeout, security headers
  |- NestJS: JWT validation, authorization, business logic
  |- Redis: private bind only
  `- Tailscale
       | private WireGuard transport
       v
Galaxy AI Worker: FastAPI + ONNX
```

- 공유기 포트포워딩은 사용하지 않는다.
- Cloudflare는 사용자와 Home Backend 사이만 담당한다.
- Galaxy AI Worker는 인터넷에 공개하지 않는다.
- Home Backend와 Galaxy 사이는 Tailscale grant와 AI API key를 함께 적용한다.
- Supabase service role, AI API key, Cloudflare token, Redis password는 앱에 넣지 않는다.
- NestJS는 요청 body의 `userId`를 신뢰하지 않고 검증한 Supabase JWT의 `sub`만 사용자 ID로 사용한다.

초기 검증용 `Cloudflare -> Galaxy -> SSH reverse tunnel -> Mac` 구성은 과도기 모드로만 사용한다. 장기 운영에서는 Cloudflare Tunnel의 origin을 Home Backend로 옮기고 Galaxy는 tailnet 안으로 숨긴다.

## 2. 이 브랜치가 준비한 것

현재 Cashlog는 Vite + Vercel Function 구조이므로 NestJS Home Backend 자체는 아직 이 저장소에 없다. 대신 전환 과정에서 필요한 계약을 먼저 구현했다.

- `PRODUCT_ANALYZER_API_URL`로 모델 게이트웨이 지정
- Vercel Function이 `X-API-Key`를 서버에서만 추가
- 선택적으로 Cloudflare Access service token 헤더 추가
- 배포 환경에서 인증 정보가 없으면 모델 호출을 거부하는 fail-closed 설정
- 모델 호출 1~120초 timeout
- `/uichan`에서 키 값 없이 인증 방식과 health 결과만 확인
- Galaxy 과도기 게이트웨이: `infra/galaxy-gateway/proxy_server.py`
- 로컬 Vite proxy와 점검 스크립트도 같은 서버 전용 인증 헤더 사용

비밀 환경변수에는 절대 `VITE_` 접두사를 붙이지 않는다. `VITE_` 변수는 브라우저 번들에 들어간다.

## 3. 먼저 검증할 과도기 구성

Cloudflare를 연결하기 전에 각 구간을 아래 순서로 확인한다.

### 3.1 Mac 모델 서버

```bash
cd /Users/uichan/workspace/catai
python -m uvicorn model_server:app --host 127.0.0.1 --port 8010
curl http://127.0.0.1:8010/health
```

실제 Catai CLI를 사용한다면 기존 실행 명령을 사용해도 된다. 중요한 조건은 Mac 모델 서버가 `127.0.0.1:8010`에만 bind되는 것이다.

### 3.2 Mac에서 Galaxy로 SSH reverse tunnel

Galaxy SSH는 키 로그인을 먼저 확인한 뒤 아래 옵션을 적용한다.

```text
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
AllowTcpForwarding yes
GatewayPorts no
```

Mac에서 테스트 터널을 실행한다.

```bash
ssh -p 8022 -N -T \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -R 127.0.0.1:18010:127.0.0.1:8010 \
  TERMUX_USER@GALAXY_TAILSCALE_IP
```

Galaxy에서만 성공해야 한다.

```bash
curl http://127.0.0.1:18010/health
```

다른 장비에서 `http://GALAXY_WIFI_IP:18010/health`는 실패해야 한다.

### 3.3 Galaxy 스트리밍 게이트웨이

```bash
pkg install python
cd cashlog/infra/galaxy-gateway
python -m pip install -r requirements.txt
python -c 'import secrets; print(secrets.token_urlsafe(48))'
```

출력된 키를 안전한 비밀 저장소에 보관하고 Galaxy에서 실행한다.

```bash
export PUBLIC_API_KEY='방금-생성한-키'
export MODEL_BASE_URL='http://127.0.0.1:18010'
python -m uvicorn proxy_server:app \
  --host 127.0.0.1 \
  --port 8000 \
  --workers 1 \
  --no-access-log
```

health도 기본적으로 API key가 필요하다.

```bash
curl -H "X-API-Key: $PUBLIC_API_KEY" http://127.0.0.1:8000/health
```

`ALLOW_PUBLIC_HEALTH=true`는 로컬 실험 외에는 사용하지 않는다.

## 4. Cloudflare 과도기 연결

Vercel Function에서 Galaxy 게이트웨이를 호출해야 하는 기간에만 사용한다.

1. Cloudflare Tunnel `galaxy-gateway`를 만든다.
2. `ai-gateway.example.com`의 service를 `http://127.0.0.1:8000`으로 지정한다.
3. Cloudflare Access self-hosted application을 같은 hostname에 만든다.
4. Service Auth policy에서 service token만 허용한다.
5. `/analyze-image`는 `POST`, `/health`는 인증된 `GET`만 허용한다.
6. Gateway hostname에는 서버 호출량 기준의 완만한 제한을 둔다. 이 구간에서 Cloudflare가 보는 IP는 Vercel 출구 IP일 수 있으므로 IP당 5회 같은 사용자 제한을 걸면 전체 사용자가 함께 차단될 수 있다.
7. 사용자별 제한은 공개 Cashlog API 또는 NestJS에서 JWT의 `sub`와 신뢰할 수 있는 client IP를 기준으로 적용한다.
8. 실제 이미지는 Cashlog가 10MB로 검증하고 Galaxy transport는 multipart overhead를 포함해 11MB로 제한한다. Cloudflare에서도 `Content-Length` 기반 WAF 규칙을 쓸 수 있지만, 최종 제한은 Nginx와 gateway에서 다시 검증한다.

Galaxy Termux에서 `cloudflared`가 바로 실행되는지는 먼저 `pkg search cloudflared`와 `cloudflared --version`으로 확인한다. Android/Termux 호환 문제가 있으면 proot Debian을 사용하거나, 최종 구조대로 cloudflared를 Home Server에 두는 편이 안정적이다.

Vercel Production 환경변수:

```env
PRODUCT_ANALYZER_API_URL=https://ai-gateway.example.com/analyze-image
PRODUCT_ANALYZER_API_KEY=Galaxy의-PUBLIC_API_KEY와-같은-값
PRODUCT_ANALYZER_REQUIRE_AUTH=true
PRODUCT_ANALYZER_TIMEOUT_MS=60000
CLOUDFLARE_ACCESS_CLIENT_ID=Access-service-token-client-id
CLOUDFLARE_ACCESS_CLIENT_SECRET=Access-service-token-client-secret
```

환경변수를 저장한 뒤 재배포한다. 이 값들은 Vercel 서버에서만 읽으며 React/브라우저로 전달되지 않는다.

## 5. 최종 Tailscale 구성

Home Server와 Galaxy가 전용 서버 장비라면 tag 기반 grant를 권장한다.

```json
{
  "tagOwners": {
    "tag:cashlog-backend": ["autogroup:admin"],
    "tag:cashlog-ai": ["autogroup:admin"]
  },
  "grants": [
    {
      "src": ["tag:cashlog-backend"],
      "dst": ["tag:cashlog-ai"],
      "ip": ["tcp:8000"]
    }
  ]
}
```

tag를 적용한 장비는 사람 사용자의 identity가 아니라 service identity로 취급된다. 개인용 Galaxy나 Mac에 무심코 tag를 붙이지 말고, 전용 AI 장비로 운영할 때만 적용한다. 개인 장비를 계속 써야 하면 Tailscale 관리 화면의 실제 사용자/device selector로 동일한 단방향 grant를 작성한다.

최종 모드에서는 Galaxy gateway를 Galaxy의 Tailscale IP에 bind하고 Home Backend만 접근하게 한다.

```bash
python -m uvicorn proxy_server:app \
  --host GALAXY_TAILSCALE_IP \
  --port 8000 \
  --workers 1 \
  --no-access-log
```

Home Backend의 서버 전용 환경변수는 다음과 같다.

```env
PRODUCT_ANALYZER_API_URL=http://GALAXY_TAILSCALE_IP:8000/analyze-image
PRODUCT_ANALYZER_API_KEY=Galaxy의-PUBLIC_API_KEY와-같은-값
PRODUCT_ANALYZER_REQUIRE_AUTH=true
```

이 단계에서는 Cloudflare Access service token이 Galaxy 호출에 필요하지 않다. Tailscale transport가 암호화되므로 tailnet 내부 HTTP를 사용할 수 있지만 API key와 grant는 계속 유지한다.

## 6. 사용자 인증 경계

앱의 요청 흐름은 다음과 같아야 한다.

1. 앱이 Supabase Auth로 로그인한다.
2. 앱은 사용자 access token만 Home Backend에 `Authorization: Bearer ...`로 보낸다.
3. NestJS가 JWT 서명, issuer, audience, expiry를 검증한다.
4. NestJS가 token의 `sub`를 사용자 ID로 사용한다.
5. NestJS가 AI API key를 붙여 Galaxy에 요청한다.
6. Galaxy는 사용자 JWT나 Supabase service role을 알 필요가 없다.

공통 AI API key를 React Native나 웹 번들에 넣으면 앱 역분석으로 유출되므로 금지한다.

## 7. 운영 검증 체크리스트

아래 항목이 모두 통과하기 전에는 공개 hostname을 운영 트래픽에 연결하지 않는다.

- Mac `127.0.0.1:8010/health` 성공
- Galaxy `127.0.0.1:18010/health` 성공
- 다른 장비의 `GALAXY_IP:18010` 실패
- Galaxy gateway API key 없음/오류 요청이 401
- 잘못된 MIME이 415, 11MB 초과 transport가 413
- 모델 중단 시 503, timeout 시 504
- Cloudflare Access token 없음 요청 실패
- 올바른 Access token + API key 요청 성공
- `/uichan`에 secret 값이 표시되지 않음
- 이미지·토큰·개인정보가 access log에 남지 않음
- Galaxy 재부팅 후 Termux:Boot 또는 운영 스크립트로 gateway와 tunnel 복구
- Android 배터리 최적화 예외와 발열/throttling 확인

저장소 점검 명령:

```bash
npm run test
npm run build
PRODUCT_ANALYZER_URL=https://ai-gateway.example.com \
PRODUCT_ANALYZER_API_KEY='...' \
CLOUDFLARE_ACCESS_CLIENT_ID='...' \
CLOUDFLARE_ACCESS_CLIENT_SECRET='...' \
npm run check:product-analyzer -- /path/to/sample.jpg
```

## 8. 아직 별도 구현이 필요한 것

- Home Server의 NestJS 인증/인가 API
- Nginx reverse proxy와 body/timeout 정책
- Redis private network 구성
- Supabase JWT 검증과 refresh 정책
- 분석 job queue, retry, idempotency, graceful fallback
- Galaxy 프로세스 자동 재시작과 모니터링
- 원본 이미지 보존 기간, 삭제 job, 암호화 정책

이 항목들은 Home Backend 저장소가 정해진 뒤 그 저장소에서 구현한다. Cashlog 프론트 저장소에 service role key나 Redis 비밀번호를 추가해서 대신하지 않는다.

## 9. 공식 참고 자료

- Cloudflare Tunnel: <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/>
- Cloudflare Access service token: <https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/>
- Cloudflare Rate Limiting Rules: <https://developers.cloudflare.com/waf/rate-limiting-rules/>
- Tailscale grants: <https://tailscale.com/docs/features/access-control/grants>
- Tailscale tags: <https://tailscale.com/docs/features/tags>
