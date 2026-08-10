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

/* ctx = { store, onEdit(path), onFocus(path), rerenderStep() } */
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

/* ── 라벨 ── */
function labelRow(f, forId){
  const wrap = el('label', null);
  if(forId) wrap.setAttribute('for', forId);
  wrap.innerHTML = esc(f.label)
    + (f.required ? '<span class="req">*</span>' : '')
    + (f.optional ? '<span class="opt">선택</span>' : '');
  return wrap;
}

function counter(f, input){
  if(!f.maxLength) return null;
  const c = el('span', 'count pix');
  const upd = () => {
    const n = [...String(input.value || '')].length;
    c.textContent = n + '/' + f.maxLength;
    const over = n > f.maxLength;
    c.dataset.over = over ? '1' : '0';
    input.classList.toggle('inp--over', over);
  };
  input.addEventListener('input', upd);
  upd();
  return { node:c, update:upd };
}

/* ── 글 ── */
function textField(f, ctx, path){
  const wrap = el('div', 'field');
  const id = 'f_' + path.replace(/\./g, '_');

  const input = f.type === 'longtext'
    ? el('textarea', 'inp')
    : el('input', 'inp');
  input.id = id;
  if(f.type !== 'longtext') input.type = 'text';
  if(f.rows) input.rows = f.rows;
  if(f.placeholder) input.placeholder = f.placeholder;
  input.value = ctx.store.read(path) ?? '';

  const lab = labelRow(f, id);
  const cnt = counter(f, input);
  if(cnt) lab.appendChild(cnt.node);

  input.addEventListener('input', () => {
    ctx.store.write(path, input.value);
    ctx.onEdit?.(path);
  });
  input.addEventListener('focus', () => ctx.onFocus?.(path));

  wrap.append(lab, input);
  if(f.hint) wrap.appendChild(el('p', 'hint', esc(f.hint)));
  return wrap;
}

/* ── 고르기 ── */
function select(f, ctx, path){
  const wrap = el('div', 'field');
  wrap.appendChild(labelRow(f));
  const box = el('div', 'choices');
  const cur = ctx.store.read(path) ?? f.default;
  const name = 'r_' + path.replace(/\./g, '_');

  for(const c of f.choices){
    const lab = el('label', 'choice');
    const r = el('input');
    r.type = 'radio'; r.name = name;
    r.checked = String(cur) === String(c.value);
    r.addEventListener('change', () => {
      ctx.store.write(path, c.value);
      ctx.onEdit?.(path);
      ctx.rerenderStep?.();          // 보기 방식이 바뀌면 폼 모양도 바뀝니다
    });
    const txt = el('div', null,
      `<b>${esc(c.label)}</b>` + (c.desc ? `<span>${esc(c.desc)}</span>` : ''));
    lab.append(r, txt);
    box.appendChild(lab);
  }
  wrap.appendChild(box);
  if(f.hint) wrap.appendChild(el('p', 'hint', esc(f.hint)));
  return wrap;
}

/* ── 켜고 끄기 ── */
function toggle(f, ctx, path){
  const wrap = el('div', 'field');
  const lab = el('label', 'switch');
  const inp = el('input');
  inp.type = 'checkbox';
  inp.checked = ctx.store.read(path) ?? f.default ?? false;
  inp.addEventListener('change', () => {
    ctx.store.write(path, inp.checked);
    ctx.onEdit?.(path);
  });
  lab.append(inp, el('span', 'track'), el('span', null, esc(f.label)));
  wrap.appendChild(lab);
  if(f.hint) wrap.appendChild(el('p', 'hint', esc(f.hint)));
  return wrap;
}

/* ── 정답 고르기 ──
   보기 중에서만 고를 수 있습니다. 그래서 "보기에 없는 정답"이
   구조적으로 만들어지지 않습니다. */
function answer(f, ctx, path, basePath){
  const wrap = el('div', 'field');
  wrap.appendChild(labelRow(f));
  const box = el('div', 'answer');
  wrap.appendChild(box);
  if(f.hint) wrap.appendChild(el('p', 'hint', esc(f.hint)));

  const optPath = joinPath(basePath, f.source);

  const draw = () => {
    const opts = get(ctx.store.data, optPath) || [];
    const cur  = ctx.store.read(path) ?? 0;
    box.innerHTML = '';
    opts.forEach((o, i) => {
      const b = el('button', 'answer__b');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(i === cur));
      b.append(
        el('span', 'answer__blk', CIRCLED[i] || String(i + 1)),
        el('span', 'answer__t', esc(String(o).trim() || '—'))
      );
      b.addEventListener('click', () => {
        ctx.store.write(path, i);
        ctx.onEdit?.(path);
        draw();
      });
      box.appendChild(b);
    });
    if(!opts.length) box.appendChild(el('p', 'hint', '보기를 먼저 채워주세요.'));
  };

  draw();
  wrap.__refresh = draw;      // 보기 글자가 바뀌면 다시 그립니다
  return wrap;
}

/* ── 반복 ── */
function repeater(f, ctx, path){
  const wrap = el('div', 'field');
  const isCards = Array.isArray(f.fields);

  if(!isCards) wrap.appendChild(labelRow(f));
  const list = el('div', isCards ? 'rep rep--cards' : 'rep');
  wrap.appendChild(list);

  const blank = () => isCards
    ? Object.fromEntries(f.fields.map(x => [x.path, x.default ?? (x.type === 'repeater' ? ['', '', '', '', ''] : '')]))
    : '';

  const draw = () => {
    let items = ctx.store.read(path);
    if(!Array.isArray(items)){ items = []; ctx.store.write(path, items); }
    list.innerHTML = '';

    items.forEach((_, i) => list.appendChild(
      isCards ? card(f, ctx, path, i, items.length, draw)
              : row(f, ctx, path, i, items.length, draw)
    ));

    const add = el('button', 'rep__add', '＋ ' + esc(f.addLabel || '추가'));
    add.type = 'button';
    add.disabled = f.max != null && items.length >= f.max;
    add.addEventListener('click', () => {
      const next = ctx.store.read(path);
      next.push(blank());
      ctx.store.write(path, next);
      ctx.onEdit?.(path);
      draw();
    });
    list.appendChild(add);
  };

  draw();
  if(f.hint) wrap.appendChild(el('p', 'hint', esc(f.hint)));
  return wrap;
}

/* 한 줄짜리 반복 항목 */
function row(f, ctx, path, i, count, redraw){
  const r = el('div', 'rep__row');
  const itemPath = path + '.' + i;

  r.appendChild(el('span', 'rep__n pix', f.numbered ? (CIRCLED[i] || i + 1) : String(i + 1)));

  const inp = el('input', 'inp');
  inp.type = 'text';
  inp.value = ctx.store.read(itemPath) ?? '';
  if(f.maxLength) inp.setAttribute('aria-describedby', '');
  inp.addEventListener('input', () => {
    ctx.store.write(itemPath, inp.value);
    ctx.onEdit?.(itemPath);
    refreshAnswers(r);
  });
  inp.addEventListener('focus', () => ctx.onFocus?.(itemPath));
  r.appendChild(inp);

  const x = el('button', 'rep__x', '✕');
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

/* 여러 필드를 묶은 카드 (문제) */
function card(f, ctx, path, i, count, redraw){
  const itemPath = path + '.' + i;
  const c = el('div', 'qcard');
  c.dataset.index = i;

  const world = Math.floor(i / 5) + 1;
  const top = el('div', 'qcard__top');
  top.append(
    el('span', 'qcard__no pix', (f.itemLabel || 'Q{n}').replace('{n}', i + 1)),
    el('span', 'qcard__ttl', esc(preview(ctx, itemPath))),
    el('span', 'qcard__world pix', `WORLD ${world}-${(i % 5) + 1}`)
  );

  const x = el('button', 'rep__x', '✕');
  x.type = 'button';
  x.title = '이 문제 지우기';
  x.disabled = count <= (f.min ?? 1);
  x.addEventListener('click', () => {
    const arr = ctx.store.read(path);
    arr.splice(i, 1);
    ctx.store.write(path, arr);
    ctx.onEdit?.(path);
    redraw();
  });
  top.appendChild(x);

  const body = el('div', 'qcard__body');
  const shown = f.fields.filter(sub => visible(sub, ctx, itemPath));
  renderFields(body, shown, ctx, itemPath);

  c.append(top, body);
  body.addEventListener('input', () => {
    top.querySelector('.qcard__ttl').textContent = preview(ctx, itemPath);
  });
  c.addEventListener('focusin', () => {
    document.querySelectorAll('.qcard--on').forEach(n => n.classList.remove('qcard--on'));
    c.classList.add('qcard--on');
    ctx.onCard?.(i + 1);
  });
  return c;
}

/* 보기 방식이 "번호만"이면 보기 글자칸은 숨깁니다 */
function visible(sub, ctx, itemPath){
  if(sub.path !== 'options') return true;
  return (ctx.store.read(itemPath + '.layout') ?? 'text') !== 'numbers';
}

function preview(ctx, itemPath){
  const q = String(ctx.store.read(itemPath + '.question') ?? '').replace(/\s+/g, ' ').trim();
  return q || '문제를 입력해주세요';
}

/* 보기 글자가 바뀌면 같은 카드의 정답 블록 글자도 따라갑니다 */
function refreshAnswers(node){
  const card = node.closest('.qcard');
  if(!card) return;
  card.querySelectorAll('.field').forEach(f => f.__refresh?.());
}
