/* ══════════════════════════════════════════════════════════
   스키마 → 폼
   ── 템플릿마다 폼을 새로 짜지 않습니다. schema.json만 추가하면
   ── 이 파일이 폼을 그립니다. 새 필드 타입이 필요할 때만 여기를 고칩니다.
   ══════════════════════════════════════════════════════════ */
import { get, joinPath } from './store.js';

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮';

/* 보기는 예전에 글자만이었습니다("아빠"). 사진이 붙으면서 {t,img}가 됐습니다.
   이미 저장된 작업과 sample.json이 아직 글자 배열이라 읽을 때 맞춰줍니다. */
export const optIn = o => (o && typeof o === 'object')
  ? { t: String(o.t ?? ''), img: String(o.img ?? '') }
  : { t: String(o ?? ''), img: '' };

const prettyKB = n => n < 1024 * 1024
  ? Math.round(n / 1024) + 'KB'
  : (n / 1024 / 1024).toFixed(1) + 'MB';

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if(cls) n.className = cls;
  if(html != null) n.innerHTML = html;
  return n;
};
const esc = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const icon = (name, cls = 'ico') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

/* 카드를 다시 그려도 펼침 상태가 유지되도록 밖에 둡니다 */
const opened = new Set();
export const openCard = key => opened.add(key);

/* ── 이름 넣기 ──
   한국어 이름 뒤의 '이'는 받침이 있을 때만 붙습니다. 채원이 / 지호
   부를 때도 갈립니다. 채원아 / 지호야
   이걸 안 하면 제안 문구가 "지호이가"처럼 어색해집니다. */
const batchim = ch => {
  const c = String(ch || '').charCodeAt(0);
  return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0;
};
export function fillName(text, name){
  const n = String(name || '').trim() || '아이';
  const b = batchim(n[n.length - 1]);
  return String(text || '')
    .replace(/\{아이야\}/g, n + (b ? '아' : '야'))
    .replace(/\{아이\}/g,   n + (b ? '이' : ''));
}

/* ctx = { store, onEdit, onFocus, onCard, rerender } */
export function renderFields(host, fields, ctx, basePath = ''){
  host.innerHTML = '';
  for(const f of fields) host.appendChild(field(f, ctx, basePath));
}

function field(f, ctx, basePath){
  const path = joinPath(basePath, f.path);
  switch(f.type){
    case 'repeater': return repeater(f, ctx, path);
    case 'options':  return options(f, ctx, path, basePath);
    case 'select':   return select(f, ctx, path);
    case 'toggle':   return toggle(f, ctx, path);
    case 'image':    return imageField(f, ctx, path);
    case 'answer':   return answer(f, ctx, path, basePath);
    case 'worlds':   return worldsField(f, ctx, path);
    default:         return textField(f, ctx, path);
  }
}

function label(f, forId){
  const n = el('label', 'f__l');
  if(forId) n.setAttribute('for', forId);
  n.innerHTML = esc(f.label)
    + (f.required ? '<span class="f__req">*</span>' : '')
    + (f.optional ? '<span class="f__opt">선택</span>' : '');
  return n;
}

function counter(f, input, lab){
  if(!f.maxLength) return;
  const c = el('span', 'f__c px');
  lab.appendChild(c);
  const upd = () => {
    const n = [...String(input.value || '')].length;
    c.textContent = n + '/' + f.maxLength;
    c.dataset.over = n > f.maxLength ? '1' : '0';
    input.classList.toggle('in--over', n > f.maxLength);
  };
  input.addEventListener('input', upd);
  upd();
}

/* ── 글 ── */
function textField(f, ctx, path){
  const wrap = el('div', 'f');
  const id = 'f_' + path.replace(/\./g, '_');
  const input = el(f.type === 'longtext' ? 'textarea' : 'input', 'in');
  input.id = id;
  if(f.type !== 'longtext') input.type = 'text';
  if(f.rows) input.rows = f.rows;
  if(f.placeholder) input.placeholder = f.placeholder;
  input.value = ctx.store.read(path) ?? '';

  const lab = label(f, id);
  counter(f, input, lab);

  input.addEventListener('input', () => {
    ctx.store.write(path, input.value);
    ctx.onEdit?.(path);
  });
  input.addEventListener('focus', () => ctx.onFocus?.(path));

  wrap.append(lab, input);
  if(f.hint) wrap.appendChild(el('p', 'f__h', esc(f.hint)));
  return wrap;
}

/* ── 고르기 ── */
function select(f, ctx, path){
  const wrap = el('div', 'f');
  wrap.appendChild(label(f));
  const cur = ctx.store.read(path) ?? f.default;
  const name = 'r_' + path.replace(/\./g, '_');

  /* 짧은 선택지는 한 줄짜리 세그먼트로. 설명은 고른 것만 아래에 보여줍니다 */
  if(f.choices.length <= 4 && (f.compact || f.choices.every(c => !c.desc))){
    const seg = el('div', 'seg');
    const note = el('p', 'f__h');
    const say = v => {
      const c = f.choices.find(x => String(x.value) === String(v));
      note.textContent = c?.desc || f.hint || '';
    };
    f.choices.forEach(c => {
      const b = el('button', null, esc(c.label));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(String(cur) === String(c.value)));
      b.addEventListener('click', () => {
        ctx.store.write(path, c.value);
        say(c.value);
        ctx.onEdit?.(path);
        [...seg.children].forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        if(f.affectsForm) ctx.rerender?.();   // 폼 구성이 바뀌는 선택일 때만
      });
      seg.appendChild(b);
    });
    say(cur);
    wrap.append(seg, note);
    return wrap;
  }

  const box = el('div', 'opts');

  for(const c of f.choices){
    const lab = el('label', 'opt');
    const r = el('input');
    r.type = 'radio'; r.name = name;
    r.checked = String(cur) === String(c.value);
    r.addEventListener('change', () => {
      ctx.store.write(path, c.value);
      ctx.onEdit?.(path);
      ctx.rerender?.();          // 보기 방식이 바뀌면 폼 모양도 바뀝니다
    });
    lab.append(r, el('div', null,
      `<b>${esc(c.label)}</b>` + (c.desc ? `<span>${esc(c.desc)}</span>` : '')));
    box.appendChild(lab);
  }
  wrap.appendChild(box);
  if(f.hint) wrap.appendChild(el('p', 'f__h', esc(f.hint)));
  return wrap;
}

/* ── 켜고 끄기 ── */
function toggle(f, ctx, path){
  const wrap = el('div', 'f');
  const lab = el('label', 'sw');
  const inp = el('input');
  inp.type = 'checkbox';
  inp.checked = ctx.store.read(path) ?? f.default ?? false;
  inp.addEventListener('change', () => {
    ctx.store.write(path, inp.checked);
    ctx.onEdit?.(path);
  });
  lab.append(inp, el('span', 'sw__t'), el('span', null, esc(f.label)));
  wrap.appendChild(lab);
  return wrap;
}

/* ── 사진 ──
   고른 사진은 그 자리에서 장변 1000px로 줄여 IndexedDB에 넣고,
   작업 데이터에는 id 문자열만 남깁니다. 이유는 imagestore.js 맨 위에 적었습니다.
   small은 보기 줄에 끼워 넣는 작은 모양입니다. */
function imagePicker(ctx, path, small){
  const wrap = el('div', 'imgw' + (small ? ' imgw--s' : ''));
  const box  = el('div', 'imgp');
  const err  = el('p', 'imgp__e');
  wrap.append(box, err);

  const file = el('input');
  file.type = 'file';
  file.accept = 'image/*';
  file.hidden = true;
  const pick = () => file.click();

  const draw = () => {
    const rec = ctx.images?.get(ctx.store.read(path));
    box.innerHTML = '';
    box.append(file);
    box.dataset.has = rec ? '1' : '0';

    if(!rec){
      const b = el('button', 'imgp__add',
        icon('img') + (small ? '' : '<span>사진 고르기</span>'));
      b.type = 'button';
      b.title = '사진 고르기 — 끌어다 놓아도 됩니다';
      b.addEventListener('click', pick);
      box.append(b);
      return;
    }

    const t = el('button', 'imgp__t');
    t.type = 'button';
    t.title = (rec.name || '사진') + ' — 눌러서 바꾸기';
    t.style.backgroundImage = `url("${rec.url}")`;

    const x = el('button', 'imgp__x', icon('x'));
    x.type = 'button';
    x.title = '사진 빼기';
    x.addEventListener('click', () => {
      ctx.store.write(path, '');
      ctx.onEdit?.(path);
      draw();
    });

    t.addEventListener('click', pick);
    box.append(t, x);
    if(!small) box.append(el('span', 'imgp__s',
      `${rec.w}×${rec.h} · ${prettyKB(rec.bytes)}`));
  };

  const take = async f0 => {
    if(!f0) return;
    err.textContent = '';
    box.dataset.busy = '1';
    try{
      const rec = await ctx.images.add(f0);
      ctx.store.write(path, rec.id);
      ctx.onEdit?.(path);
    }catch(e){
      /* 창을 띄우지 않습니다. 편집을 끊지 않고 그 자리에 적습니다. */
      err.textContent = e.message || '사진을 넣지 못했습니다.';
      console.warn(e);
    }finally{
      box.dataset.busy = '0';
      draw();
    }
  };

  file.addEventListener('change', () => {
    const f0 = file.files?.[0];
    file.value = '';          // 같은 파일을 다시 골라도 change가 오게 비웁니다
    take(f0);
  });

  ['dragenter', 'dragover'].forEach(t => box.addEventListener(t, e => {
    e.preventDefault();
    box.dataset.drop = '1';
  }));
  ['dragleave', 'dragend'].forEach(t => box.addEventListener(t, () => {
    box.dataset.drop = '0';
  }));
  box.addEventListener('drop', e => {
    e.preventDefault();
    box.dataset.drop = '0';
    take([...(e.dataTransfer?.files || [])].find(x => /^image\//.test(x.type)));
  });

  draw();
  wrap.__refresh = draw;
  return wrap;
}

function imageField(f, ctx, path){
  const wrap = el('div', 'f');
  wrap.appendChild(label(f));
  wrap.appendChild(imagePicker(ctx, path, false));
  if(f.hint) wrap.appendChild(el('p', 'f__h', esc(f.hint)));
  return wrap;
}

/* ── 보기 ──
   글자만 쓰던 repeater를 대신합니다. 보기 하나는 {t, img}이고,
   사진만 넣으면 사진만, 둘 다 넣으면 사진 아래 글자가 나옵니다.
   f.image = { when:"layout", is:"photo" } 이면 그 조건일 때만 사진칸이 열립니다. */
function options(f, ctx, path, basePath){
  const wrap = el('div', 'f');
  const lab = label(f);
  wrap.appendChild(lab);

  const withImg = !f.image ||
    String(ctx.store.read(joinPath(basePath, f.image.when))) === String(f.image.is);

  const list = el('div', 'rep');
  wrap.appendChild(list);

  /* 저장된 작업과 sample.json은 아직 글자 배열입니다. 여기서 한 번만 바꿔 씁니다. */
  const read = () => {
    let items = ctx.store.read(path);
    if(!Array.isArray(items)){
      items = [];
      ctx.store.write(path, items);
      return items;
    }
    if(items.every(o => o && typeof o === 'object')) return items;
    const next = items.map(optIn);
    ctx.store.write(path, next);
    return next;
  };

  const draw = () => {
    const items = read();
    list.innerHTML = '';

    items.forEach((_, i) => {
      const itemPath = path + '.' + i;
      const r = el('div', 'rep__r' + (withImg ? ' rep__r--img' : ''));

      r.appendChild(el('span', 'rep__n px', f.numbered ? (CIRCLED[i] || i + 1) : String(i + 1)));

      const inp = el('input', 'in');
      inp.type = 'text';
      inp.value = ctx.store.read(itemPath + '.t') ?? '';
      inp.placeholder = withImg ? '사진 아래 글자 (없어도 됩니다)' : '';
      if(f.maxLength) inp.maxLength = f.maxLength + 10;
      inp.addEventListener('input', () => {
        ctx.store.write(itemPath + '.t', inp.value);
        ctx.onEdit?.(itemPath);
        refreshCard(r);
      });
      inp.addEventListener('focus', () => ctx.onFocus?.(itemPath));
      r.appendChild(inp);

      if(withImg) r.appendChild(imagePicker({
        ...ctx,
        onEdit(p){ ctx.onEdit?.(p); refreshCard(r); }
      }, itemPath + '.img', true));

      const x = el('button', 'rep__x', icon('x'));
      x.type = 'button';
      x.title = '이 보기 지우기';
      x.disabled = items.length <= (f.min ?? 0);
      x.addEventListener('click', () => {
        const arr = read();
        arr.splice(i, 1);
        ctx.store.write(path, arr);
        ctx.onEdit?.(path);
        draw();
        refreshCard(list);
      });
      r.appendChild(x);
      list.appendChild(r);
    });

    const add = el('button', 'rep__add', '＋ ' + esc(f.addLabel || '보기 추가'));
    add.type = 'button';
    add.disabled = f.max != null && items.length >= f.max;
    add.addEventListener('click', () => {
      const arr = read();
      arr.push({ t:'', img:'' });
      ctx.store.write(path, arr);
      ctx.onEdit?.(path);
      draw();
      list.querySelector('.rep__r:last-of-type input')?.focus({ preventScroll:true });
    });
    list.appendChild(add);
  };

  draw();
  if(withImg) wrap.appendChild(el('p', 'f__h',
    '사진은 장변 1000px로 줄여서 넣습니다. 글자를 비우면 사진만 나옵니다.'));
  else if(f.hint) wrap.appendChild(el('p', 'f__h', esc(f.hint)));
  return wrap;
}

/* ══ 월드 나누기 ══
   문제를 월드별로 몇 개씩 담을지입니다. 월드가 바뀌는 자리에서 배경이
   지상↔지하로 바뀌고 WORLD 카드가 뜹니다.
   ── renderer.html의 worldPos()와 규칙이 같아야 합니다. 두 곳이 어긋나면
      편집기에서 본 WORLD 표기와 내려받은 결과물이 달라집니다.
   ── 저장하는 값은 실제로 담긴 수입니다. 합이 늘 문제 수와 같습니다.
      그래서 문제를 더하거나 지울 때 그 문제가 속한 월드를 함께 고쳐야 합니다
      (worldsAfterAdd / worldsAfterRemove). 안 그러면 WORLD 1에서 지웠는데
      뒤 문제가 당겨 올라와 WORLD 2가 줄어듭니다. */
const clampW = n => Math.max(1, Math.min(20, n | 0));

/* 저장된 칸을 문제 수에 맞춰 고칩니다. 칸이 모자라면 마지막 칸 수로 더 만듭니다.
   worlds가 없던 예전 작업이 [5,5,…]로 읽히는 것도 여기입니다. */
export function worldSizes(sizes, total){
  total = Math.max(0, total | 0);
  if(!total) return [];
  const want = (Array.isArray(sizes) ? sizes : []).map(clampW);
  const list = want.length ? want : [5];
  const out = [];
  let left = total, i = 0;
  while(left > 0){
    const take = Math.min(list[Math.min(i, list.length - 1)], left);
    out.push(take);
    left -= take;
    i++;
  }
  return out;
}

/* 문제 순번(0부터) → { world, stage } */
export function worldTag(sizes, i){
  const want = (Array.isArray(sizes) ? sizes : []).map(clampW);
  const list = want.length ? want : [5];
  let w = 0, left = Math.max(0, i | 0);
  for(;;){
    const size = list[Math.min(w, list.length - 1)];
    if(left < size) return { world: w + 1, stage: left + 1 };
    left -= size; w++;
  }
}

/* 문제 하나를 지운 뒤 — total은 지운 뒤의 문제 수입니다 */
export function worldsAfterRemove(sizes, i, total){
  const list = worldSizes(sizes, total + 1);        // 지우기 전 기준으로 셉니다
  if(!list.length) return [];
  const w = worldTag(list, i).world - 1;
  list[w] -= 1;
  return list.filter(n => n > 0);
}

/* 문제 하나를 맨 뒤에 더한 뒤 — total은 더한 뒤의 문제 수입니다 */
export function worldsAfterAdd(sizes, total){
  const list = worldSizes(sizes, total - 1);
  if(!list.length) return total > 0 ? [total] : [];
  list[list.length - 1] += 1;
  return list;
}

/* 월드 i의 칸을 v로 — 경계를 끄는 것과 같습니다.
   줄이면 넘친 문제가 뒤 월드로 가고(뒤가 없으면 새 월드가 생깁니다),
   늘리면 뒤 월드에서 끌어옵니다. 끌어올 게 없으면 거기까지만 늘어납니다. */
export function worldsAfterResize(sizes, i, v, total){
  const list = worldSizes(sizes, total);
  if(!list.length) return list;
  i = Math.min(Math.max(0, i | 0), list.length - 1);
  v = clampW(v);
  let delta = v - list[i];
  if(delta === 0) return list;

  if(delta > 0){
    for(let k = i + 1; k < list.length && delta > 0; k++){
      const take = Math.min(list[k], delta);
      list[k] -= take;
      delta  -= take;
    }
    list[i] = v - delta;
  }else{
    list[i] = v;
    if(i + 1 < list.length) list[i + 1] += -delta;
    else list.push(-delta);
  }
  return list.filter(n => n > 0);
}

/* ── 월드 구성 칸 ── */
let worldsRedraw = null;
export const refreshWorlds = () => worldsRedraw?.();

function worldsField(f, ctx, path){
  const wrap = el('div', 'f wbox');
  wrap.id = 'worlds-box';
  wrap.appendChild(label(f));
  const list = el('div', 'rep');
  wrap.appendChild(list);
  const sum = el('p', 'f__h');
  wrap.appendChild(sum);
  if(f.hint) wrap.appendChild(el('p', 'f__h', esc(f.hint)));

  const cap   = f.max || 20;
  const total = () => (ctx.store.read(f.countFrom || 'quiz') || []).length;

  /* 문제 수와 어긋났으면 여기서 맞춰 씁니다 */
  const read = () => {
    const fixed = worldSizes(ctx.store.read(path), total());
    const cur   = ctx.store.read(path);
    if(!Array.isArray(cur) || cur.length !== fixed.length || cur.some((n, i) => n !== fixed[i])){
      ctx.store.write(path, fixed);
    }
    return fixed;
  };

  /* 문제 카드 머리의 WORLD 표기(1-3)도 같이 갈아 끼웁니다.
     폼을 통째로 다시 그리면 숫자칸에서 손이 떨어져서 여기만 손봅니다. */
  const paintCards = sizes => {
    document.querySelectorAll('.qc').forEach((c, i) => {
      const t = worldTag(sizes, i);
      const b = c.querySelector('.qc__w');
      if(b) b.textContent = t.world + '-' + t.stage;
    });
  };

  const apply = (next, focus) => {
    ctx.store.write(path, worldSizes(next, total()));
    ctx.onEdit?.(path);
    draw(focus);
  };

  /* focus는 다시 그린 뒤 커서를 돌려놓을 줄 번호입니다.
     숫자를 고치면 줄이 늘거나 줄어 다시 그려야 하는데, 그때 손이 떨어지면
     두 자리 수를 칠 수 없습니다. */
  function draw(focus){
    const sizes = read();
    list.innerHTML = '';

    let from = 1;
    sizes.forEach((n, i) => {
      const to = from + n - 1;
      const r  = el('div', 'wr');
      r.append(
        el('span', 'wr__n px', 'WORLD ' + (i + 1)),
        el('span', 'wr__g', i % 2 === 0 ? '지상' : '지하')
      );

      const inp = el('input', 'in wr__in');
      inp.type = 'number';
      inp.min = 1;
      inp.max = cap;
      inp.value = String(n);
      inp.addEventListener('input', () => {
        const v = parseInt(inp.value, 10);
        if(!Number.isFinite(v) || v < 1) return;      // 지우는 중일 수 있습니다
        apply(worldsAfterResize(sizes, i, v, total()), i);
      });
      r.append(inp, el('span', 'wr__u', '문제'));
      r.appendChild(el('span', 'wr__r px', n > 1 ? 'Q' + from + '–Q' + to : 'Q' + from));

      const x = el('button', 'rep__x', icon('x'));
      x.type = 'button';
      x.title = i === 0 ? '뒤 월드에 합치기' : '앞 월드에 합치기';
      x.disabled = sizes.length <= 1;
      x.addEventListener('click', () => {
        const next = sizes.slice();
        const [gone] = next.splice(i, 1);
        const j = i === 0 ? 0 : i - 1;
        next[j] = (next[j] || 0) + gone;
        apply(next);
      });
      r.appendChild(x);

      list.appendChild(r);
      from = to + 1;
    });

    /* 마지막 월드를 둘로 나눠 새 월드를 만듭니다 */
    const k    = sizes.length - 1;
    const last = k >= 0 ? sizes[k] : 0;
    const add  = el('button', 'rep__add', '＋ ' + esc(f.addLabel || '월드 추가'));
    add.type = 'button';
    add.disabled = last < 2;
    add.title = add.disabled
      ? '마지막 월드에 문제가 둘은 있어야 나눌 수 있습니다'
      : '마지막 월드를 둘로 나눕니다';
    add.addEventListener('click', () => {
      const half = Math.ceil(last / 2);
      const next = sizes.slice();
      next.splice(k, 1, half, last - half);
      apply(next);
    });
    list.appendChild(add);

    if(!sizes.length) list.appendChild(el('p', 'f__h', '문제를 넣으면 월드가 생깁니다.'));

    sum.textContent = sizes.length
      ? `문제 ${total()}개를 ${sizes.join(' + ')}로 나눴습니다.`
      : '';

    paintCards(sizes);

    if(focus != null){
      const back = list.querySelectorAll('.wr__in')[Math.min(focus, sizes.length - 1)];
      if(back){
        back.focus();
        /* 숫자칸은 setSelectionRange를 못 씁니다. 값을 다시 넣어 커서를 끝으로 보냅니다. */
        const v = back.value; back.value = ''; back.value = v;
      }
    }
  }

  worldsRedraw = draw;
  draw();
  return wrap;
}

/* ── 정답 ──
   보기 중에서만 고를 수 있습니다.
   그래서 "보기에 없는 정답"이 구조적으로 만들어지지 않습니다. */
function answer(f, ctx, path, basePath){
  const wrap = el('div', 'f');
  wrap.appendChild(label(f));
  const box = el('div', 'ans');
  wrap.appendChild(box);
  if(f.hint) wrap.appendChild(el('p', 'f__h', esc(f.hint)));

  const optPath = joinPath(basePath, f.source);

  const draw = () => {
    const opts = (get(ctx.store.data, optPath) || []).map(optIn);
    const cur  = ctx.store.read(path) ?? 0;
    box.innerHTML = '';
    opts.forEach((o, i) => {
      const b = el('button', 'ans__b');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(i === cur));
      b.append(el('span', 'ans__k', CIRCLED[i] || String(i + 1)));

      /* 사진 보기일 때 글자만 보여주면 어느 게 정답인지 알 수 없습니다 */
      const url = ctx.images?.url(o.img);
      if(url){
        const th = el('span', 'ans__i');
        th.style.backgroundImage = `url("${url}")`;
        b.append(th);
      }
      b.append(el('span', 'ans__t', esc(o.t.trim() || (url ? '' : '—'))));

      b.addEventListener('click', () => {
        ctx.store.write(path, i);
        ctx.onEdit?.(path);
        draw();
      });
      box.appendChild(b);
    });
    if(!opts.length) box.appendChild(el('p', 'f__h', '보기를 먼저 채워주세요.'));
  };

  draw();
  wrap.__refresh = draw;
  return wrap;
}

/* ── 반복 ── */
function repeater(f, ctx, path){
  const wrap = el('div', 'f');
  const cards = Array.isArray(f.fields);
  if(!cards) wrap.appendChild(label(f));

  const list = el('div', cards ? '' : 'rep');
  wrap.appendChild(list);

  const seed = x => x.default ?? (
    x.type === 'options'  ? Array.from({ length: x.recommended ?? x.min ?? 2 },
                                       () => ({ t:'', img:'' })) :
    x.type === 'repeater' ? ['', '', '', '', ''] : '');

  const blank = () => cards
    ? Object.fromEntries(f.fields.map(x => [x.path, seed(x)]))
    : '';

  const draw = () => {
    let items = ctx.store.read(path);
    if(!Array.isArray(items)){ items = []; ctx.store.write(path, items); }
    list.innerHTML = '';

    items.forEach((_, i) => list.appendChild(
      cards ? card(f, ctx, path, i, items.length, draw)
            : row(f, ctx, path, i, items.length, draw)));

    const push = seed => {
      const next = ctx.store.read(path);
      next.push(seed ?? blank());
      ctx.store.write(path, next);
      /* 새 문제는 마지막 월드에 붙습니다 — 한 문제짜리 월드가 새로 생기지 않게 */
      if(f.worldsFrom){
        ctx.store.write(f.worldsFrom,
          worldsAfterAdd(ctx.store.read(f.worldsFrom), next.length));
      }
      if(cards) opened.add(path + '.' + (next.length - 1));
      ctx.onEdit?.(path);
      draw();
      const last = list.querySelector('.qc:last-of-type');
      last?.querySelector('textarea,input')?.focus({ preventScroll:true });
      last?.scrollIntoView({ block:'nearest' });
    };

    const add = el('button', 'rep__add', '＋ ' + esc(f.addLabel || '추가'));
    add.type = 'button';
    add.disabled = f.max != null && items.length >= f.max;

    /* 제안 목록이 있으면 빈 카드 대신 목록부터 엽니다.
       "뭘 물어보지?"에서 막히는 게 이 화면의 가장 큰 이탈 지점입니다. */
    const useBank = cards && f.suggest && ctx.prompts?.items?.length;
    add.addEventListener('click', () => {
      if(!useBank) return push();
      if(list.querySelector('.pick')) return;
      list.insertBefore(bank(f, ctx, path, push, () => draw()), add);
      list.querySelector('.pick')?.scrollIntoView({ block:'nearest' });
    });

    list.appendChild(add);
  };

  draw();
  wrap.__redraw = draw;
  if(f.hint) wrap.appendChild(el('p', 'f__h', esc(f.hint)));
  return wrap;
}

/* ── 문제 제안 ──
   고르면 문제와 보기 틀까지 채워집니다. 사용자는 숫자만 바꾸면 됩니다.
   이미 쓴 문제는 흐리게 표시해 중복을 막습니다. */
function bank(f, ctx, path, push, close){
  const src   = ctx.prompts;
  const name  = ctx.store.read(f.suggest.nameFrom);
  const used  = new Set((ctx.store.read(path) || []).map(q => q && q.srcId).filter(Boolean));
  const cats  = [{ id:'all', label:'전체' }, ...src.categories];
  let cur = 'all';

  const p = el('div', 'pick');

  const head = el('div', 'pick__h');
  head.innerHTML = '<b>어떤 걸 물어볼까요?</b><span>고르면 보기까지 채워집니다</span>';
  const x = el('button', 'rep__x', icon('x'));
  x.type = 'button'; x.title = '닫기'; x.style.opacity = '1';
  x.addEventListener('click', close);
  head.appendChild(x);

  const chips = el('div', 'pick__c');
  const listEl = el('div', 'pick__l');

  const drawList = () => {
    listEl.innerHTML = '';
    src.items
      .filter(it => cur === 'all' || it.cat === cur)
      .forEach(it => {
        const done = used.has(it.id);
        const b = el('button', 'pick__i');
        b.type = 'button';
        b.disabled = done;
        const q = fillName(it.q, name).replace(/\n/g, ' ');
        b.innerHTML =
          `<span class="pick__q"></span>
           <span class="pick__o"></span>` +
          (done ? '<span class="pick__u">넣음</span>' : '');
        b.querySelector('.pick__q').textContent = q;
        b.querySelector('.pick__o').textContent =
          it.options.filter(o => o).join(' · ') || '보기를 직접 채웁니다';
        b.addEventListener('click', () => push({
          question: fillName(it.q, name),
          options: it.options.map(optIn),
          answerIndex: 0,
          layout: 'text',
          note: '',
          nav: it.nav || '',
          srcId: it.id
        }));
        listEl.appendChild(b);
      });
  };

  cats.forEach(c => {
    const b = el('button', 'pick__t', esc(c.label));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(c.id === cur));
    b.addEventListener('click', () => {
      cur = c.id;
      [...chips.children].forEach(n => n.setAttribute('aria-pressed', String(n === b)));
      drawList();
    });
    chips.appendChild(b);
  });

  const foot = el('div', 'pick__f');
  const own = el('button', 'rep__add', esc(f.suggest.blankLabel || '직접 쓰기'));
  own.type = 'button';
  own.addEventListener('click', () => push());
  foot.appendChild(own);

  drawList();
  p.append(head, chips, listEl, foot);
  return p;
}

/* 한 줄짜리 항목 */
function row(f, ctx, path, i, count, redraw){
  const r = el('div', 'rep__r');
  const itemPath = path + '.' + i;

  r.appendChild(el('span', 'rep__n px', f.numbered ? (CIRCLED[i] || i + 1) : String(i + 1)));

  const inp = el('input', 'in');
  inp.type = 'text';
  inp.value = ctx.store.read(itemPath) ?? '';
  if(f.maxLength) inp.maxLength = f.maxLength + 10;
  inp.addEventListener('input', () => {
    ctx.store.write(itemPath, inp.value);
    ctx.onEdit?.(itemPath);
    refreshCard(r);
  });
  inp.addEventListener('focus', () => ctx.onFocus?.(itemPath));
  r.appendChild(inp);

  const x = el('button', 'rep__x', icon('x'));
  x.type = 'button';
  x.title = '이 줄 지우기';
  x.disabled = count <= (f.min ?? 0);
  x.addEventListener('click', () => {
    const arr = ctx.store.read(path);
    arr.splice(i, 1);
    ctx.store.write(path, arr);
    ctx.onEdit?.(path);
    redraw();
  });
  r.appendChild(x);
  return r;
}

/* 카드 머리에 붙는 WORLD 표기(1-3) — 월드 구성을 따릅니다 */
function worldBadge(f, ctx, i){
  const t = worldTag(f.worldsFrom ? ctx.store.read(f.worldsFrom) : null, i);
  return t.world + '-' + t.stage;
}

/* ── 문제 카드 (접힘) ── */
function card(f, ctx, path, i, count, redraw){
  const itemPath = path + '.' + i;
  const isOpen = opened.has(itemPath);

  const c = el('div', 'qc');
  c.id = 'qc-' + i;

  const head = el('button', 'qc__h');
  head.type = 'button';
  head.setAttribute('aria-expanded', String(isOpen));
  head.append(
    el('span', 'qc__n px', (f.itemLabel || 'Q{n}').replace('{n}', i + 1)),
    el('span', 'qc__t'),
    el('span', 'qc__a px'),
    el('span', 'qc__w px', worldBadge(f, ctx, i)),
    el('span', 'qc__cv', icon('chev', 'ico'))
  );

  const panel = el('div', 'qc__p');
  panel.dataset.open = isOpen ? '1' : '0';
  const inner = el('div');
  const body = el('div', 'qc__b');
  inner.appendChild(body);
  panel.appendChild(inner);

  const summarize = () => {
    const q = String(ctx.store.read(itemPath + '.question') ?? '').replace(/\s+/g, ' ').trim();
    const t = head.querySelector('.qc__t');
    t.textContent = q || '문제를 입력해주세요';
    t.dataset.empty = q ? '0' : '1';
    const opts = ctx.store.read(itemPath + '.options') || [];
    const ai = ctx.store.read(itemPath + '.answerIndex') ?? 0;
    head.querySelector('.qc__a').textContent = opts.length ? (CIRCLED[ai] || '') : '';
  };

  let built = isOpen;
  const build = () => {
    const shown = f.fields.filter(sub => visible(sub, ctx, itemPath));
    renderFields(body, shown, ctx, itemPath);
    body.appendChild(tools(f, ctx, path, i, count, redraw));
    built = true;
  };
  if(isOpen) build();

  head.addEventListener('click', () => {
    const now = panel.dataset.open === '1';
    if(now){ opened.delete(itemPath); }
    else{
      opened.add(itemPath);
      if(!built) build();
      ctx.onCard?.(i + 1);
    }
    panel.dataset.open = now ? '0' : '1';
    head.setAttribute('aria-expanded', String(!now));
  });

  c.append(head, panel);
  c.addEventListener('focusin', () => ctx.onCard?.(i + 1));
  body.addEventListener('input', summarize);
  summarize();
  c.__summarize = summarize;
  return c;
}

/* 카드 하단 도구 — 순서 바꾸기와 지우기 */
function tools(f, ctx, path, i, count, redraw){
  const bar = el('div', 'qc__tools');
  const move = (to) => {
    const arr = ctx.store.read(path);
    const [it] = arr.splice(i, 1);
    arr.splice(to, 0, it);
    ctx.store.write(path, arr);
    opened.delete(path + '.' + i);
    opened.add(path + '.' + to);
    ctx.onEdit?.(path);
    redraw();
  };

  const mk = (ic, title, on, off) => {
    const b = el('button', 'rep__x', icon(ic));
    b.type = 'button'; b.title = title; b.disabled = off;
    b.style.opacity = off ? '' : '1';
    b.addEventListener('click', on);
    return b;
  };

  bar.append(
    mk('up',   '위로',       () => move(i - 1), i === 0),
    mk('down', '아래로',     () => move(i + 1), i === count - 1),
    mk('x',    '이 문제 지우기', () => {
      const arr = ctx.store.read(path);
      arr.splice(i, 1);
      ctx.store.write(path, arr);
      /* 지운 문제가 있던 월드를 줄입니다. 이걸 빠뜨리면 WORLD 1에서 지웠는데
         뒤 문제가 당겨 올라와 WORLD 2가 줄어듭니다. */
      if(f.worldsFrom){
        ctx.store.write(f.worldsFrom,
          worldsAfterRemove(ctx.store.read(f.worldsFrom), i, arr.length));
      }
      opened.delete(path + '.' + i);
      ctx.onEdit?.(path);
      redraw();
    }, count <= (f.min ?? 1))
  );
  return bar;
}

/* 보기 방식이 "번호만"이면 보기 글자칸은 숨깁니다 */
function visible(sub, ctx, itemPath){
  if(sub.path !== 'options') return true;
  return (ctx.store.read(itemPath + '.layout') ?? 'text') !== 'numbers';
}

/* 보기 글자가 바뀌면 같은 카드의 정답 블록과 요약도 따라갑니다 */
function refreshCard(node){
  const c = node.closest('.qc');
  if(!c) return;
  c.querySelectorAll('.f').forEach(f => f.__refresh?.());
  c.__summarize?.();
}
