/* ══════════════════════════════════════════════════════════
   편집기
   ── 왼쪽은 단계가 아니라 "만들어지는 결과물의 목차"입니다.
   ── 가운데 폼과 오른쪽 미리보기가 그 목차를 따라 함께 움직입니다.
   ══════════════════════════════════════════════════════════ */
import { createStore, clone, get } from './store.js';
import { renderFields, openCard, optIn } from './schema-form.js';
import { loadTemplate, buildSingleFile, download, prettySize } from './build.js';
import { images, hydrate, collectIds } from './imagestore.js';

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const tplId   = new URLSearchParams(location.search).get('t') || 'dol-quiz';
const tplDir  = '../templates/' + tplId;
const saveKey = 'studio:project:' + tplId;

/* 장면의 세계 → 무대 뒤에 깔리는 빛 */
const TINT = {
  dawn:'#F0A05A', overworld:'#5C94FC', underground:'#2B49A8', castle:'#4B2E8C'
};
const tintOf = s => {
  if(!s) return TINT.dawn;
  if(s.type === 'clear') return TINT.castle;
  if(!s.no) return TINT.dawn;
  return Math.floor((s.no - 1) / 5) % 2 === 0 ? TINT.overworld : TINT.underground;
};

let tpl, store, rows = [], outline = [], slideIndex = 0, spy;

init().catch(err => {
  $('#sections').innerHTML =
    `<div class="sec"><h1 class="sec__t">템플릿을 불러오지 못했습니다</h1>
     <p class="sec__d">${err.message}<br>개발 서버(<code>npm run dev</code>)로 열었는지 확인해주세요.</p></div>`;
  console.error(err);
});

async function init(){
  /* 사진은 작업 JSON이 아니라 IndexedDB에 있습니다(imagestore.js).
     폼을 그리기 전에 한 번 다 읽어와야 썸네일과 미리보기가 바로 나옵니다. */
  const [t] = await Promise.all([loadTemplate(tplDir), images.load()]);
  tpl = t;
  $('#doc').textContent = tpl.meta.name;
  document.title = tpl.meta.name + ' — 스튜디오';

  store = createStore(saveKey, clone(tpl.sample), state => {
    const el = $('#state');
    el.dataset.state = state;
    el.textContent = state === 'saving' ? '저장 중' : '저장됨';
  });

  $('#frame').src = tplDir + '/renderer.html';

  renderSections();
  buildRail();
  wire();
  push();
  sweep();
}

/* 어디에서도 안 쓰는 사진 치우기 — 보기나 문제를 지우면 사진이 남습니다.
   저장이 끝난 뒤에 몰아서 합니다. */
let sweepT = null;
function sweep(){
  clearTimeout(sweepT);
  sweepT = setTimeout(() => images.gc(collectIds(store.data), tplId), 2500);
}

/* ══ 폼 — 한 화면에 쭉. 문제 카드는 접혀 있습니다 ══ */
function renderSections(){
  const host = $('#sections');
  host.innerHTML = '';

  let lastGroup = null;

  tpl.schema.sections.forEach(sec => {
    const s = document.createElement('section');
    s.className = 'sec';
    s.id = 'sec-' + sec.id;
    s.dataset.railKey = sec.id;

    /* 구획 이름은 바뀔 때만 보여줍니다. 네 번 연달아 "인트로"는 소음입니다 */
    const showGroup = sec.group !== lastGroup;
    lastGroup = sec.group;

    const h = document.createElement('div');
    h.className = 'sec__h';
    h.innerHTML =
      (showGroup ? `<div class="sec__k px">${sec.group}</div>` : '') +
      `<h2 class="sec__t"></h2>
       ${sec.desc ? '<p class="sec__d"></p>' : ''}`;
    h.querySelector('.sec__t').textContent = sec.label;
    if(sec.desc) h.querySelector('.sec__d').textContent = sec.desc;
    s.appendChild(h);

    const body = document.createElement('div');
    renderFields(body, sec.fields, ctx());
    s.appendChild(body);

    if(usesMarkup(sec.fields)) s.appendChild(markupHelp());
    host.appendChild(s);
  });

  observeSections();
}

function usesMarkup(fs){
  return fs.some(f => f.markup || (Array.isArray(f.fields) && usesMarkup(f.fields)));
}

function markupHelp(){
  const d = document.createElement('div');
  d.className = 'mk';
  d.innerHTML = '<b>글자 꾸미기</b>' + (tpl.schema.markupHelp || [])
    .map(m => `<span><code>${m.syntax}</code>${m.result}</span>`).join('');
  return d;
}

function ctx(){
  return {
    store,
    prompts: tpl.prompts,
    /* 사진칸이 쓰는 창구. add에 템플릿 id를 물려 다른 작업의 사진과 섞이지 않게 합니다. */
    images: {
      get: id => images.get(id),
      url: id => images.url(id),
      add: file => images.add(file, tplId)
    },
    onEdit(path){
      push();
      refreshProgress();
      sweep();
      if(path === 'quiz' || /^quiz\.\d+\.(question|answerIndex|options)/.test(path)) buildRail();
    },
    onFocus(path){ jumpTo(path); },
    onCard(no){ post({ type:'studio:question', no, kind:'quiz' }); markRail('q' + (no - 1)); },
    rerender(){ renderSections(); buildRail(); }
  };
}

/* ══ 왼쪽 — 결과물 목차 ══ */
function buildRail(){
  const host = $('#rail');
  const jump = $('#jump');
  const groups = [];
  rows = [];

  tpl.schema.sections.forEach(sec => {
    if(sec.id === 'quiz'){
      const items = store.read('quiz') || [];
      for(let w = 0; w * 5 < Math.max(items.length, 1); w++){
        const slice = items.slice(w * 5, w * 5 + 5);
        if(!slice.length) break;
        groups.push({
          title: `WORLD ${w + 1}`,
          sub: w % 2 === 0 ? '지상' : '지하',
          rows: slice.map((q, k) => {
            const i = w * 5 + k;
            const opts = (q.options || []).map(optIn);
            const txt = String(q.question || '').replace(/\s+/g, ' ').trim();
            return {
              key:'q' + i,
              num:'Q' + (i + 1),
              title: q.nav?.trim() || txt || '빈 문제',
              ans: opts.length ? ('①②③④⑤⑥⑦⑧⑨⑩'[q.answerIndex ?? 0] || '') : '',
              incomplete: !txt || (q.layout !== 'numbers' && opts.filter(filled).length < 2),
              target:'#qc-' + i,
              no: i + 1
            };
          })
        });
      }
      return;
    }

    const g = groups.find(x => x.title === sec.group && !x.sub) || (() => {
      const n = { title: sec.group, sub:'', rows: [] };
      groups.push(n); return n;
    })();

    g.rows.push({
      key: sec.id,
      num: '',
      title: sec.label,
      ans: '',
      incomplete: sectionEmpty(sec),
      target: '#sec-' + sec.id,
      slide: sec.slide
    });
  });

  host.innerHTML = '';
  jump.innerHTML = '';

  groups.forEach(g => {
    const box = document.createElement('div');
    box.className = 'rgroup';
    box.innerHTML = `<div class="rgroup__h"><span class="rgroup__t">${g.title}</span>` +
                    (g.sub ? `<span class="rgroup__s">${g.sub}</span>` : '') + '</div>';

    g.rows.forEach(r => {
      rows.push(r);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rrow';
      b.dataset.key = r.key;
      b.innerHTML =
        `<span class="rrow__n px">${r.num}</span><span class="rrow__t"></span>` +
        (r.ans ? `<span class="rrow__a px">${r.ans}</span>` : '') +
        (r.incomplete ? '<span class="rrow__dot" title="아직 덜 채웠습니다"></span>' : '');
      b.querySelector('.rrow__t').textContent = r.title;
      b.addEventListener('click', () => goTo(r));
      box.appendChild(b);

      const o = document.createElement('option');
      o.value = r.key;
      o.textContent = (r.num ? r.num + ' ' : '') + r.title;
      jump.appendChild(o);
    });

    host.appendChild(box);
  });

  refreshProgress();
  observeSections();
}

/* 폼을 목적지까지 굴립니다.
   CSS scroll-behavior:smooth 가 이 컨테이너에서 동작하지 않아 직접 그립니다. */
let glideId = null;
function glide(target){
  const box = $('#form');
  if(!target) return;
  const to = Math.max(0, Math.min(
    box.scrollHeight - box.clientHeight,
    box.scrollTop + target.getBoundingClientRect().top - box.getBoundingClientRect().top - 16));

  cancelAnimationFrame(glideId);
  /* 화면에 안 보이는 탭에서는 rAF가 멈춥니다. 애니메이션 없이 바로 옮깁니다. */
  if(document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches){
    box.scrollTop = to;
    return;
  }

  const from = box.scrollTop, dist = to - from;
  if(Math.abs(dist) < 2) return;
  const dur = Math.min(560, 220 + Math.abs(dist) * 0.28);
  const t0 = performance.now();

  const step = now => {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);          // ease-out
    box.scrollTop = from + dist * e;
    if(p < 1) glideId = requestAnimationFrame(step);
  };
  glideId = requestAnimationFrame(step);
}

function goTo(r){
  if(r.key.startsWith('q')){
    const i = +r.key.slice(1);
    openCard('quiz.' + i);
    const card = document.querySelector('#qc-' + i);
    const head = card?.querySelector('.qc__h');
    if(head && head.getAttribute('aria-expanded') === 'false') head.click();
    glide(card);
    post({ type:'studio:question', no: r.no, kind:'quiz' });
  }else{
    glide(document.querySelector(r.target));
    jumpToSlide(r.slide);
  }
  markRail(r.key);
  if(innerWidth <= 1240) setPane('form');
}

function markRail(key){
  $$('.rrow').forEach(b => b.setAttribute('aria-current', String(b.dataset.key === key)));
  $('#jump').value = key;
}

/* 스크롤에 따라 왼쪽 목차가 따라옵니다 */
function observeSections(){
  spy?.disconnect();
  spy = new IntersectionObserver(entries => {
    const vis = entries.filter(e => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if(!vis) return;
    const el = vis.target;
    markRail(el.id.startsWith('qc-') ? 'q' + el.id.slice(3) : el.dataset.railKey);
  }, { root: $('#form'), rootMargin:'-8% 0px -70% 0px', threshold:0 });

  $$('.sec').forEach(n => { if(n.id !== 'sec-quiz') spy.observe(n); });
  $$('.qc').forEach(n => spy.observe(n));
}

/* ══ 진행률 ══ */
/* 보기는 글자나 사진 중 하나만 있어도 채운 것으로 봅니다 */
const filled = o => !!(o.t.trim() || o.img);

function sectionEmpty(sec){
  const walk = fs => fs.some(f => {
    if(f.type === 'repeater' && !f.fields){
      const a = get(store.data, f.path) || [];
      return f.min > 0 && a.filter(v => String(v ?? '').trim()).length < f.min;
    }
    if(!f.required) return false;
    return !String(get(store.data, f.path) ?? '').trim();
  });
  return walk(sec.fields);
}

function refreshProgress(){
  const items = store.read('quiz') || [];
  const need = [];

  need.push(!!String(store.read('hud.name') ?? '').trim());
  items.forEach(q => {
    need.push(!!String(q.question ?? '').trim());
    need.push(q.layout === 'numbers'
      ? true
      : (q.options || []).map(optIn).filter(filled).length >= 2);
  });

  const done = need.filter(Boolean).length;
  const pct  = need.length ? Math.round(done / need.length * 100) : 0;
  $('#progBar').style.width = pct + '%';
  $('#progN').textContent = pct + '%';
  $('#progT').textContent = pct === 100
    ? '다 채웠습니다. 내려받으면 끝입니다.'
    : `필수 항목 ${done} / ${need.length}`;
}

/* ══ 미리보기 ══ */
/* 작업 데이터에는 사진 id만 들어 있습니다(imagestore.js).
   미리보기와 내려받기는 둘 다 진짜 사진이 박힌 판을 받아야 합니다. */
const withImages = () => hydrate(store.data);

let t = null;
function push(){
  clearTimeout(t);
  t = setTimeout(() => post({ type:'studio:data', data: withImages() }), 160);
}
function post(msg){ $('#frame').contentWindow?.postMessage(msg, '*'); }

function jumpToSlide(type){
  const i = outline.findIndex(s => s.type === type);
  if(i >= 0) post({ type:'studio:goto', index: i });
}

function jumpTo(path){
  const m = /^quiz\.(\d+)/.exec(path);
  if(m) return post({ type:'studio:question', no:+m[1] + 1, kind:'quiz' });
  const sec = tpl.schema.sections.find(s => path.startsWith(s.id) ||
    (s.id === 'cover' && (path.startsWith('cover') || path.startsWith('hud'))));
  if(sec) jumpToSlide(sec.slide);
}

window.addEventListener('message', e => {
  const m = e.data;
  if(!m || m.type !== 'studio:state') return;
  outline    = m.outline || [];
  slideIndex = m.index;
  const now = outline[m.index];
  $('#pPos').textContent = String(m.index + 1).padStart(2,'0') + ' / ' + String(m.total).padStart(2,'0');
  $('#pNow').textContent = now?.nav || '';
  document.querySelector('.stage').style.setProperty('--world', tintOf(now));
});

$('#frame').addEventListener('load', push);

/* ══ 조작 ══ */
function wire(){
  $('#pPrev').addEventListener('click', () => post({ type:'studio:goto', index: slideIndex - 1 }));
  $('#pNext').addEventListener('click', () => post({ type:'studio:goto', index: slideIndex + 1 }));
  $('#pOpen').addEventListener('click', openNewTab);
  $('#dl').addEventListener('click', doDownload);
  $('#jump').addEventListener('change', e => {
    const r = rows.find(x => x.key === e.target.value);
    if(r) goTo(r);
  });
  $('#tabForm').addEventListener('click', () => setPane('form'));
  $('#tabStage').addEventListener('click', () => setPane('stage'));

  /* 테마 */
  const ico = $('#themeIco');
  const paint = () => ico.innerHTML =
    `<use href="#i-${document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon'}"/>`;
  paint();
  $('#theme').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('studio:theme', next);
    paint();
  });

  /* 되돌리기는 한 번 더 눌러야 실행됩니다 — 모달을 띄우지 않습니다 */
  const reset = $('#reset');
  let armed = null;
  reset.addEventListener('click', () => {
    if(armed){
      clearTimeout(armed); armed = null;
      store.reset(tpl.sample);
      reset.textContent = '샘플로 되돌리기';
      renderSections(); buildRail(); push(); sweep();
      return;
    }
    reset.textContent = '한 번 더 누르면 되돌립니다';
    armed = setTimeout(() => { armed = null; reset.textContent = '샘플로 되돌리기'; }, 4000);
  });
}

function setPane(p){
  document.body.dataset.pane = p;
  $('#tabForm').setAttribute('aria-selected', String(p === 'form'));
  $('#tabStage').setAttribute('aria-selected', String(p === 'stage'));
}

async function openNewTab(){
  const blob = await buildSingleFile(tpl, withImages());
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function doDownload(){
  const btn = $('#dl');
  const was = btn.textContent;
  btn.disabled = true;
  btn.textContent = '만드는 중';
  try{
    const blob = await buildSingleFile(tpl, withImages());
    download(blob, `${String(store.read('hud.name') || '돌잔치').trim()} 퀴즈.html`);
    btn.textContent = prettySize(blob.size) + ' 내려받음';
  }catch(err){
    console.error(err);
    btn.textContent = '만들지 못했습니다';
  }finally{
    btn.disabled = false;
    setTimeout(() => { btn.textContent = was; }, 2600);
  }
}
