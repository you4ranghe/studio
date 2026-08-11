# 로컬 서버 실행하기

이 프로젝트는 **빌드 도구도 없고 npm 의존성도 없습니다.** `dev.js` 하나가 정적 파일을
그대로 내주는 개발 서버 전부입니다. 필요한 건 Node.js뿐입니다.

## 준비물

- **Node.js 18 이상** (확인: `node -v`)
- `npm install`은 **필요 없습니다.** `package.json`에 dependencies가 없습니다.

## 실행

프로젝트 루트(`studio/`)에서:

```bash
npm run dev
```

`npm` 없이 직접 실행해도 똑같습니다:

```bash
node dev.js
```

터미널에 아래처럼 뜨면 성공입니다.

```
  스튜디오 개발 서버
  갤러리   http://localhost:5173/app/index.html
  편집기   http://localhost:5173/app/editor.html?t=dol-quiz
```

종료는 터미널에서 `Ctrl + C`.

## 접속 주소

| 화면 | 주소 |
|---|---|
| 갤러리(템플릿 목록) | http://localhost:5173/app/ |
| 편집기 | http://localhost:5173/app/editor.html?t=dol-quiz |

루트 `/` 로 들어가면 `/app/` 으로 302 리다이렉트됩니다. 배포(Vercel) 설정과 동일한
동작이라, 로컬에서 확인한 경로가 배포에서도 그대로 통합니다.

## 왜 서버가 필요한가요 (`index.html` 더블클릭이 안 되는 이유)

편집기가 템플릿(`templates/dol-quiz/schema.json`, `renderer.html` 등)을 `fetch()`로
읽어옵니다. 파일을 직접 열면 주소가 `file://` 이 되고, 브라우저의 CORS 정책이
`file://` 에서의 `fetch()`를 막습니다. 그래서 반드시 `http://localhost` 로 띄워야 합니다.

## 포트 바꾸기

기본 포트는 `5173`입니다. 이미 쓰고 있으면 `PORT` 환경변수로 바꿉니다.

```powershell
# PowerShell
$env:PORT = 3000; node dev.js
```

```bash
# bash / Git Bash
PORT=3000 node dev.js
```

## 문제가 생기면

**포트 충돌 — 엉뚱한 프로젝트 화면이 뜸**

`5173`은 Vite의 기본 포트라 다른 프로젝트가 이미 쓰고 있기 쉽습니다. 이 경우
`EADDRINUSE` 에러도 없이 서버가 뜬 것처럼 보이는데, 브라우저에는 그 다른 프로젝트가
나옵니다. (한쪽은 IPv6 `::1`, 다른 쪽은 IPv4에 붙어서 양쪽 다 바인딩에 성공하기
때문입니다.) 위의 방법으로 **포트를 바꾸는 게 가장 빠릅니다.**

쓰고 있는 프로세스를 직접 확인하고 싶다면:

```powershell
# PowerShell — 5173 포트를 쓰는 프로세스 확인 후 종료
Get-NetTCPConnection -LocalPort 5173 -State Listen | Select-Object OwningProcess
Stop-Process -Id <위에서 나온 번호>
```

**`없는 파일입니다: /...` 라고 404가 뜸**

주소의 경로가 실제 파일 경로와 다른 경우입니다. 서버는 프로젝트 루트를 그대로
정적 서빙하므로, `app/editor.html` 파일은 `/app/editor.html` 주소가 됩니다.

**수정한 내용이 화면에 안 나옴**

서버가 `cache-control: no-store`를 보내므로 보통은 새로고침이면 충분합니다. 그래도
남아 있으면 강력 새로고침(`Ctrl + Shift + R`)을 하세요. 참고로 이 서버에는 **핫 리로드가
없습니다.** 파일을 고치면 브라우저를 직접 새로고침해야 합니다. (`dev.js` 자체를 고쳤을
때만 서버 재시작이 필요합니다.)

## 배포와의 차이

Vercel에는 빌드 없이 정적 파일이 그대로 올라가고, 리다이렉트와 헤더는
`vercel.json`이 담당합니다. `dev.js`는 그 동작(루트 → `/app/` 리다이렉트)을 로컬에서
흉내 내는 역할이라, 로컬에서 잘 되면 배포에서도 대체로 동일하게 동작합니다.
