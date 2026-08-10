/* 데이터 보관 — 경로 문자열로 읽고 씁니다.
   스키마의 field.path("quiz.0.options.2")가 그대로 데이터 위치가 됩니다. */

export const clone = v => JSON.parse(JSON.stringify(v));

export const joinPath = (base, rel) =>
  (base ? base + '.' : '') + rel;

export function get(obj, path){
  if(!path) return obj;
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function set(obj, path, value){
  const keys = path.split('.');
  let cur = obj;
  for(let i = 0; i < keys.length - 1; i++){
    const k = keys[i];
    if(cur[k] == null || typeof cur[k] !== 'object'){
      cur[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    }
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return obj;
}

/* ── 자동 저장 ──
   M1은 서버가 없습니다. 브라우저에만 저장하고, M2에서 서버 저장으로 옮깁니다. */
export function createStore(key, initial, onSave){
  let data = initial;
  let timer = null;

  try{
    const saved = localStorage.getItem(key);
    if(saved) data = JSON.parse(saved);
  }catch(e){
    console.warn('저장된 작업을 읽지 못했습니다. 샘플로 시작합니다.', e);
  }

  const save = () => {
    try{ localStorage.setItem(key, JSON.stringify(data)); }
    catch(e){ console.warn('저장 실패', e); }
    onSave?.('saved');
  };

  return {
    get data(){ return data; },
    read(path){ return get(data, path); },
    write(path, value){
      set(data, path, value);
      onSave?.('saving');
      clearTimeout(timer);
      timer = setTimeout(save, 500);
    },
    replace(next){
      data = next;
      onSave?.('saving');
      clearTimeout(timer);
      timer = setTimeout(save, 200);
    },
    reset(fresh){
      data = clone(fresh);
      localStorage.removeItem(key);
      save();
    }
  };
}
