/* ══════════════════════════════════════════════════════════
   빌드 — 렌더러 + 데이터 + 폰트 → HTML 파일 하나
   ── M1은 브라우저에서 조립합니다.
   ── M2에서 서버로 옮깁니다 (폰트 서브셋·소스 보호·공유 링크).
   ══════════════════════════════════════════════════════════ */

const FONT_MARK  = '/*__EMBED_FONTS__*/';
const DATA_MARK  = '/*__DATA__*/ null';
const AUDIO_MARK = '/*__EMBED_AUDIO__*/';

function toBase64(buf){
  const bytes = new Uint8Array(buf);
  let s = '';
  // 한 번에 넘기면 인자 수 제한에 걸립니다. 잘라서 붙입니다.
  for(let i = 0; i < bytes.length; i += 0x8000){
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

const grab = async (url, as) => {
  const r = await fetch(url);
  if(!r.ok) throw new Error(url + ' 을(를) 읽지 못했습니다 (' + r.status + ')');
  return as === 'buffer' ? r.arrayBuffer() : as === 'json' ? r.json() : r.text();
};

export async function loadTemplate(dir){
  const [meta, schema, sample] = await Promise.all([
    grab(dir + '/meta.json',   'json'),
    grab(dir + '/schema.json', 'json'),
    grab(dir + '/sample.json', 'json')
  ]);
  /* 문제 제안은 있는 템플릿만 씁니다. 없으면 그냥 넘어갑니다. */
  const prompts = await grab(dir + '/prompts.json', 'json').catch(() => null);
  return { dir, meta, schema, sample, prompts };
}

/* 폰트는 한 번만 받아서 재사용합니다 (1.7MB) */
let fontCache = null;
async function fontCss(tpl){
  if(fontCache) return fontCache;
  const parts = await Promise.all(tpl.meta.fonts.map(async f => {
    const buf = await grab(tpl.dir + '/assets/fonts/' + f.file, 'buffer');
    return `@font-face{font-family:'${f.family}';font-style:normal;`
         + `font-weight:${f.weight};font-display:block;`
         + `src:url(data:font/woff2;base64,${toBase64(buf)}) format('woff2');}`;
  }));
  fontCache = parts.join('\n');
  return fontCache;
}

/* 배경음악 ──
   meta.json의 audio.files에 파일 이름을 넣으면 그 음원이 결과물에 심깁니다
   (이름 순서대로 이어서 반복 재생). 비워두면 렌더러가 코드로 만든
   8비트 배경음악을 씁니다 — 파일 크기가 늘지 않습니다. */
const AUDIO_MIME = { mp3:'audio/mpeg', m4a:'audio/mp4', ogg:'audio/ogg', wav:'audio/wav' };
let audioCache = null;

async function audioSrc(tpl){
  const files = tpl.meta.audio?.files || [];
  if(!files.length) return '';
  if(audioCache) return audioCache;
  const parts = await Promise.all(files.map(async f => {
    const buf  = await grab(tpl.dir + '/assets/audio/' + f, 'buffer');
    const ext  = f.split('.').pop().toLowerCase();
    const mime = AUDIO_MIME[ext] || 'audio/mpeg';
    return `"data:${mime};base64,${toBase64(buf)}"`;
  }));
  audioCache = parts.join(',');
  return audioCache;
}

export async function buildSingleFile(tpl, data){
  const [src, css, audio] = await Promise.all([
    grab(tpl.dir + '/renderer.html', 'text'),
    fontCss(tpl),
    audioSrc(tpl)
  ]);

  if(!src.includes(FONT_MARK)) throw new Error('렌더러에 폰트 자리가 없습니다.');
  if(!src.includes(DATA_MARK)) throw new Error('렌더러에 데이터 자리가 없습니다.');
  if(audio && !src.includes(AUDIO_MARK)) throw new Error('렌더러에 음악 자리가 없습니다.');

  // 치환값에 $ 가 있으면 정규식 특수문자로 먹힙니다. 함수로 넘겨서 막습니다.
  const json = JSON.stringify(data);
  const html = src
    .replace(FONT_MARK,  () => css)
    .replace(DATA_MARK,  () => json)
    .replace(AUDIO_MARK, () => audio);

  return new Blob([html], { type: 'text/html;charset=utf-8' });
}

export function download(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const prettySize = bytes =>
  bytes < 1024 * 1024
    ? Math.round(bytes / 1024) + 'KB'
    : (bytes / 1024 / 1024).toFixed(1) + 'MB';
