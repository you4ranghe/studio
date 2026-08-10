/* ══════════════════════════════════════════════════════════
   편집기
   ── 폼(왼쪽·가운데)과 결과물(오른쪽)을 잇습니다.
   ── 결과물은 iframe 안에서 진짜로 돌아가는 렌더러입니다.
   ══════════════════════════════════════════════════════════ */
import { createStore, clone, get } from './store.js';
import { renderFields } from './schema-form.js';
import { loadTemplate, buildSingleFile, download, prettySize } from './build.js';

const $ = s => document.querySelector(s);

const params  = new URLSearchParams(location.search);
const tplId   = params.get('t') || 'dol-quiz';
const tplDir  = '../templates/' + tplId;
const saveKey = 'studio:project:' + tplId;

let tpl, store, stepIndex = 0;
let outline = [], slideIndex = 0;

/* ══ 시작 ══ */
init().catch(err => {
  $('#stepTitle').textContent = '템플릿을 불러오지 못했습니다';
  $('#stepDesc').textContent = err.message + ' — 개발 서버(npm run dev)로 열었는지 확인해주세요.';
  console.error(err);
});

async function init(){
  tpl = await loadTemplate(tplDir);

  $('#doc').textContent = tpl.meta.name;
  document.title = tpl.meta.name + ' 편집 — 스튜디오';

  store = createStore(saveKey, clone(tpl.sample), state => {
    const el = $('#saved');
    el.dataset.state = state;
    el.textContent = state === 'saving' ? '저장 중' : '저장됨';
  });

  $('#frame').src = tplDir + '/renderer.html';

  buildRail();
  buildMarkupHelp();
  wire();
  showStep(0);
}

/* ══ 좌측 스테이지 ══ */
function buildRail(){
  const host = $('#stages');
  const sel  = $('#stepSel');
  host.innerHTML = '';
  sel.innerHTML  = '';

  tpl.schema.steps.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'stage';
    b.dataset.step = i;
    b.innerHTML = `<span class="box">${i + 1}</span><span class="nm"></span><span class="ct"></span>`;
    b.querySelector('.nm').textContent = s.label;
    b.addEventListener('click', () => showStep(i));
    host.appendChild(b);

    const o = document.createElement('option');
    o.value = i;
    o.textContent = `${i + 1}. ${s.label}`;
    sel.appendChild(o);
  });
}

function refreshRail(){
  const steps = tpl.schema.steps;
  let filled = 0, total = 0;

  steps.forEach((s, i) => {
    const st = stepStatus(s);
    filled += st.filled;
    total  += st.total;

    const b = $(`.stage[data-step="${i}"]`);
    if(!b) return;
    b.dataset.done = st.total > 0 && st.filled === st.total ? '1' : '0';
    b.setAttribute('aria-current', i === stepIndex ? 'step' : 'false');
    b.querySelector('.ct').textContent = st.count == null ? '' : st.count;
  });

  const pct = total ? Math.round(filled / total * 100) : 0;
  $('#meterBar').style.width = pct + '%';
  $('#meterTxt').textContent = pct === 100
    ? '다 채웠습니다. 내려받으면 끝입니다.'
    : `필수 항목 ${filled} / ${total}`;
  $('#stepSel').value = String(stepIndex);
}

/* 필수 항목이 얼마나 찼는지 — 진행률과 스테이지 표시에 씁니다 */
function stepStatus(step){
  let filled = 0, total = 0, count = null;

  const walk = (fields, base) => {
    for(const f of fields){
      const path = (base ? base + '.' : '') + f.path;

      if(f.type === 'repeater'){
        const items = get(store.data, path) || [];
        if(f.fields) count = items.length;
        if(f.min){
          total++;
          const ok = items.filter(v => f.fields ? true : String(v ?? '').trim()).length >= f.min;
          if(ok) filled++;
        }
        if(f.fields) items.forEach((_, i) => walk(f.fields, path + '.' + i));
        continue;
      }
      if(!f.required) continue;
      total++;
      const v = get(store.data, path);
      if(typeof v === 'number' ? true : String(v ?? '').trim()) filled++;
    }
  };

  walk(step.fields, '');
  return { filled, total, count };
}

/* ══ 가운데 폼 ══ */
function showStep(i){
  stepIndex = Math.max(0, Math.min(tpl.schema.steps.length - 1, i));
  const step = tpl.schema.steps[stepIndex];

  $('#eyebrow').textContent   = `STEP ${stepIndex + 1} / ${tpl.schema.steps.length}`;
  $('#stepTitle').textContent = step.label;
  $('#stepDesc').textContent  = step.desc || '';

  renderFields($('#fields'), step.fields, ctx());

  $('#stepPrev').disabled = stepIndex === 0;
  const last = stepIndex === tpl.schema.steps.length - 1;
  $('#stepNext').textContent = last ? '내려받기 →' : '다음 →';
  $('#markup').hidden = !usesMarkup(step);

  $('.form').scrollTop = 0;
  refreshRail();
  push();
  jumpFor(step.id);
}

function ctx(){
  return {
    store,
    onEdit(){ refreshRail(); push(); },
    onFocus(path){ jumpFor(path); },
    onCard(no){ post({ type:'studio:question', no, kind:'quiz' }); },
    rerenderStep(){ showStep(stepIndex); }
  };
}

function usesMarkup(step){
  const any = fs => fs.some(f => f.markup || (f.fields && any(f.fields)));
  return any(step.fields);
}

function buildMarkupHelp(){
  const rows = (tpl.schema.markupHelp || [])
    .map(m => `<li><code>${m.syntax}</code> ${m.result}</li>`).join('');
  $('#markup').innerHTML = `<b>글자 꾸미기</b>${rows ? `<ul>${rows}</ul>` : ''}`;
}

/* ══ 미리보기 연결 ══ */
let pushTimer = null;
function push(){
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => post({ type:'studio:data', data: store.data }), 180);
}
function post(msg){
  $('#frame').contentWindow?.postMessage(msg, '*');
}

/* 지금 고치고 있는 곳으로 미리보기를 옮깁니다 */
function jumpFor(path){
  const to = kind => {
    const i = outline.findIndex(s => s.type === kind);
    if(i >= 0) post({ type:'studio:goto', index: i });
  };
  const m = /^quiz\.(\d+)/.exec(path);
  if(m) return post({ type:'studio:question', no: +m[1] + 1, kind:'quiz' });
  if(path.startsWith('greeting') || path === 'intro') return to('message');
  if(path.startsWith('rules'))    return to('rules');
  if(path.startsWith('start'))    return to('start');
  if(path.startsWith('ending'))   return to('clear');
  if(path.startsWith('cover') || path.startsWith('hud') || path === 'basic') return to('title');
  if(path === 'quiz') return post({ type:'studio:question', no:1, kind:'quiz' });
}

window.addEventListener('message', e => {
  const m = e.data;
  if(!m || m.type !== 'studio:state') return;
  outline    = m.outline || [];
  slideIndex = m.index;
  $('#pPos').textContent = String(m.index + 1).padStart(2, '0') + ' / ' + String(m.total).padStart(2, '0');
  $('#pNow').textContent = outline[m.index]?.nav || '';
});

/* iframe이 준비되면 첫 데이터를 보냅니다 */
$('#frame').addEventListener('load', () => { push(); });

/* ══ 조작 ══ */
function wire(){
  $('#stepPrev').addEventListener('click', () => showStep(stepIndex - 1));
  $('#stepNext').addEventListener('click', () => {
    if(stepIndex === tpl.schema.steps.length - 1) doDownload();
    else showStep(stepIndex + 1);
  });
  $('#stepSel').addEventListener('change', e => showStep(+e.target.value));

  $('#pPrev').addEventListener('click', () => post({ type:'studio:goto', index: slideIndex - 1 }));
  $('#pNext').addEventListener('click', () => post({ type:'studio:goto', index: slideIndex + 1 }));

  $('#pOpen').addEventListener('click', async () => {
    const blob = await buildSingleFile(tpl, store.data);
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });

  $('#dl').addEventListener('click', doDownload);

  /* 되돌리기는 한 번 더 눌러야 실행됩니다 — 모달 대신 버튼이 물어봅니다 */
  const reset = $('#reset');
  let armed = null;
  reset.addEventListener('click', () => {
    if(armed){
      clearTimeout(armed); armed = null;
      store.reset(tpl.sample);
      reset.textContent = '샘플로 되돌리기';
      showStep(0);
      return;
    }
    reset.textContent = '한 번 더 누르면 되돌립니다';
    armed = setTimeout(() => { armed = null; reset.textContent = '샘플로 되돌리기'; }, 4000);
  });

  $('#tabForm').addEventListener('click', () => setPane('form'));
  $('#tabPrev').addEventListener('click', () => setPane('prev'));
}

function setPane(p){
  document.body.dataset.pane = p;
  $('#tabForm').setAttribute('aria-selected', String(p === 'form'));
  $('#tabPrev').setAttribute('aria-selected', String(p === 'prev'));
}

async function doDownload(){
  const btn = $('#dl');
  const was = btn.textContent;
  btn.disabled = true;
  btn.textContent = '만드는 중…';
  try{
    const blob = await buildSingleFile(tpl, store.data);
    const name = String(store.read('hud.name') || '돌잔치').trim();
    download(blob, `${name} 퀴즈.html`);
    btn.textContent = prettySize(blob.size) + ' 내려받음';
    setTimeout(() => { btn.textContent = was; }, 2600);
  }catch(err){
    console.error(err);
    btn.textContent = '만들지 못했습니다';
    setTimeout(() => { btn.textContent = was; }, 2600);
  }finally{
    btn.disabled = false;
  }
}
