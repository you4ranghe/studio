/* ══════════════════════════════════════════════════════════
   사진 보관 — IndexedDB
   ── 왜 localStorage가 아닌가:
   ── store.js는 작업 전체를 localStorage에 JSON으로 저장하는데
   ── 한도가 origin당 5MB쯤입니다. 사진은 base64로 1.33배가 되어
   ── 폰 사진 한 장만 넣어도 한도를 넘고, 그때 저장이 조용히 실패해
   ── 작업이 통째로 날아갑니다.
   ── 그래서 사진만 IndexedDB에 두고, 작업 JSON에는 id 문자열만 남깁니다.
   ── 내려받는 HTML에는 build.js가 이 id를 data: URI로 바꿔 넣습니다.
   ══════════════════════════════════════════════════════════ */

const DB_NAME = 'studio-images';
const STORE   = 'img';
const PREFIX  = 'img:';

/* 붙여넣은 사진은 여기까지 줄여서 보관합니다.
   원본 그대로 두면 결과물 HTML이 수십 MB가 되어 행사장 노트북에서 못 엽니다. */
const MAX_EDGE = 1000;
const QUALITY  = 0.78;

export const isImageId = v =>
  typeof v === 'string' && /^img:[0-9a-z]{12}$/.test(v);

const newId = () => PREFIX + [...crypto.getRandomValues(new Uint8Array(6))]
  .map(b => b.toString(36).padStart(2, '0')).join('');

/* ── IndexedDB ── */
let dbp = null;
function db(){
  if(!dbp) dbp = new Promise((ok, no) => {
    const rq = indexedDB.open(DB_NAME, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(STORE, { keyPath:'id' });
    rq.onsuccess = () => ok(rq.result);
    rq.onerror   = () => no(rq.error);
  });
  return dbp;
}

function run(mode, fn){
  return db().then(d => new Promise((ok, no) => {
    const t = d.transaction(STORE, mode);
    const rq = fn(t.objectStore(STORE));
    t.onerror    = () => no(t.error);
    t.oncomplete = () => ok(rq ? rq.result : undefined);
  }));
}

/* ── 그림 파일 읽기 ──
   createImageBitmap이 가장 빠르지만 형식에 따라 실패합니다. <img>로 한 번 더 시도합니다. */
async function decode(file){
  if(typeof createImageBitmap === 'function'){
    try{ return await createImageBitmap(file); }catch(e){ /* 아래로 */ }
  }
  const url = URL.createObjectURL(file);
  try{
    const im = new Image();
    await new Promise((ok, no) => {
      im.onload  = ok;
      im.onerror = () => no(new Error('decode'));
      im.src = url;
    });
    return im;
  }finally{
    URL.revokeObjectURL(url);   // onload를 지난 이미지는 이미 메모리에 있습니다
  }
}

const toBlob = (cv, type, q) => new Promise(ok => cv.toBlob(ok, type, q));

const toDataURL = blob => new Promise((ok, no) => {
  const r = new FileReader();
  r.onload  = () => ok(r.result);
  r.onerror = () => no(r.error);
  r.readAsDataURL(blob);
});

/* 투명한 부분이 있는지 봅니다. 있으면 JPEG로 바꿀 수 없습니다(검게 나옵니다). */
function hasAlpha(ctx, w, h){
  const d = ctx.getImageData(0, 0, w, h).data;
  for(let i = 3; i < d.length; i += 4) if(d[i] < 250) return true;
  return false;
}

async function shrink(file){
  let src;
  try{
    src = await decode(file);
  }catch(e){
    throw new Error('이 파일은 브라우저가 열지 못했습니다. '
      + '아이폰 사진(HEIC)이라면 JPG로 바꿔서 올려주세요.');
  }

  const sw = src.width, sh = src.height;
  if(!sw || !sh) throw new Error('빈 이미지입니다.');

  const k = Math.min(1, MAX_EDGE / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k));
  const h = Math.max(1, Math.round(sh * k));

  const cv  = document.createElement('canvas');
  cv.width  = w;
  cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently:true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  src.close?.();

  const alpha = /png|webp|gif|svg/.test(file.type) && hasAlpha(ctx, w, h);

  /* WebP가 가장 작고 투명도도 살립니다. 다만 오래된 사파리는 WebP를 요청해도
     PNG를 돌려주므로, 실제로 나온 형식을 확인하고 아니면 아래로 내려갑니다. */
  let blob = await toBlob(cv, 'image/webp', QUALITY);
  if(!blob || blob.type !== 'image/webp'){
    if(alpha){
      blob = await toBlob(cv, 'image/png');
    }else{
      // JPEG에는 투명이 없습니다. 비어 있던 자리를 흰색으로 채우고 굽습니다.
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      blob = await toBlob(cv, 'image/jpeg', QUALITY);
    }
  }
  if(!blob) throw new Error('사진을 변환하지 못했습니다.');
  return { blob, w, h };
}

/* ── 바깥에서 쓰는 것 ──
   url은 data: URI 문자열입니다. 미리보기(iframe)와 내려받기가 모두 이걸 씁니다.
   그래서 화면을 그릴 때마다 IndexedDB를 다시 읽지 않도록 메모리에 들고 있습니다. */
const cache = new Map();

export const images = {
  /* 편집기가 뜰 때 한 번. 실패해도 편집은 계속되어야 하므로 삼킵니다. */
  async load(){
    try{
      const all = await run('readonly', s => s.getAll());
      cache.clear();
      (all || []).forEach(r => cache.set(r.id, r));
    }catch(e){
      console.warn('저장해둔 사진을 읽지 못했습니다.', e);
    }
    return this;
  },

  get: id => cache.get(id) || null,
  has: id => cache.has(id),
  url: id => cache.get(id)?.url || '',

  async add(file, tpl){
    if(!/^image\//.test(file.type || ''))
      throw new Error('사진 파일이 아닙니다.');

    const { blob, w, h } = await shrink(file);
    const url = await toDataURL(blob);
    const rec = {
      id: newId(), url, w, h, tpl,
      bytes: url.length,            // 결과물 HTML에 실제로 더해지는 크기입니다
      type: blob.type,
      name: String(file.name || '').slice(0, 60)
    };
    await run('readwrite', s => s.put(rec));
    cache.set(rec.id, rec);
    return rec;
  },

  /* 어디에서도 쓰지 않는 사진을 지웁니다.
     보기를 지우거나 문제를 통째로 지웠을 때 찌꺼기가 쌓이지 않게 합니다.
     tpl은 지금 열어둔 템플릿입니다. 다른 템플릿의 작업에 딸린 사진까지
     같이 지우지 않으려고 확인합니다. */
  async gc(used, tpl){
    const dead = [...cache.values()]
      .filter(r => r.tpl === tpl && !used.has(r.id))
      .map(r => r.id);
    if(!dead.length) return 0;
    dead.forEach(id => cache.delete(id));
    try{ await run('readwrite', s => { dead.forEach(id => s.delete(id)); }); }
    catch(e){ console.warn('안 쓰는 사진을 지우지 못했습니다.', e); }
    return dead.length;
  },

  /* 지금 작업에 들어 있는 사진들의 합계 — 결과물이 얼마나 무거워지는지 보여줍니다 */
  bytesOf(used){
    let n = 0;
    used.forEach(id => { n += cache.get(id)?.bytes || 0; });
    return n;
  }
};

/* ── 데이터 안의 id를 실제 사진으로 바꿔치기 ──
   경로를 하나하나 적지 않고 트리를 훑습니다. 스키마에 사진 칸이 늘어나도
   여기는 고칠 필요가 없습니다. */
export function collectIds(node, out = new Set()){
  if(isImageId(node)) out.add(node);
  else if(Array.isArray(node)) node.forEach(v => collectIds(v, out));
  else if(node && typeof node === 'object') Object.values(node).forEach(v => collectIds(v, out));
  return out;
}

export function hydrate(node){
  if(isImageId(node)) return images.url(node);      // 못 찾으면 빈 문자열
  if(Array.isArray(node)) return node.map(hydrate);
  if(node && typeof node === 'object'){
    const o = {};
    for(const k in node) o[k] = hydrate(node[k]);
    return o;
  }
  return node;
}
