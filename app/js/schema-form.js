/* ══════════════════════════════════════════════════════════
   스키마 → 폼
   ── 템플릿마다 폼을 새로 짜지 않습니다. schema.json만 추가하면
   ── 이 파일이 폼을 그립니다. 새 필드 타입이 필요할 때만 여기를 고칩니다.
   ══════════════════════════════════════════════════════════ */
import { get, joinPath } from './store.js';

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮';

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

/* ctx = { store, onEdit, onFocus, onCard, rerender } */
export function renderFields(host, fields, ctx, basePath = ''){
  host.innerHTML = '';
  for(const f of fields) host.appendChild(field(f, ctx, basePath));
}

function field(f, ctx, basePath){
  const path = joinPath(basePath, f.path);
  switch(f.type){
    case 'repeater': return repeater(f, ctx, path);
    case 'select':   return select(f, ctx, path);
    case 'toggle':   return toggle(f, ctx, path);
    case 'answer':   return answer(f, ctx, path, basePath);
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
    const opts = get(ctx.store.data, optPath) || [];
    const cur  = ctx.store.read(path) ?? 0;
    box.innerHTML = '';
    opts.forEach((o, i) => {
      const b = el('button', 'ans__b');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(i === cur));
      b.append(
        el('span', 'ans__k', CIRCLED[i] || String(i + 1)),
        el('span', 'ans__t', esc(String(o).trim() || '—'))
      );
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

  const blank = () => cards
    ? Object.fromEntries(f.fields.map(x =>
        [x.path, x.default ?? (x.type === 'repeater' ? ['', '', '', '', ''] : '')]))
    : '';

  const draw = () => {
    let items = ctx.store.read(path);
    if(!Array.isArray(items)){ items = []; ctx.store.write(path, items); }
    list.innerHTML = '';

    items.forEach((_, i) => list.appendChild(
      cards ? card(f, ctx, path, i, items.length, draw)
            : row(f, ctx, path, i, items.length, draw)));

    const add = el('button', 'rep__add', '＋ ' + esc(f.addLabel || '추가'));
    add.type = 'button';
    add.disabled = f.max != null && items.length >= f.max;
    add.addEventListener('click', () => {
      const next = ctx.store.read(path);
      next.push(blank());
      ctx.store.write(path, next);
      if(cards) opened.add(path + '.' + (next.length - 1));
      ctx.onEdit?.(path);
      draw();
      const last = list.querySelector('.qc:nth-last-of-type(1)');
      last?.querySelector('textarea,input')?.focus();
    });
    list.appendChild(add);
  };

  draw();
  wrap.__redraw = draw;
  if(f.hint) wrap.appendChild(el('p', 'f__h', esc(f.hint)));
  return wrap;
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
    el('span', 'qc__w px', `${Math.floor(i / 5) + 1}-${(i % 5) + 1}`),
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
