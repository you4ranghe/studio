/* 개발용 정적 서버 — 의존성 없음.
   브라우저가 fetch()로 템플릿 파일을 읽어야 해서 file:// 로는 열리지 않습니다.
   실행: npm run dev  →  http://localhost:5173 */
const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 5173;

const TYPES = {
  '.html':'text/html; charset=utf-8',
  '.js'  :'text/javascript; charset=utf-8',
  '.css' :'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.woff2':'font/woff2',
  '.svg' :'image/svg+xml',
  '.png' :'image/png',
  '.jpg' :'image/jpeg'
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);

  // 루트는 갤러리로 "보냅니다". 여기서 파일을 바로 내주면 주소가 / 로 남아
  // ./js/build.js 같은 상대 경로가 /js/build.js 로 잘못 풀립니다. (배포 설정과 동일)
  if(rel === '/'){
    res.writeHead(302, { location: '/app/' });
    res.end();
    return;
  }
  if(rel.endsWith('/')) rel += 'index.html';

  const file = path.join(ROOT, path.normalize(rel).replace(/^([\\/])+/, ''));
  if(!file.startsWith(ROOT)){ res.writeHead(403).end('nope'); return; }

  fs.readFile(file, (err, buf) => {
    if(err){
      res.writeHead(404, {'content-type':'text/plain; charset=utf-8'});
      res.end('없는 파일입니다: ' + rel);
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store'
    });
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log('\n  스튜디오 개발 서버');
  console.log('  갤러리   http://localhost:' + PORT + '/app/index.html');
  console.log('  편집기   http://localhost:' + PORT + '/app/editor.html?t=dol-quiz\n');
});
