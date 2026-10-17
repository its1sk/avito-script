// ==UserScript==
// @name         Avito — скрыть продавцов + мои поиски
// @namespace    avito-seller-blocker
// @version      5.1
// @description  Скрытие продавцов, сохранённые поиски, стоп-слова, лента новых объявлений по всем поискам
// @match        https://www.avito.ru/*
// @match        https://m.avito.ru/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_notification
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/its1sk/avito-script/main/avito.user.js
// @downloadURL  https://raw.githubusercontent.com/its1sk/avito-script/main/avito.user.js
// ==/UserScript==

(function () {
  'use strict';

  const STORE_KEY = 'blockedSellers'; // { key: name }
  const PROCESSED = 'data-asb-done';

  // ---------- хранилище ----------
  const load = () => {
    try { return JSON.parse(GM_getValue(STORE_KEY, '{}')) || {}; }
    catch { return {}; }
  };
  const save = (obj) => GM_setValue(STORE_KEY, JSON.stringify(obj));
  let blocked = load();

  // ---------- поиск продавца в карточке ----------
  // Ссылки на профиль: магазины — /brands/<id>, частники — /user/<hash>/profile
  const SELLER_LINK_RE = /\/(brands|user)\/([^/?#]+)/;

  function getSeller(item) {
    const links = item.querySelectorAll('a[href]');
    for (const a of links) {
      const m = a.getAttribute('href').match(SELLER_LINK_RE);
      if (m) {
        // внутри ссылки: <p>Имя</p> + рейтинг и отзывы — берём только имя
        const name = (a.querySelector('p')?.textContent || a.textContent || '').trim() ||
          (a.querySelector('img')?.alt || '').trim() || m[2];
        return { key: `${m[1]}:${m[2]}`, name };
      }
    }
    // Запасной вариант: блок с информацией о продавце (имена классов у Авито хешированы,
    // поэтому ищем по частичному совпадению)
    const info = item.querySelector(
      '[data-marker*="seller"], [class*="userInfo"], [class*="seller-info"], [class*="sellerInfo"]'
    );
    if (info) {
      const nameEl = info.querySelector('p, span, a') || info;
      const name = (nameEl.textContent || '').trim().split('\n')[0].slice(0, 80);
      if (name) return { key: `name:${name.toLowerCase()}`, name };
    }
    return null;
  }

  // ---------- кнопка и скрытие ----------
  function hideIfBlocked(item) {
    const key = item.getAttribute('data-asb-key');
    item.style.display = key && blocked[key] ? 'none' : '';
  }

  function addButton(item, seller) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '🚫 Скрыть продавца';
    btn.title = `Скрыть все объявления: ${seller.name}`;
    Object.assign(btn.style, {
      marginTop: '6px', padding: '4px 10px', fontSize: '12px',
      border: '1px solid #e0e0e0', borderRadius: '8px', background: '#fff',
      color: '#d32f2f', cursor: 'pointer', position: 'relative', zIndex: 5,
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      blocked[seller.key] = seller.name;
      save(blocked);
      applyAll();
      toast(`Скрыт продавец: ${seller.name}`, seller.key);
    });

    // Ставим кнопку рядом с именем продавца, иначе в конец карточки
    const anchor = [...item.querySelectorAll('a[href]')]
      .find((a) => SELLER_LINK_RE.test(a.getAttribute('href')));
    const host = anchor?.parentElement || item;
    host.appendChild(btn);
  }

  function processItem(item) {
    if (item.hasAttribute(PROCESSED)) return;
    const seller = getSeller(item);
    if (!seller) return; // продавец мог ещё не подгрузиться — попробуем позже
    item.setAttribute(PROCESSED, '1');
    item.setAttribute('data-asb-key', seller.key);
    addButton(item, seller);
    hideIfBlocked(item);
  }

  const ITEM_SELECTOR = '[data-marker="item"]';

  function scan() {
    document.querySelectorAll(ITEM_SELECTOR).forEach(processItem);
  }
  function applyAll() {
    document.querySelectorAll(`${ITEM_SELECTOR}[data-asb-key]`).forEach(hideIfBlocked);
  }

  // ---------- уведомление с отменой ----------
  function toast(text, undoKey) {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)',
      background: '#222', color: '#fff', padding: '10px 16px', borderRadius: '10px',
      fontSize: '14px', zIndex: 99999, display: 'flex', gap: '12px', alignItems: 'center',
    });
    el.textContent = text;
    if (undoKey) {
      const undo = document.createElement('button');
      undo.textContent = 'Отменить';
      Object.assign(undo.style, {
        background: 'none', border: 'none', color: '#4fc3f7', cursor: 'pointer', fontSize: '14px',
      });
      undo.onclick = () => {
        delete blocked[undoKey];
        save(blocked);
        applyAll();
        el.remove();
      };
      el.appendChild(undo);
    }
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  // ---------- панель управления списком ----------
  function openManager() {
    document.getElementById('asb-panel')?.remove();
    const panel = document.createElement('div');
    panel.id = 'asb-panel';
    Object.assign(panel.style, {
      position: 'fixed', top: '80px', right: '12px', width: 'min(340px, calc(100vw - 24px))', maxHeight: '70vh',
      overflow: 'auto', background: '#fff', border: '1px solid #ddd', borderRadius: '12px',
      boxShadow: '0 8px 24px rgba(0,0,0,.15)', padding: '14px', zIndex: 99999,
      fontSize: '14px', color: '#000',
    });

    const render = () => {
      panel.innerHTML = '';
      const head = document.createElement('div');
      head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px';
      head.innerHTML = `<b>Скрытые продавцы (${Object.keys(blocked).length})</b>`;
      const close = document.createElement('button');
      close.textContent = '✕';
      close.style.cssText = 'border:none;background:none;font-size:16px;cursor:pointer';
      close.onclick = () => panel.remove();
      head.appendChild(close);
      panel.appendChild(head);

      const keys = Object.keys(blocked);
      if (!keys.length) {
        panel.insertAdjacentHTML('beforeend', '<div style="color:#888">Список пуст</div>');
      }
      keys.forEach((k) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid #f0f0f0';
        const label = document.createElement('span');
        label.textContent = blocked[k];
        label.title = k;
        const rm = document.createElement('button');
        rm.textContent = 'Показать';
        rm.style.cssText = 'border:1px solid #ddd;background:#fff;border-radius:6px;cursor:pointer;font-size:12px';
        rm.onclick = () => { delete blocked[k]; save(blocked); applyAll(); render(); };
        row.append(label, rm);
        panel.appendChild(row);
      });

      // экспорт / импорт
      const tools = document.createElement('div');
      tools.style.cssText = 'display:flex;gap:8px;margin-top:12px';
      const exp = document.createElement('button');
      exp.textContent = 'Экспорт';
      exp.onclick = () => prompt('Скопируйте список:', JSON.stringify(blocked));
      const imp = document.createElement('button');
      imp.textContent = 'Импорт';
      imp.onclick = () => {
        const s = prompt('Вставьте список (JSON):');
        if (!s) return;
        try { blocked = { ...blocked, ...JSON.parse(s) }; save(blocked); applyAll(); render(); }
        catch { alert('Неверный формат'); }
      };
      [exp, imp].forEach((b) => (b.style.cssText = 'border:1px solid #ddd;background:#fff;border-radius:6px;cursor:pointer;padding:4px 10px'));
      tools.append(exp, imp);
      panel.appendChild(tools);
    };

    render();
    document.body.appendChild(panel);
  }

  // Плавающая кнопка открытия списка
  function addFab() {
    if (document.getElementById('asb-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'asb-fab';
    fab.textContent = '🚫';
    fab.title = 'Скрытые продавцы';
    Object.assign(fab.style, {
      position: 'fixed', right: '20px', bottom: '90px', width: '44px', height: '44px',
      borderRadius: '50%', border: '1px solid #ddd', background: '#fff', fontSize: '20px',
      cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,.15)', zIndex: 99998,
    });
    fab.onclick = openManager;
    document.body.appendChild(fab);
  }

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('Скрытые продавцы', openManager);
  }

  // ---------- запуск и отслеживание подгрузки ----------
  addFab();
  scan();
  let timer = null;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(scan, 200);
  }).observe(document.body, { childList: true, subtree: true });
})();


// =====================================================================
//  Мои поиски: панель сохранённых поисков + отметка новых объявлений
// =====================================================================
(function () {
  'use strict';

  const KEY = 'savedSearches';
  const SEEN_LIMIT = 500;
  // параметры, которые меняются от визита к визиту и не влияют на сам поиск
  const VOLATILE = ['context', 'p', 'localPriority', 'slocation', 'from', 'utm_source', 'utm_medium', 'utm_campaign'];

  const load = () => { try { return JSON.parse(GM_getValue(KEY, '[]')) || []; } catch { return []; } };
  // только для чтения: разбираем заново, лишь если в хранилище что-то поменялось (ленте это нужно десятки раз подряд)
  const roCache = {};
  function peekJSON(key, def) {
    const raw = GM_getValue(key, def);
    const c = roCache[key];
    if (c && c.raw === raw) return c.val;
    let val; try { val = JSON.parse(raw); } catch { val = null; }
    if (val == null) val = JSON.parse(def);
    roCache[key] = { raw, val };
    return val;
  }
  const loadRO = () => peekJSON(KEY, '[]'); // НЕ менять то, что вернула
  const save = (list) => GM_setValue(KEY, JSON.stringify(list));

  function cleanUrl(href) {
    const u = new URL(href, location.origin);
    u.hostname = 'www.avito.ru';
    VOLATILE.forEach((k) => u.searchParams.delete(k));
    u.hash = '';
    return u.toString();
  }
  // «отпечаток» поиска: путь + параметры без сортировки (s) — чтобы узнавать его при любой сортировке
  function fingerprint(href) {
    const u = new URL(cleanUrl(href));
    u.searchParams.delete('s');
    u.searchParams.sort();
    return u.pathname.replace(/\/+$/, '') + '?' + u.searchParams.toString();
  }
  const isSearchPage = () => document.querySelector('[data-marker="item"]') !== null &&
    !/_\d{6,}$/.test(location.pathname); // страница объявления оканчивается на _<id>

  function defaultName() {
    const q = new URL(location.href).searchParams.get('q');
    const h1 = document.querySelector('h1')?.textContent?.trim();
    return (q || h1 || 'Поиск').slice(0, 60);
  }
  function subtitle(url) {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const region = parts[0] && parts[0] !== 'all' ? parts[0] : 'вся Россия';
    const sortTxt = u.searchParams.get('s') === '104' ? ' · по дате' : '';
    return region + sortTxt;
  }

  // ---------------- стили ----------------
  const css = `
  #ams-fab{position:fixed;overflow:visible;right:20px;bottom:142px;width:44px;height:44px;border-radius:50%;
    border:1px solid #ddd;background:#fff;font-size:20px;cursor:pointer;z-index:99998;
    box-shadow:0 4px 12px rgba(0,0,0,.15)}
  #ams-panel{position:fixed;top:72px;right:12px;width:min(380px,calc(100vw - 24px));max-height:calc(100vh - 100px);display:flex;
    flex-direction:column;background:#fff;color:#111;border:1px solid #e3e3e3;border-radius:14px;
    box-shadow:0 12px 32px rgba(0,0,0,.18);z-index:99999;font:14px/1.35 Arial,sans-serif}
  #ams-panel *{box-sizing:border-box}
  .ams-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 8px}
  .ams-head b{font-size:16px}
  .ams-x{border:none;background:none;font-size:18px;cursor:pointer;color:#888}
  .ams-tools{display:flex;gap:8px;padding:0 16px 10px}
  .ams-tools input{flex:1;padding:7px 10px;border:1px solid #ddd;border-radius:8px;font-size:13px}
  .ams-btn{padding:7px 12px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;white-space:nowrap}
  .ams-btn.primary{background:#00aaff;border-color:#00aaff;color:#fff}
  .ams-btn:disabled{opacity:.45;cursor:default}
  .ams-list{overflow:auto;padding:0 8px 8px}
  .ams-row{display:flex;align-items:center;gap:6px;padding:8px;border-radius:10px;cursor:pointer}
  .ams-row:hover{background:#f3f7fb}
  .ams-row.current{background:#e9f6ff}
  .ams-main{flex:1;min-width:0}
  .ams-name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ams-sub{color:#888;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ams-icon{border:none;background:none;cursor:pointer;font-size:14px;padding:4px;opacity:.55}
  .ams-icon:hover{opacity:1}
  .ams-hidden{display:none!important}
  body.ams-show-hidden .ams-hidden{display:block!important;opacity:.35;outline:2px dashed #e53935;outline-offset:-2px}
  .ams-why{display:none;margin:0 0 6px;padding:2px 8px;border-radius:6px;background:#e53935;color:#fff;font:700 11px/1.6 Arial,sans-serif}
  body.ams-show-hidden .ams-hidden .ams-why{display:inline-block}
  #ams-bar{position:fixed;left:16px;bottom:16px;z-index:99998;display:flex;gap:10px;align-items:center;
    background:#222;color:#fff;padding:8px 12px;border-radius:10px;font:13px Arial,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25)}
  #ams-bar button{border:none;background:none;color:#4fc3f7;cursor:pointer;font:600 13px Arial,sans-serif;padding:0}
  .ams-empty{color:#888;padding:16px;text-align:center}
  .ams-foot{display:flex;gap:8px;padding:10px 16px;border-top:1px solid #f0f0f0;font-size:12px;color:#888;justify-content:space-between;align-items:center}
  @media (max-width:600px){#ams-panel{top:12px;max-height:calc(100vh - 24px)}.ams-icon{font-size:17px;padding:6px}.ams-row{padding:10px 8px}}
  #ams-fab .ams-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;
    background:#e53935;color:#fff;font:700 11px/20px Arial,sans-serif;text-align:center}
  #ams-feed{position:fixed;inset:0;z-index:100000;background:#f2f3f5;color:#111;display:flex;flex-direction:column;
    font:14px/1.35 Arial,sans-serif}
  @supports (height:100dvh){#ams-feed{bottom:auto;height:100dvh}} /* на телефоне низ не прячется под панель браузера */
  #ams-feed *{box-sizing:border-box}
  .amf-top{background:#fff;border-bottom:1px solid #e5e5e5;padding:10px 16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .amf-top h2{margin:0 auto 0 0;font-size:18px}
  .amf-status{width:100%;color:#666;font-size:13px}
  .amf-tabs{display:flex;gap:4px;width:100%;border-bottom:1px solid #eee;margin-top:2px}
  .amf-tab{border:none;background:none;padding:8px 12px;font:600 14px Arial,sans-serif;color:#777;cursor:pointer;
    border-bottom:3px solid transparent;margin-bottom:-1px}
  .amf-tab.on{color:#111;border-bottom-color:#00aaff}
  .amf-cats{display:flex;gap:6px;width:100%;flex-wrap:wrap;margin:6px 0 2px}
  .amf-cat{border:1px solid #ddd;background:#fff;border-radius:10px;padding:6px 12px;font:600 13px Arial,sans-serif;cursor:pointer}
  .amf-cat.on{background:#00aaff;border-color:#00aaff;color:#fff}
  .amf-chips{display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto;width:100%;padding-bottom:4px;scrollbar-width:thin}
  .amf-chip{border:1px solid #ddd;background:#fff;border-radius:16px;padding:4px 10px;font-size:12px;cursor:pointer;white-space:nowrap;flex:none}
  .amf-chip.on{background:#111;color:#fff;border-color:#111}
  .amf-list{flex:1;min-height:0;overflow:auto;padding:12px 12px 90px;display:grid;gap:10px;
    grid-template-columns:repeat(auto-fill,minmax(min(100%,520px),1fr));align-content:start}
  .amf-card{display:flex;gap:12px;background:#fff;border-radius:12px;padding:10px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
  .amf-card.viewed{opacity:.5}
  .amf-img{width:120px;height:120px;flex:none;border-radius:8px;object-fit:cover;background:#eee;cursor:pointer}
  .amf-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
  .amf-title{font-weight:600;color:#0a5dc2;cursor:pointer;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .amf-price{font-weight:700;font-size:16px}
  .amf-meta{color:#777;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .amf-desc{color:#555;font-size:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .amf-actions{display:flex;gap:6px;margin-top:auto;padding-top:4px;flex-wrap:wrap}
  .amf-actions button{border:1px solid #e0e0e0;background:#fff;border-radius:8px;padding:4px 8px;font-size:12px;cursor:pointer}
  .amf-pal{color:#c62828;font-size:12px;line-height:1.35}
  .amf-palbox{grid-column:1/-1;background:#fff8e1;border:1px solid #ffe08a;border-radius:12px;padding:10px 12px;font-size:13px;color:#5d4500;
    display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .amf-palbox span{flex:1 1 260px}
  .amf-palbox button{border:1px solid #e0c060;background:#fff;border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer}
  .amf-empty{grid-column:1/-1;text-align:center;color:#777;padding:48px 16px;font-size:15px}
  .amf-card.kb{outline:2px solid #00aaff;outline-offset:1px}
  .amf-old{margin-left:8px;color:#2e7d32;font-size:12px;font-weight:600}
  .amf-actions button.on{background:#ffebee;border-color:#ffcdd2}
  .amf-cat.amf-sort{margin-left:auto;font-weight:400}
  .amf-pill{position:absolute;left:50%;transform:translateX(-50%);bottom:78px;z-index:2;border:none;border-radius:20px;
    background:#00aaff;color:#fff;padding:10px 18px;font:600 14px Arial,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;white-space:nowrap}
  .amf-toast{position:absolute;left:50%;transform:translateX(-50%);bottom:24px;z-index:3;display:flex;gap:14px;align-items:center;
    background:#222;color:#fff;padding:10px 16px;border-radius:10px;font-size:14px;box-shadow:0 4px 14px rgba(0,0,0,.25);white-space:nowrap}
  .amf-toast button{border:none;background:none;color:#4fc3f7;font:600 14px Arial,sans-serif;cursor:pointer;padding:0}
  @media (max-width:600px){.amf-img{width:96px;height:96px}.amf-top h2{font-size:16px}}
  .ams-new{display:inline-block;margin:0 0 6px;padding:2px 8px;border-radius:6px;background:#2fbf71;color:#fff;
    font:700 11px/1.6 Arial,sans-serif;letter-spacing:.3px}
  .ams-newcount{display:inline-block;min-width:18px;padding:0 5px;margin-left:6px;border-radius:9px;background:#2fbf71;
    color:#fff;font-size:11px;line-height:18px;text-align:center;vertical-align:middle}
  `;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  // ---------------- стоп-слова ----------------
  const GLOBAL_KEY = 'globalBanWords';
  const loadGlobal = () => { try { return JSON.parse(GM_getValue(GLOBAL_KEY, '[]')) || []; } catch { return []; } };
  const saveGlobal = (w) => GM_setValue(GLOBAL_KEY, JSON.stringify(w));
  const norm = (t) => (t || '').toLowerCase().replace(/ё/g, 'е');
  // «brunello+кед» — срабатывает, только если в объявлении есть ОБА слова
  const hasWord = (text, w) => (w.includes('+') ? w.split('+').map((x) => x.trim()).filter(Boolean).every((x) => text.includes(x)) : text.includes(w));
  const parseWords = (raw) => [...new Set(raw.split(/[,;\n]/).map((w) => norm(w).trim()).filter(Boolean))];

  // возвращает новый список или null, если нажали «Отмена»
  function editWords(current, title) {
    const raw = prompt(
      `${title}\n\nЧерез запятую. Ищется в названии, описании и бренде, по части слова: ` +
      `«мокасин» скроет и «мокасины», и «мокасинах». Связка «brunello+кед» скроет только кеды Brunello. Пустое поле — очистить.`,
      (current || []).join(', '));
    return raw === null ? null : parseWords(raw);
  }

  // ---------------- перенос между устройствами ----------------
  const SYNC_PREFIX = 'AVITO-SYNC:';
  const toB64 = (str) => btoa(unescape(encodeURIComponent(str)));
  const fromB64 = (b) => decodeURIComponent(escape(atob(b)));
  const loadSellers = () => { try { return JSON.parse(GM_getValue('blockedSellers', '{}')) || {}; } catch { return {}; } };

  const SYNC2 = 'AVITO-SYNC2:';
  const MAX_MSG = 3800; // Telegram режет сообщения длиннее ~4096 символов

  const bytesToB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
  const b64ToBytes = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
  async function pipe(u8, stream) {
    const out = new Response(new Blob([u8]).stream().pipeThrough(stream));
    return new Uint8Array(await out.arrayBuffer());
  }
  async function encode(obj) {
    const json = JSON.stringify(obj);
    if (typeof CompressionStream === 'function') {
      try { return SYNC2 + bytesToB64(await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'))); }
      catch { /* без сжатия */ }
    }
    return SYNC_PREFIX + toB64(json);
  }
  async function decode(raw) {
    const t = raw.replace(/\s+/g, '');
    let i = t.indexOf(SYNC2);
    if (i >= 0) {
      const u8 = await pipe(b64ToBytes(t.slice(i + SYNC2.length)), new DecompressionStream('deflate-raw'));
      return JSON.parse(new TextDecoder().decode(u8));
    }
    i = t.indexOf(SYNC_PREFIX);
    if (i >= 0) return JSON.parse(fromB64(t.slice(i + SYNC_PREFIX.length)));
    const j = JSON.parse(raw); // старый формат: просто список поисков
    return Array.isArray(j) ? { searches: j } : j;
  }

  function copyText(text) {
    try { if (typeof GM_setClipboard === 'function') { GM_setClipboard(text, 'text'); return Promise.resolve(true); } } catch { /* дальше */ }
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, () => false);
    return Promise.resolve(false);
  }
  function downloadText(text, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // простое модальное окно
  function modal(title, build) {
    document.getElementById('ams-modal')?.remove();
    const wrap = el('div'); wrap.id = 'ams-modal';
    Object.assign(wrap.style, { position: 'fixed', inset: '0', background: 'rgba(0,0,0,.45)', zIndex: 100000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' });
    const box = el('div');
    Object.assign(box.style, { background: '#fff', color: '#111', borderRadius: '14px', padding: '16px',
      width: 'min(440px, 100%)', font: '14px/1.4 Arial,sans-serif', boxShadow: '0 12px 32px rgba(0,0,0,.25)' });
    const h = el('div', null, title); h.style.cssText = 'font-weight:700;font-size:16px;margin-bottom:10px';
    box.append(h);
    const close = () => wrap.remove();
    build(box, close);
    wrap.onclick = (e) => { if (e.target === wrap) close(); };
    wrap.append(box);
    document.body.append(wrap);
  }
  const mbtn = (text, primary) => { const b = el('button', 'ams-btn' + (primary ? ' primary' : ''), text); b.style.marginRight = '8px'; b.style.marginTop = '8px'; return b; };

  async function exportAll() {
    // полная копия: поиски с отметками, стоп-слова, продавцы, лента
    const data = { ...fullState(), copiedAt: Date.now() };
    const code = await encode(data);
    const summary = `Полная копия: поисков ${data.searches.length}, стоп-слов для всех ${data.global.length}, ` +
      `скрытых продавцов ${Object.keys(data.sellers).length}, объявлений в ленте ${Object.keys(data.feed).length}, отложенных ${Object.keys(data.favs).length}. ` +
      'На другом устройстве она заменит всё, что там было.';
    const fits = code.length <= MAX_MSG;
    modal('📤 Перенос на другое устройство', (box, close) => {
      box.append(el('div', null, summary));
      const info = el('div', null, fits
        ? 'Код помещается в одно сообщение Telegram. Скопируйте его, отправьте себе в «Избранное», на другом устройстве скопируйте и нажмите ⭐ → «📥 Загрузить».'
        : `Код длинный (${code.length} символов) — Telegram разрежет его на части. Лучше сохранить файлом и отправить себе файл.`);
      info.style.cssText = 'color:#555;margin:8px 0 4px';
      box.append(info);
      const copy = mbtn('📋 Скопировать код', fits);
      copy.onclick = async () => {
        copy.textContent = (await copyText(code)) ? '✅ Скопировано' : '❌ Не вышло — используйте файл';
      };
      const file = mbtn('💾 Сохранить файлом', !fits);
      file.onclick = () => { downloadText(code, 'avito-perenos.txt'); file.textContent = '✅ Файл сохранён'; };
      const cancel = mbtn('Закрыть'); cancel.onclick = close;
      box.append(copy, file, cancel);
    });
  }

  function importAll() {
    modal('📥 Загрузить с другого устройства', (box, close) => {
      const ta = el('textarea');
      ta.placeholder = 'Вставьте код (AVITO-SYNC…). Если Telegram разрезал его — вставьте все части подряд.';
      ta.style.cssText = 'width:100%;height:110px;border:1px solid #ddd;border-radius:8px;padding:8px;font:12px monospace;resize:vertical';
      const fileIn = el('input'); fileIn.type = 'file'; fileIn.accept = '.txt,text/plain'; fileIn.style.display = 'none';
      fileIn.onchange = async () => { const f = fileIn.files[0]; if (f) { ta.value = await f.text(); go(); } };
      const pick = mbtn('📂 Выбрать файл'); pick.onclick = () => fileIn.click();
      const paste = mbtn('📋 Вставить');
      paste.onclick = async () => {
        try { ta.value = await navigator.clipboard.readText(); } catch { ta.focus(); alert('Вставьте вручную: долгое нажатие в поле → «Вставить»'); }
      };
      const ok = mbtn('Загрузить', true);
      const cancel = mbtn('Отмена'); cancel.onclick = close;
      const err = el('div'); err.style.cssText = 'color:#d32f2f;margin-top:6px';
      async function go() {
        if (!ta.value.trim()) { err.textContent = 'Пусто — вставьте код или выберите файл'; return; }
        try {
          const data = await decode(ta.value); close();
          if (data && data.kind === 'ams-local') {
            if (!confirm(`Заменить всё на этом устройстве копией с другого (поисков ${data.searches.length}, ` +
              `скрытых продавцов ${Object.keys(data.sellers || {}).length})?\nТекущие поиски сохранятся в «🗂 Копии».`)) return;
            await backupTick(true);
            applyState(data, 'Перенесено');
          } else applyImport(data);
        } catch { err.textContent = 'Код не распознан. Проверьте, что скопирован целиком (все части).'; }
      }
      ok.onclick = go;
      box.append(ta, fileIn, pick, paste, ok, cancel, err);
    });
  }

  function applyImport(data) {
    if (data.merge) { runMerge(data); return; }
    const cur = load();
    let added = 0;
    if (data.recipe) {
      // файл содержит не готовые ссылки, а рецепт: коды фильтров скрипт узнаёт на Авито сам
      if (!confirm(`Собрать новые поиски по рецепту и заменить ими текущие (${cur.length})?\n` +
        'Скрипт откроет несколько страниц Авито, чтобы узнать коды фильтров — это займёт 1–3 минуты.\n' +
        'Стоп-слова и скрытые продавцы не пропадут.')) return;
      saveGlobal([...new Set([...loadGlobal(), ...(data.global || [])])]);
      GM_setValue('blockedSellers', JSON.stringify({ ...loadSellers(), ...(data.sellers || {}) }));
      runBuilder(data.recipe);
      return;
    }
    if (data.replace) {
      // файл просит заменить поиски целиком (например, после смены региона)
      if (!confirm(`Заменить ваши поиски (${cur.length}) на поиски из файла (${(data.searches || []).length})?\n` +
        'Стоп-слова и скрытые продавцы не пропадут — они объединятся.')) return;
      const next = (data.searches || []).filter((it) => it && it.url).map((it, i) => {
        const same = cur.find((x) => fingerprint(x.url) === fingerprint(it.url));
        return same
          ? { ...same, name: it.name || same.name, ban: [...new Set([...(same.ban || []), ...(it.ban || [])])] }
          : { id: Date.now() + i, name: it.name || 'Поиск', url: it.url, ban: it.ban || [], seen: [], lastVisit: 0 };
      });
      added = next.length;
      cur.length = 0; cur.push(...next);
      saveFeed({}); saveMeta({});
    }
    let removed = 0;
    for (const url of data.remove || []) { // файл просит убрать устаревшие поиски
      const i = cur.findIndex((x) => fingerprint(x.url) === fingerprint(url));
      if (i >= 0) { cur.splice(i, 1); removed++; }
    }
    for (const it of data.replace ? [] : data.searches || []) {
      if (!it || !it.url) continue;
      const same = cur.find((x) => fingerprint(x.url) === fingerprint(it.url));
      if (same) {
        same.ban = [...new Set([...(same.ban || []), ...(it.ban || [])])];
      } else {
        cur.push({ id: Date.now() + added, name: it.name || 'Поиск', url: it.url, ban: it.ban || [], seen: [], lastVisit: 0 });
        added++;
      }
    }
    save(cur);
    const g = [...new Set([...loadGlobal(), ...(data.global || [])])];
    saveGlobal(g);
    const sellers = { ...loadSellers(), ...(data.sellers || {}) };
    GM_setValue('blockedSellers', JSON.stringify(sellers));
    alert(`Готово! ${data.replace ? 'Поисков теперь' : 'Новых поисков'}: ${added}${removed ? `, убрано старых: ${removed}` : ''}, стоп-слов для всех: ${g.length}, ` +
      `скрытых продавцов: ${Object.keys(sellers).length}.\nСтраница обновится.`);
    location.reload(); // чтобы скрытие продавцов подхватило новый список
  }

  // ---------------- объединение тихих поисков ----------------
  // Файл: { merge: [{ kind, name, url, ban, from: [ссылки старых поисков] }] }.
  // Новый поиск забирает у старых отметки «просмотрено» и их объявления в ленте — ничего не теряется.
  // Перед заменой открываем по одному поиску каждого вида и смотрим, понял ли Авито фильтры; если нет — этот вид не трогаем.
  async function verifyMerge(m) {
    const u = new URL(m.url);
    const html = await getPage(u.pathname + u.search);
    const exp = avfParse(u.searchParams.get('f'));
    const want = [...exp.singles.map(([k, v]) => [k, [v]]), ...exp.multi];
    const echo = searchEcho(html);
    const miss = echo.params ? want.filter(([k, vals]) => { const got = new Set(asIds(echo.params[k])); return !vals.every((v) => got.has(v)); }).map(([k]) => k) : want.map(([k]) => k);
    if (!miss.length) return [];
    // Запасная проверка — по самим объявлениям в выдаче. У аксессуаров Авито не возвращает фильтры в ответе,
    // хотя поиск работает: тогда смотрим, что почти всё в выдаче — нужных брендов и действительно аксессуары.
    const items = parseState(html).filter((x) => !x.extra && x.params);
    if (items.length >= 5) {
      const brandOk = items.filter((it) => !brandMismatch(it, { name: m.name })).length >= items.length * 0.8;
      let catOk = !miss.includes(P_CAT);
      if (!catOk && m.kind === 'aks') {
        const notAcc = items.filter((it) => { const t = palText(it.title).text; return (W_CLOTH.test(t) || W_SHOE.test(t)) && !W_ACC.test(t); }).length;
        catOk = notAcc <= items.length * 0.3;
      }
      if (brandOk && catOk && miss.every((k) => k === P_BRAND || k === P_CAT)) return [];
    }
    return miss.map((k) => (k === P_BRAND ? 'бренды' : k === 118631 ? 'вид обуви' : k === P_SIZE || k === P_SHOE ? 'размеры' : 'параметр ' + k));
  }
  async function runMerge(data) {
    const cur = load();
    const byFp = new Map(cur.map((x) => [fingerprint(x.url), x]));
    const plan = (data.merge || []).map((m) => ({ ...m, members: (m.from || []).map((u) => byFp.get(fingerprint(u))).filter(Boolean) }))
      .filter((m) => m.members.length >= 2);
    if (!plan.length) { alert('Нечего объединять: этих поисков у вас уже нет.'); return; }
    const total = plan.reduce((n, m) => n + m.members.length, 0);
    if (!confirm(`Объединить ${total} поисков в ${plan.length}?\nПоисков станет ${cur.length - total + plan.length} вместо ${cur.length}.\n` +
      'Просмотренное и объявления в ленте сохранятся. Сначала проверю на Авито по одному поиску каждого вида (около минуты).')) return;
    let log;
    modal('🔗 Объединение поисков', (box) => { log = el('div'); log.style.cssText = 'max-height:50vh;overflow:auto;white-space:pre-wrap'; box.append(log); });
    const say = (t) => { log.textContent += t + '\n'; };
    // если сейчас идёт проверка поисков (в этой или другой вкладке) — ждём, а не бросаем
    const busy = () => feedRunning || Date.now() - +GM_getValue(LOCK_KEY, 0) < 30000;
    if (busy()) {
      say('⏳ Сейчас идёт проверка поисков — жду, пока она закончится…');
      const t0 = Date.now();
      while (busy() && Date.now() - t0 < 10 * 60000) await sleep(2000);
      if (busy()) { say('Проверка не закончилась за 10 минут. Загрузите файл ещё раз чуть позже.'); alert('Объединение не выполнено: всё это время шла проверка поисков. Загрузите файл ещё раз чуть позже.'); return; }
    }
    // держим «замок», чтобы фоновая проверка не началась посреди объединения
    mergeRunning = true;
    GM_setValue(LOCK_KEY, String(Date.now()));
    const lockTimer = setInterval(() => GM_setValue(LOCK_KEY, String(Date.now())), 10000);
    try { await doMerge(plan, say); } finally { clearInterval(lockTimer); GM_setValue(LOCK_KEY, '0'); mergeRunning = false; }
  }
  let mergeRunning = false;
  async function doMerge(plan, say) {
    const LABEL = { odezhda: 'одежда', aks: 'аксессуары', classic: 'классическая обувь' };
    const okKinds = new Set();
    for (const kind of [...new Set(plan.map((m) => m.kind))]) {
      const m = plan.find((x) => x.kind === kind);
      try {
        let probs;
        for (let attempt = 1; ; attempt++) { // Авито попросил паузу — ждём и пробуем ещё раз
          try { probs = await verifyMerge(m); break; } catch (e) {
            if (!/паузу/.test(e.message) || attempt >= 3) throw e;
            say(`⏸ Авито попросил паузу — жду 40 с и пробую снова (${attempt}/2)…`); await sleep(40000);
          }
        }
        if (probs.length) say(`✗ ${LABEL[kind] || kind}: Авито не понял (${probs.join(', ')}) — эти поиски оставляю как были`);
        else { okKinds.add(kind); say(`✓ ${LABEL[kind] || kind}: фильтры совпали`); }
      } catch (e) { say(`✗ ${LABEL[kind] || kind}: ${e.message} — эти поиски оставляю как были`); }
    }
    const todo = plan.filter((m) => okKinds.has(m.kind));
    if (!todo.length) { say('\nНичего не изменено.'); alert('Объединение не выполнено: Авито не подтвердил фильтры (подробности в окне). Поиски остались как были.'); return; }
    await backupTick(true); // точка возврата: 🗂 Копии
    const list = load(), feed = loadFeed(), skip = loadSkip();
    const idMap = {};
    let k = 0, merged = 0;
    for (const m of todo) {
      const fps = new Set(m.from.map(fingerprint));
      const mem = list.filter((x) => fps.has(fingerprint(x.url)));
      if (mem.length < 2) continue;
      // «просмотрено»: берём поровну самое свежее от каждого старого поиска
      const seen = [], seenSet = new Set();
      for (let i = 0; seen.length < SEEN_LIMIT && mem.some((x) => (x.seen || [])[i] !== undefined); i++) {
        for (const x of mem) { const id = (x.seen || [])[i]; if (id !== undefined && !seenSet.has(id)) { seenSet.add(id); seen.push(id); } }
      }
      const ts = mem.map((x) => x.lastTs).filter(Boolean);
      const ns = { id: Date.now() + (k++), name: m.name, url: m.url, ban: m.ban || [], seen: seen.slice(0, SEEN_LIMIT), lastVisit: 0, warn: '',
        rate: +mem.reduce((n, x) => n + (x.rate || 0), 0).toFixed(3), lastCheckAt: Math.min(...mem.map((x) => x.lastCheckAt || 0)) };
      // дата «проверено до» — самая поздняя из старых: то, что вы уже видели, не вернётся как новое
      if (ts.length) { ns.lastTs = Math.max(...ts); ns.maxId = Math.max(...mem.map((x) => x.maxId || 0)); }
      mem.forEach((x) => { idMap[x.id] = ns.id; });
      const at = list.indexOf(mem[0]);
      for (const x of mem) list.splice(list.indexOf(x), 1);
      list.splice(Math.min(at, list.length), 0, ns);
      merged += mem.length;
    }
    for (const it of Object.values(feed)) if (idMap[it.sid]) it.sid = idMap[it.sid];
    for (const sk of Object.values(skip)) if (idMap[sk.sid]) sk.sid = idMap[sk.sid];
    save(list); saveFeed(feed); GM_setValue(SKIP_KEY, JSON.stringify(skip));
    say(`\nГотово: ${merged} поисков объединены, всего поисков теперь ${list.length}.`);
    alert(`Готово: ${merged} поисков объединены, всего поисков теперь ${list.length}.` +
      (okKinds.size < new Set(plan.map((m) => m.kind)).size ? '\nЧасть видов не прошла проверку и осталась как была — подробности в окне.' : '') + '\nСтраница обновится.');
    location.reload();
  }

  // ---------------- лента новых по всем поискам ----------------
  const FEED_KEY = 'feedItems';      // { id: {...данные объявления, sid, found} }
  const FEED_META = 'feedMeta';      // { lastCheck, count }
  const FEED_LIMIT = 400;
  const SELLER_RE = /\/(brands|user)\/([^/?#]+)/;
  const loadFeed = () => { try { return JSON.parse(GM_getValue(FEED_KEY, '{}')) || {}; } catch { return {}; } };
  const loadFeedRO = () => peekJSON(FEED_KEY, '{}'); // НЕ менять то, что вернула
  const saveFeed = (f) => GM_setValue(FEED_KEY, JSON.stringify(f));
  const loadMeta = () => { try { return JSON.parse(GM_getValue(FEED_META, '{}')) || {}; } catch { return {}; } };
  const saveMeta = (m) => GM_setValue(FEED_META, JSON.stringify(m));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmtPrice = (p) => (p ? p.toLocaleString('ru-RU') + ' ₽' : 'цена не указана');

  // ❤️ Отложенные: копии объявлений, которые не пропадут из ленты, пока вы их не уберёте сами
  const FAV_KEY = 'favItems', FAV_MAX = 500;
  const loadFavs = () => { try { return JSON.parse(GM_getValue(FAV_KEY, '{}')) || {}; } catch { return {}; } };
  const loadFavRO = () => peekJSON(FAV_KEY, '{}'); // НЕ менять то, что вернула
  const saveFavs = (f) => GM_setValue(FAV_KEY, JSON.stringify(f));
  function toggleFav(it) { // true — теперь в отложенных
    const f = loadFavs();
    if (f[it.id]) delete f[it.id];
    else {
      const { id, sid, sname, title, url, price, oldPrice, img, city, params, sellerName, sellerKey, ts } = it;
      f[id] = { id, sid, sname, title, url, price, oldPrice, img, city, params, sellerName, sellerKey, ts, favAt: it.favAt || Date.now() };
      const ids = Object.keys(f);
      if (ids.length > FAV_MAX) ids.sort((a, b) => f[a].favAt - f[b].favAt).slice(0, ids.length - FAV_MAX).forEach((k) => delete f[k]);
    }
    saveFavs(f);
    return !!f[it.id];
  }

  // настройки ленты
  const OPT_KEY = 'amsOpts';
  const loadOpts = () => ({ notify: true, hiddenTab: false, desc: true, sort: 'date', ...peekJSON(OPT_KEY, '{}') });
  const saveOpt = (k, v) => GM_setValue(OPT_KEY, JSON.stringify({ ...peekJSON(OPT_KEY, '{}'), [k]: v }));

  function cardPrice(c) {
    const toNum = (t) => {
      if (!t) return 0;
      const n = parseFloat(String(t).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.').replace(/[^\d.]/g, ''));
      return Number.isFinite(n) ? Math.round(n) : 0;
    };
    return toNum(c.querySelector('meta[itemprop="price"]')?.getAttribute('content'))
      || toNum(c.querySelector('[data-marker="item-price-value"]')?.textContent)
      || toNum(c.querySelector('[data-marker="item-price"]')?.textContent)
      || toNum(c.querySelector('[itemprop="price"]')?.textContent)
      || toNum(c.querySelector('[class*="price-text"], [class*="priceText"]')?.textContent);
  }

  function cardImage(c, img) {
    const src = img?.getAttribute('src');
    if (src && !src.startsWith('data:')) return src;
    // у карточек ниже 7-й картинки нет — ссылка лежит в data-marker слайдера
    const li = c.querySelector('[data-marker^="slider-image/image-"]');
    if (li) return li.getAttribute('data-marker').slice('slider-image/image-'.length);
    const ss = img?.getAttribute('srcset') || img?.getAttribute('data-srcset');
    return ss ? ss.split(',')[0].trim().split(' ')[0] : '';
  }

  function parseCards(doc) {
    const out = [];
    doc.querySelectorAll('[data-marker="item"][data-item-id]').forEach((c) => {
      const id = c.getAttribute('data-item-id');
      const a = c.querySelector('a[data-marker="item-title"]');
      if (!id || !a) return;
      const img = c.querySelector('img[src]');
      const alt = img?.getAttribute('alt') || '';
      let sellerKey = '', sellerName = '';
      for (const l of c.querySelectorAll('a[href]')) {
        const m = (l.getAttribute('href') || '').match(SELLER_RE);
        if (m) { sellerKey = `${m[1]}:${m[2]}`; sellerName = (l.querySelector('p')?.textContent || l.textContent || '').trim(); break; }
      }
      const href = a.getAttribute('href') || '';
      out.push({
        id,
        title: (c.querySelector('[itemprop="name"]')?.textContent || a.textContent || '').trim(),
        url: new URL(href.split('?')[0], 'https://www.avito.ru').toString(),
        price: cardPrice(c),
        img: cardImage(c, img),
        city: alt.includes(',') ? alt.split(',').pop().trim() : '',
        desc: (c.querySelector('meta[itemprop="description"]')?.getAttribute('content') || '').slice(0, 300),
        sellerKey, sellerName,
      });
    });
    return out;
  }

  // почему объявление не показываем (null — показываем)
  // у Авито нет фильтра длины стельки: если в тексте обуви явно указана другая — скрываем
  function insoleMismatch(it, search) {
    const cm = +GM_getValue('insoleCm', 0);
    if (!cm || !search || !/obuv_muzhskaya/.test(search.url)) return false;
    const m = norm(it.title + ' ' + it.desc).match(/стельк\S*[^0-9]{0,20}(\d{2,3}(?:[.,]\d)?)\s*(мм|см)?/);
    if (!m) return false;
    let v = parseFloat(m[1].replace(',', '.'));
    if (m[2] === 'мм' || v > 100) v /= 10;
    if (v < 15 || v > 35) return false;
    return Math.abs(v - cm) > 0.5;
  }

  // ---- защита от «чужих» объявлений: Авито иногда подмешивает вещи не того размера и бренда ----
  // Проверяем по строке параметров объявления, например «Новое с биркой · 50 (L) · Gut».
  const CLOTH_NUM_OK = [42, 44, 46, 48];           // XS–M
  const CLOTH_LET_OK = ['XS', 'S', 'M'];
  const SHOE_OK = [41, 41.5, 42, 42.5, 43];
  // возвращает размер, который не подходит (например «50 (L)»), или ''
  function sizeMismatch(it, search) {
    if (!it.params || !search) return '';
    const cloth = /muzhskaya_odezhda/.test(search.url), shoe = /obuv_muzhskaya/.test(search.url);
    if (!cloth && !shoe) return '';
    for (const sg of it.params.split('·').map((x) => x.trim())) {
      if (cloth) {
        let m = sg.match(/^(\d{2})(?:\s*\(\s*(\d*X{0,4}[SML])\s*\))?$/i);
        if (m && +m[1] >= 38 && +m[1] <= 70) return CLOTH_NUM_OK.includes(+m[1]) ? '' : sg;
        m = sg.match(/^(\d*X{0,4}[SML])$/i);
        if (m) return CLOTH_LET_OK.includes(m[1].toUpperCase()) ? '' : sg;
      } else {
        const m = sg.match(/^(\d{2}(?:[.,]5)?)(?:\s*(?:RU|EU|EUR))?$/i);
        const v = m ? +m[1].replace(',', '.') : 0;
        if (v >= 35 && v <= 50) return SHOE_OK.includes(v) ? '' : sg;
      }
    }
    return '';
  }

  // бренды поиска берём из его названия: «👕 Kenzo — одежда», «👟 Обувь: Fendi, Gucci», «🕶 Аксессуары: Dior»
  const BRAND_STOP = new Set(['the', 'and', 'by', 'de', 'des', 'la', 'le', 'di', 'paul', 'saint', 'jeans', 'collection']);
  const brandKey = (t) => norm(t).replace(/[-.'’&+]/g, '').replace(/[^a-z0-9а-я]+/g, ' ').trim();
  const brandCache = new Map(); // название поиска → слова брендов (считаем один раз)
  function searchBrandWords(search) {
    const key = (search && search.name) || '';
    if (!brandCache.has(key)) brandCache.set(key, calcBrandWords(key));
    return brandCache.get(key);
  }
  function calcBrandWords(name) {
    const n = (name || '').replace(/\s*🆕$/u, '');
    if (!/^(👕|👟|👞|🕶|👜)/u.test(n)) return null; // своё название без эмодзи — не трогаем
    let body = n.replace(/^[^A-Za-zА-Яа-яЁё0-9]+/u, '');
    if (body.includes(':')) body = body.slice(body.indexOf(':') + 1);
    else if (body.includes(' — ')) body = body.slice(0, body.indexOf(' — '));
    else return null;
    const words = new Set();
    body.split(/[,/]/).forEach((b) => brandKey(b).split(' ').forEach((w) => {
      if (w.length >= 2 && !BRAND_STOP.has(w)) words.add(w);
    }));
    return words.size ? [...words] : null;
  }
  // true — в названии и параметрах нет ни одного бренда этого поиска
  function brandMismatch(it, search) {
    if (!it.params) return false;
    const words = searchBrandWords(search);
    if (!words) return false;
    const text = ' ' + brandKey(it.title + ' ' + it.params) + ' ';
    return !words.some((w) => text.includes(' ' + w + ' '));
  }

  // ---------------- детектор «китайской пали» ----------------
  // Ни один признак сам по себе не скрывает объявление: баллы складываются, и только
  // при сумме ≥ PAL_LIMIT объявление уходит во вкладку «Похоже на паль» (не удаляется).
  const PAL_LIMIT = 5;
  // \b в JS не понимает русские буквы — делаем свою «границу слова»
  const rxW = (src, fl = '') => new RegExp(src.replace(/\\b/g, '(?:(?<=[a-zа-я0-9])(?![a-zа-я0-9])|(?<![a-zа-я0-9])(?=[a-zа-я0-9]))'), fl);
  // латинские буквы, похожие на русские: так обходят фильтры Авито («Kpосcовки Сhаnеl»)
  const LAT2CYR = { a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у' };
  function palText(raw) {
    let mixed = 0;
    const text = norm(raw).replace(/[a-zа-я]+/g, (w) => {
      if (!/[a-z]/.test(w) || !/[а-я]/.test(w)) return w;
      mixed++;
      return w.replace(/[a-z]/g, (ch) => LAT2CYR[ch] || ch);
    });
    return { text, mixed };
  }
  // стоп-слова: латинские буквы, похожие на русские, считаем русскими — «пoмoжeм» с латинской «o» = «поможем»
  const fixWordCache = new Map(), fixTextCache = new Map();
  const fixWord = (w) => { let v = fixWordCache.get(w); if (v === undefined) { v = palText(w).text; fixWordCache.set(w, v); } return v; };
  function findWord(text, words) {
    if (!words.length) return undefined;
    const hit = words.find((w) => hasWord(text, w));
    if (hit || !/[a-z]/.test(text)) return hit;
    let t2 = fixTextCache.get(text);
    if (t2 === undefined) { if (fixTextCache.size > 5000) fixTextCache.clear(); t2 = palText(text).text; fixTextCache.set(text, t2); }
    return words.find((w) => hasWord(t2, fixWord(w)));
  }
  // текст объявления для стоп-слов: с полным описанием, если оно уже скачано
  const itemText = (it) => norm(it.title + '\n' + it.desc + '\n' + (it.params || '') + (it.fullDesc ? '\n' + it.fullDesc : ''));
  const LETTER_SIZES = ['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', '4xl', '5xl'];
  const SZ_TOKEN = String.raw`(?:\d{2}(?:[.,]5)?|[2-5]?x{0,3}[sml]|xxs)`;
  const SZ_LIST = new RegExp(String.raw`(?:размер\S*|р-р|р\.|sizes?|в наличии)\s*(?:в наличии|есть)?\s*[:\-–—]?\s*(?:от\s+)?(${SZ_TOKEN}(?:\s*(?:[,;/]|[-–—]|до|и|\s)\s*${SZ_TOKEN}){1,14})(?!\s*(?:см|мм|cm|mm|\d))`, 'g');
  const letIdx = (t) => LETTER_SIZES.indexOf(t.replace(/^2x/, 'xx').replace(/^3x/, 'xxx'));
  // список/диапазон размеров → true, если это явно «много размеров в наличии»
  function manySizes(tokens, hasRange) {
    const nums = tokens.filter((t) => /^\d/.test(t)).map((t) => parseFloat(t.replace(',', '.')));
    const lets = tokens.filter((t) => !/^\d/.test(t)).map(letIdx).filter((i) => i >= 0);
    if (nums.length >= 2) {
      const lo = Math.min(...nums), hi = Math.max(...nums);
      const shoe = lo >= 34 && hi <= 49, cloth = lo >= 40 && hi <= 64 && nums.every((n) => n % 2 === 0);
      if (shoe && (nums.length >= 3 || (hasRange && hi - lo >= 3))) return true;
      if (cloth && (nums.length >= 3 || (hasRange && hi - lo >= 6))) return true;
    }
    return lets.length >= 3 || (lets.length === 2 && hasRange && Math.abs(lets[1] - lets[0]) >= 2);
  }
  // таблица размеров по строкам: «37EU-23,5см», «41 — 26 см», «S - 46», «46 (S)» — у пали она почти в каждом описании
  const SZ_ROW_SHOE = /(?:^|[\n;•|])[^\da-zа-я\n]{0,4}(3[4-9]|4[0-8])(?:[.,]5)?\s*(?:eu|eur|ru|рус|рос)?\s*[-–—=:(]\s*\d{2}(?:[.,]\d)?\s*(?:см|cm)?/g;
  const SZ_ROW_LET = /(?:^|[\n;•|])[^\da-zа-я\n]{0,4}(xxs|xs|s|m|l|xl|xxl|xxxl|[2-5]xl)\s*(?:[-–—=:(/]\s*)\(?\s*(?:4\d|5\d|6\d)\b/g;
  const SZ_ROW_NUM = /(?:^|[\n;•|])[^\da-zа-я\n]{0,4}(4[0-9]|5[0-8])\s*[-–—(/]\s*(?:xxs|xs|s|m|l|xl|xxl|xxxl|[2-5]xl)\b/g;
  function sizeTable(text) {
    for (const re of [SZ_ROW_SHOE, SZ_ROW_LET, SZ_ROW_NUM]) {
      const rows = new Set([...text.matchAll(re)].map((x) => x[1]));
      if (rows.size >= 3) return true;
    }
    return false;
  }
  const NOT = String.raw`(?<!не\s)(?<!not\s)(?<!no\s)(?<!без\s)`; // «не фейк», «не реплика» — это пишут честные продавцы
  const PAL_STRONG = [
    [rxW(String.raw`${NOT}реплик|${NOT}replica|\brep\b|${NOT}\bфейк|${NOT}\bfake\b|${NOT}\bпаль\b|\bпалево|\bаналог\b|не оригинал|неоригинал|\bне ориг\b|зеркальн\S* копи|${NOT}\bкопи[яию]\b|\bmirror\b|\bpk god\b|\bputian\b|путянь|\bucg\b`), 'реплика / копия'],
    [rxW(String.raw`\bлюкс\b|\blux\b|\bluxe\b|(?:премиум|premium|\bтоп|\btop|высш\S*|оригинальн\S*)[- ]?качеств|качеств\S*\s*(?:[:\-–]\s*)?(?:премиум|premium|люкс|lux|\bтоп|\btop|а{3,}|a{3,}|1\s*[:в]\s*1|оригинал|original)|\b1\s*[:в]\s*1\b|\bааа\b|\baaa\b|фабричн\S*\s+(?:качеств|пошив|производ)`), '«люкс/премиум/топ качество»'],
  ];
  const PAL_LIKE = rxW(String.raw`\bпо типу\s+["«']?[a-z]`); // «по типу Dolce» — паль, «по типу бомбера» — нет
  // фразы «размеры в наличии» — тот же признак, что и список размеров
  const PAL_SIZEWORDS = rxW(String.raw`все размеры|любой размер|любые размеры|размерн\S* сетк|размерн\S* ряд|наличие размер|уточняйте (?:\S+ )?(?:размер|наличие)|размеры в наличии|в наличии (?:все|любые) размер|популярные размеры|размеры по стельке|(?:все|любые) в наличии|в наличии все|подбер[её]м размер|поможем (?:вам )?(?:подобрать|определиться)|подобрать (?:\S+ )?размер|по (?:росту и весу|весу и росту)|(?:рост|вес)\S*\s*(?:и|/)\s*(?:рост|вес)`);
  // типичное для магазинов пали (не просто «подписывайтесь»)
  const PAL_SHOP = rxW(String.raw`оператор 24|почему (?:нам|стоит|выбирают|нас)|при покупке (?:2|двух|от)|скидк\S* при (?:покупке|заказе)|без предоплат|с примеркой|доставка в день|в день заказа|отправка в день|перед заказом|\bпод заказ|\bоптом\b|\bопт\b|успейте|популярные модели|каждая пара|в коробке с бирками|полный комплект|пишите (?:нам )?в (?:лс|личн)|в день оформлен|реальные фото|навесн\S* бирк|фирменн\S* упаковк|производств\S*\s*[:\-–—]?\s*(?:турц|стамбул|китай|гуанчжоу|кита)|качество на высоте|эксклюзивн\S* товар|возврат без лишних|оформить заказ|оформля\S* заказ|никаких (?:дешев\S* )?аналог`, 'g');
  // обычный магазинный текст — слабый признак
  const PAL_PROMO = rxW(String.raw`подписывай|подпишись|в (?:нашем|моем|мо[её]м) профил|другие модели|больше моделей|наш (?:магазин|шоу-?рум|склад)|шоу-?рум|мы находимся|ежедневно с\s*\d`);
  const PAL_SHOPNAME = rxW(String.raw`shop|store|market|маркет|магазин|бутик|boutique|outlet|аутлет|brand|бренд|sneak|кроссов|boots|\bобув|одежд|clothes|wear\b|fashion|\bstyle|стиль|\blab\b|\bclub\b|stock|\bсток|lux|люкс|premium|премиум|original|оригинал|trade|трейд|\bopt\b|\bопт\b|kicks|\bdrop|step\b|\|`);

  const PAL_WEAK_CAP = 3; // слабые признаки (новое с биркой, название-магазин, завершённые объявления) вместе не больше 3 — сами до порога 5 не дотянут

  // признаки самого объявления (считаются при разборе, пока под рукой полное описание)
  // w — слабые признаки (обычный перекупщик оригиналов тоже так выглядит), m — настоящие признаки пали
  function palFeatures({ title = '', desc = '', params = '', sellerName = '', closed = 0, price = 0 }) {
    const why = [];
    let w = 0, m = 0;
    let { text, mixed } = palText(title + '\n' + desc);
    // у Maison Margiela «Replica» — название линейки (кроссовки, духи), а не подделка
    if (/margiela|mm6/.test(brandKey(params + ' ' + title))) text = text.replace(/replica|реплик\S*/g, ' ');
    const cond = norm(params.split('·')[0] || '').trim();
    const isNewTag = /новое с бирк/.test(cond), isNew = /^новое/.test(cond);
    const isUsed = /отличн|хорош|удовлетвор|как нов|б\/у|ношен/.test(cond);
    if (isNewTag) { w += 2; why.push('новое с биркой'); } else if (isNew) { w += 1; why.push('новое'); }
    if (mixed >= 2) { m += 3; why.push('латинские буквы вместо русских'); }
    let sizes = PAL_SIZEWORDS.test(text) || sizeTable(text);
    for (const m of sizes ? [] : text.matchAll(SZ_LIST)) {
      const toks = m[1].split(/\s*(?:[,;/]|[-–—]|до|и|\s)\s*/).filter(Boolean);
      if (manySizes(toks, /[-–—]|до/.test(m[1]))) { sizes = true; break; }
    }
    if (!sizes) { // в названии без слова «размер»: «Угги 36-45», «кеды 41 42 43 44»
      const t = palText(title).text;
      for (const m of t.matchAll(/(?:^|[^\d])(\d{2})\s*[-–—]\s*(\d{2})(?![\d.,]|\s*(?:см|мм|%))/g)) if (manySizes([m[1], m[2]], true)) { sizes = true; break; }
      if (!sizes) for (const m of t.matchAll(/(?:^|[^\d])(\d{2}(?:[\s,/]+\d{2}){2,})(?!\d)/g)) if (manySizes(m[1].split(/[\s,/]+/), false)) { sizes = true; break; }
      if (!sizes) for (const m of t.matchAll(/(?:^|[^a-z0-9])([2-5]?x{0,3}[sml]|xxs)\s*[-–—]\s*([2-5]?x{0,3}[sml])(?![a-z])/g)) if (manySizes([m[1], m[2]], true)) { sizes = true; break; }
    }
    // главный признак: продавец пали держит весь размерный ряд. «Новое» + много размеров — уже паль
    if (sizes) { m += 4; why.push('много размеров в наличии'); }
    let strong = 0;
    for (const [re, label] of PAL_STRONG) if (re.test(text)) { strong++; why.push(label); }
    m += Math.min(strong, 2) * 5;
    if (!strong && PAL_LIKE.test(text)) { m += 3; why.push('«по типу»'); }
    const shop = [...new Set([...text.matchAll(PAL_SHOP)].map((x) => x[0]))];
    if (shop.length) { m += Math.min(shop.length, 2) * 2; why.push(`«${shop[0]}»`); }
    if (PAL_PROMO.test(text)) { w += 1; why.push('реклама магазина'); }
    if (sellerName && (PAL_SHOPNAME.test(norm(sellerName)) || /^[A-Z0-9 &._'-]{3,}$/.test(sellerName.trim()))) {
      w += isUsed ? 1 : 2; why.push('продавец-магазин');
    }
    if (closed >= 500 && !isUsed) { w += 1; why.push(`${closed} завершённых объявлений`); }
    const minus = isUsed && !strong ? 2 : 0; // паль почти всегда «новая»: у ношеных вещей порог выше
    return { v: PAL_V, w, m, minus, s: Math.min(w, PAL_WEAK_CAP) + m - minus, why, isNew: isNewTag || isNew };
  }
  const PAL_V = 4; // версия правил: старые сохранённые оценки пересчитываются
  const palCache = new Map();
  function palFeat(it) {
    const key = `${it.id}|${it.price}|${it.params}|${it.title}|${it.sellerName}|${(it.fullDesc || '').length}`;
    let f = palCache.get(key);
    if (!f) {
      const closed = it.closed ?? +(((it.pal && it.pal.why) || []).join(' ').match(/(\d+) завершённых/) || [0, 0])[1];
      // полное описание (со страницы объявления) — если уже скачано; в выдаче Авито его часто нет
      f = palFeatures({ title: it.title, desc: (it.desc || '') + '\n' + (it.fullDesc || ''), params: it.params || '', sellerName: it.sellerName, closed, price: it.price });
      palCache.set(key, f);
    }
    return f;
  }
  // то же при разборе выдачи: одни и те же объявления приходят при каждой проверке — регулярки гоняем один раз
  const palMemo = new Map();
  function palFeaturesMemo(id, a) {
    const key = `${id}|${a.price}|${a.closed}|${a.sellerName}|${a.params}|${a.title}|${a.desc.length}`;
    let f = palMemo.get(key);
    if (!f) {
      if (palMemo.size > 20000) palMemo.clear();
      f = palFeatures(a); palMemo.set(key, f);
    }
    return f;
  }

  // одинаковые новые вещи: у одного продавца по одной цене или у разных продавцов (сеть магазинов пали)
  function palDupIndex(feed) {
    const bySeller = new Map(), byCity = new Map(), byTitle = new Map();
    const add = (map, k, v) => { if (!map.has(k)) map.set(k, new Set()); map.get(k).add(v); };
    for (const it of Object.values(feed || {})) {
      if (!it.price || it.price < 1000) continue;
      const cond = norm(String(it.params || '').split('·')[0]);
      if (!/^новое/.test(cond)) continue;
      const br = brandKey(brandOf(it)), who = it.sellerKey || 'id:' + it.id;
      if (br) add(bySeller, `${who}|${br}|${it.price}`, it.id);
      if (br && it.city && it.price % 500) add(byCity, `${br}|${it.price}|${norm(it.city)}`, who);
      add(byTitle, `${brandKey(it.title)}|${it.price}`, who);
    }
    return { bySeller, byCity, byTitle };
  }
  function palDups(it, idx) {
    if (!idx || !it.price || it.price < 1000 || !/^новое/.test(norm(String(it.params || '').split('·')[0]))) return '';
    const br = brandKey(brandOf(it)), who = it.sellerKey || 'id:' + it.id;
    if (br && (idx.bySeller.get(`${who}|${br}|${it.price}`) || new Set()).size >= 2) return 'у продавца несколько одинаковых новых вещей по одной цене';
    const other = (set) => set && [...set].some((x) => x !== who);
    if (br && it.city && it.price % 500 && other(idx.byCity.get(`${br}|${it.price}|${norm(it.city)}`))) return `такие же новые ${brandOf(it)} по ${fmtPrice(it.price)} продают другие продавцы из того же города`;
    if (other(idx.byTitle.get(`${brandKey(it.title)}|${it.price}`))) return 'точно такое же объявление у другого продавца';
    return '';
  }

  // память о продавцах: сколько их объявлений встречается в ваших поисках и сколько из них похожи на паль
  const PALDB_KEY = 'palSellers', PALDB_MAX = 3000, PALDB_DAYS = 30, PAL_IDS_MAX = 30;
  let palDb = null, palDbAt = 0, palDbDirty = false;
  function palDbLoad() {
    if (!palDb || (!palDbDirty && Date.now() - palDbAt > 15000)) {
      try { palDb = JSON.parse(GM_getValue(PALDB_KEY, '{}')) || {}; } catch { palDb = {}; }
      palDbAt = Date.now();
    }
    return palDb;
  }
  const brandOf = (it) => { const p = String(it.params || '').split('·').map((x) => x.trim()); return p.length >= 2 ? p[p.length - 1] : ''; };
  const pushCap = (arr, v, cap) => { if (v && !arr.includes(v)) { arr.unshift(v); if (arr.length > cap) arr.length = cap; } };
  function palDbAdd(items) {
    const db = palDbLoad(), now = Date.now();
    for (const it of items) {
      if (!it.sellerKey) continue;
      const r = db[it.sellerKey] || (db[it.sellerKey] = { ids: [], br: [], bad: [] });
      r.t = now;
      pushCap(r.ids, it.id, PAL_IDS_MAX);
      pushCap(r.br, brandOf(it), 6);
      if (it.pal && it.pal.s >= PAL_LIMIT) pushCap(r.bad, it.id, 5);
    }
    palDbDirty = true;
  }
  function palDbSave() {
    if (!palDbDirty || !palDb) return;
    const border = Date.now() - PALDB_DAYS * 86400000;
    let keys = Object.keys(palDb).filter((k) => { if ((palDb[k].t || 0) < border) { delete palDb[k]; return false; } return true; });
    if (keys.length > PALDB_MAX) keys.sort((a, b) => palDb[a].t - palDb[b].t).slice(0, keys.length - PALDB_MAX).forEach((k) => delete palDb[k]);
    GM_setValue(PALDB_KEY, JSON.stringify(palDb));
    palDbDirty = false; palDbAt = Date.now();
  }
  // «это не паль» — продавцы (и отдельные объявления без продавца), которых детектор больше не трогает
  const loadPalOk = () => { try { return JSON.parse(GM_getValue('palOk', '{}')) || {}; } catch { return {}; } };
  const palOn = () => GM_getValue('palOff', '') !== '1';

  // итог: null — обычное объявление, { s, why } — похоже на паль
  // вещь выставлена не в своей категории: магазины пали так попадают в чужие поиски (худи — в «аксессуарах»)
  const W_CLOTH = rxW(String.raw`худи|\bзип|толстовк|свитшот|футболк|\bполо\b|рубашк|сорочк|джинс|брюк|штан|куртк|пуховик|жилет|свитер|джемпер|кардиган|пиджак|костюм|шорт|ветровк|\bпарк[аи]\b|бомбер|лонгслив|\bмайк|пальто|тренч|анорак|овершот`);
  const W_SHOE = rxW(String.raw`кроссовк|\bкеды|\bкед\b|ботинк|туфл|лофер|сапог|слипон|мокасин|сникер|сандал|шл[её]пан|\bдерби\b|челси`);
  const W_ACC = rxW(String.raw`ремень|ремн|сумк|кошел|очки|шапк|кепк|бейсболк|панам|шарф|перчат|галстук|рюкзак|\bчасы|браслет|кольц|цеп[ьо]|портмоне|визитниц|картхолдер|ключниц|носк|бабочк|запонк|портфел|клатч|поясн|шопер|барсетк|чехол|платок|подтяжк|зонт|духи|парфюм|кардхолдер|бумажник`);
  const KIND_BY_CAT = { 748: 'odezhda', 2804317: 'obuv', 749: 'aks', 2804316: 'aks' };
  const kindCache = new Map();
  function searchKind(search) {
    if (!search) return '';
    if (!kindCache.has(search.id)) {
      let k = '';
      try { const c = avfParse(new URL(search.url).searchParams.get('f')).singles.find(([p]) => p === 175); if (c) k = KIND_BY_CAT[c[1]] || ''; } catch { /* нет фильтра */ }
      if (!k) { const n = search.name || ''; k = /^👕/u.test(n) ? 'odezhda' : /^👟|^👞/u.test(n) ? 'obuv' : /^🕶|^👜/u.test(n) ? 'aks' : ''; }
      kindCache.set(search.id, k);
    }
    return kindCache.get(search.id);
  }
  function wrongCategory(it, search) {
    const k = searchKind(search);
    if (!k) return '';
    const t = palText(it.title).text;
    const cl = W_CLOTH.test(t), sh = W_SHOE.test(t), ac = W_ACC.test(t);
    if (k === 'aks' && (cl || sh) && !ac) return cl ? 'одежда' : 'обувь';
    if (k === 'odezhda' && sh && !cl && !ac) return 'обувь';
    if (k === 'obuv' && cl && !sh && !ac) return 'одежда';
    return '';
  }

  function palVerdict(it, ctx, search) {
    if (!(ctx ? ctx.palOn : palOn())) return null;
    const ok = (ctx && ctx.palOk) || loadPalOk();
    if ((it.sellerKey && ok[it.sellerKey]) || ok['id:' + it.id]) return null;
    const f = palFeat(it);
    let { w, m } = f;
    const why = [...f.why];
    const r = it.sellerKey && palDbLoad()[it.sellerKey];
    if (r) {
      // магазины пали заваливают выдачу: чем чаще продавец попадается в ваших поисках, тем подозрительнее
      const n = r.ids.length;
      const pts = n >= 20 ? 4 : n >= 10 ? 3 : n >= 5 ? 2 : 0;
      if (pts) { m += pts; why.push(`продавец попался в ваших поисках ${n >= PAL_IDS_MAX ? PAL_IDS_MAX + '+' : n} раз`); }
      const bad = r.bad.filter((x) => x !== it.id).length;
      if (bad) { m += bad >= 2 ? 3 : 2; why.push('у продавца есть ещё объявления, похожие на паль'); }
    }
    if (ctx && ctx.feed && !ctx.dup) ctx.dup = palDupIndex(ctx.feed);
    const dup = palDups(it, ctx ? ctx.dup : palDupIndex(loadFeedRO()));
    if (dup) { m += 3; why.push(dup); }
    // магазины пали постоянно поднимают объявления; у новой вещи это признак, у ношеной — нет
    if (it.bumped && f.isNew) { m += 2; why.push('перевыложено / поднято'); }
    const wc = wrongCategory(it, search);
    if (wc) { m += 3; why.push(`${wc} выставлена не в своей категории`); }
    const s = Math.min(w, PAL_WEAK_CAP) + m - f.minus;
    // один признак — не повод: нужно минимум два разных
    return s >= PAL_LIMIT && m > 0 && why.length >= 2 ? { s, why } : null;
  }

  // ctx — заранее прочитанные продавцы и общие стоп-слова (чтобы не читать хранилище на каждое объявление)
  const hideCtx = () => ({ sellers: loadSellers(), global: loadGlobal(), palOk: loadPalOk(), palOn: palOn() });
  function feedHideReason(it, search, ctx) {
    const { sellers, global } = ctx || hideCtx();
    if (it.sellerKey && sellers[it.sellerKey]) return 'seller';
    if (it.sellerName && sellers['name:' + it.sellerName.toLowerCase()]) return 'seller';
    const words = [...global, ...((search && search.ban) || [])];
    if (findWord(itemText(it), words)) return 'word';
    if (insoleMismatch(it, search)) return 'insole';
    if (sizeMismatch(it, search)) return 'size';
    return brandMismatch(it, search) ? 'brand' : null;
  }

  let feedRunning = false;
  const CONCURRENCY = 3;
  const MAX_PAGES = 8; // объединённые поиски (по 7 брендов) после перерыва могут набрать несколько страниц новых                // дочитываем до 3 страниц, если все объявления на странице новые              // сколько поисков проверяем одновременно
  const LOCK_KEY = 'feedLock';        // чтобы две вкладки не проверяли одновременно
  const BG_EVERY = 5 * 60000;
  const BG_BATCH = 25;                // столько поисков за одну фоновую проверку         // фоновая проверка раз в 5 минут

  // быстрый разбор: вырезаем из страницы только карточки, а не строим DOM всех 2 МБ
  function quickCards(html) {
    const re = /<div[^>]*data-marker="item"[^>]*>/g;
    const starts = [];
    let m;
    while ((m = re.exec(html))) starts.push(m.index);
    if (!starts.length) return [];
    const chunks = starts.map((st, i) => html.slice(st, i + 1 < starts.length ? starts[i + 1] : Math.min(html.length, st + 40000)));
    const doc = new DOMParser().parseFromString('<div>' + chunks.map((c) => '<section>' + c + '</section>').join('') + '</div>', 'text/html');
    return parseCards(doc);
  }

  // ---- данные страницы: Авито кладёт в неё JSON со всеми объявлениями ----
  // Там есть то, чего нет в разметке: точное время публикации/поднятия (sortTimeStamp),
  // цена числом и признак «из других городов» (extraBlockItems).
  const BUMP_MARGIN = 150e6; // ≈ неделя по номерам объявлений: старше — значит «поднятое» старое

  function spanAt(str, i) { // конец JSON-объекта/массива, начинающегося в позиции i
    const open = str[i], close = open === '{' ? '}' : ']';
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < str.length; j++) {
      const ch = str[j];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close && --depth === 0) return j + 1;
    }
    return -1;
  }

  function parseState(html) {
    let exFrom = -1, exTo = -1;
    const exKey = html.indexOf('"extraBlockItems":[');
    if (exKey >= 0) { exFrom = exKey + 18; exTo = spanAt(html, exFrom); }
    const re = /\{"id":(\d+),"categoryId"/g;
    const out = new Map();
    let m;
    while ((m = re.exec(html))) {
      const end = spanAt(html, m.index);
      if (end < 0) break;
      let o;
      try { o = JSON.parse(html.slice(m.index, end)); } catch { continue; }
      re.lastIndex = end;
      const id = String(o.id);
      if (!o.urlPath || !o.sortTimeStamp || out.has(id)) continue;
      let sellerKey = '', sellerName = '';
      for (const step of (o.iva && o.iva.UserInfoStep) || []) {
        const pr = step && step.payload && step.payload.profile;
        const mm = pr && pr.link && pr.link.match(SELLER_RE);
        if (mm) { sellerKey = `${mm[1]}:${mm[2]}`; sellerName = pr.title || ''; break; }
      }
      const im = (o.images && o.images[0]) || {};
      const alt = (o.gallery && o.gallery.imageAlt) || '';
      const params = (((o.iva && o.iva.FashionParamsStep) || []).map((x) => x && x.payload && x.payload.value).filter(Boolean)).join(' · ');
      const closed = +((String(o.closedItemsText || '').replace(/\s/g, '').match(/\d+/) || [0])[0]);
      out.set(id, {
        id,
        title: o.title || '',
        url: 'https://www.avito.ru' + String(o.urlPath).split('?')[0],
        price: (o.priceDetailed && +o.priceDetailed.value) || 0,
        img: im['416x416'] || im['472x472'] || Object.values(im)[0] || '',
        city: (o.addressDetailed && o.addressDetailed.locationName) || (alt.includes(',') ? alt.split(',').pop().trim() : ''),
        desc: String(o.description || '').slice(0, 300),
        // строка «Отличное · 48 (M) · Brunello Cucinelli» — в ней всегда есть бренд
        params,
        ts: +o.sortTimeStamp,
        sellerKey, sellerName,
        closed,
        pal: palFeaturesMemo(id, { title: o.title || '', desc: String(o.description || ''), params, sellerName, closed, price: (o.priceDetailed && +o.priceDetailed.value) || 0 }),
        extra: exFrom >= 0 && m.index > exFrom && (exTo < 0 || m.index < exTo),
      });
    }
    return [...out.values()];
  }

  const isFresh = (it, s) => it.ts > (s.lastTs || 0) && +it.id > (s.maxId || 0) - BUMP_MARGIN;
  // журнал: почему объявление не попало в ленту (для кнопки «Почему нет?»)
  const SKIP_KEY = 'skipLog', SKIP_MAX = 4000;
  function logSkip(entries) {
    if (!entries.length) return;
    let log; try { log = JSON.parse(GM_getValue(SKIP_KEY, '{}')) || {}; } catch { log = {}; }
    for (const [id, why] of entries) log[id] = { ...why, t: Date.now() };
    const ids = Object.keys(log);
    if (ids.length > SKIP_MAX) ids.sort((a, b) => log[a].t - log[b].t).slice(0, ids.length - SKIP_MAX).forEach((id) => delete log[id]);
    GM_setValue(SKIP_KEY, JSON.stringify(log));
  }
  const loadSkip = () => { try { return JSON.parse(GM_getValue(SKIP_KEY, '{}')) || {}; } catch { return {}; } };

  // S — состояние проверки в памяти (см. checkAll): поиски, лента, что поменялось. Пишем в хранилище пачкой.
  async function checkOne(s, S) {
    const feed = S.feed;
    const u = new URL(s.url);
    const res = await fetch(location.origin + u.pathname + u.search, { credentials: 'include' });
    const html = await res.text();
    const cs = S.mem.get(s.id);
    if (!cs) return { found: 0 };
    const set = (k, v) => { cs[k] = v; S.patch(cs.id).fields[k] = v; };
    if (res.status === 404 || (NOT_FOUND.test(html.slice(0, 200000)) && !/"params"/.test(html))) {
      set('warn', 'notfound'); set('lastCheckAt', Date.now());
      return { found: 0 };
    }
    const all = parseState(html);
    const hasTs = all.length > 0;
    let items = all.filter((x) => !x.extra);          // только настоящая выдача, без «других городов»
    const extraOnly = hasTs && !items.length;
    if (!hasTs) items = quickCards(html);             // запасной путь, если Авито поменяет формат
    if (!items.length && !extraOnly) {
      if (res.status === 429 || res.status === 403 || /captcha|Доступ ограничен|firewall/i.test(html.slice(0, 30000))) {
        return { blocked: true };
      }
      return { found: 0 };
    }
    // если вся страница новая — новых могло быть больше 50: дочитываем 2-ю и 3-ю страницы
    for (let page = 2; hasTs && s.lastTs && page <= MAX_PAGES; page++) {
      const freshCnt = items.filter((x) => x.ts > s.lastTs).length;
      if (items.length < 30 || freshCnt < items.length - 3) break; // 3 — на закреплённые платные
      const pu = new URL(location.origin + u.pathname + u.search);
      pu.searchParams.set('p', String(page));
      await sleep(250 + Math.random() * 250);
      const more = parseState(await (await fetch(pu.toString(), { credentials: 'include' })).text()).filter((x) => !x.extra);
      const known = new Set(items.map((x) => x.id));
      const add = more.filter((x) => !known.has(x.id));
      if (!add.length) break;
      items = [...items, ...add];
    }
    set('warn', extraOnly ? 'region' : '');
    set('lastCheckAt', Date.now());
    if (extraOnly) return { found: 0 };

    palDbAdd(items);
    const maxTs = Math.max(0, ...items.map((x) => x.ts || 0));
    const maxId = Math.max(0, ...items.map((x) => +x.id));
    const remember = (ids) => {
      cs.seen = [...new Set([...ids, ...(cs.seen || [])])].slice(0, SEEN_LIMIT);
      const add = S.patch(cs.id).seenAdd; ids.forEach((id) => add.add(id));
    };

    // первая проверка: только запоминаем, что уже есть
    if ((hasTs && !cs.lastTs) || (!hasTs && !(cs.seen && cs.seen.length))) {
      remember(items.map((x) => x.id));
      if (hasTs) { set('lastTs', maxTs); set('maxId', Math.max(cs.maxId || 0, maxId)); }
      return { found: 0 };
    }
    const seen = new Set(cs.seen || []);
    const ctx = S.ctx;
    const stale = [], skips = S.skips;
    let found = 0;
    for (const it of items) {
      const fv = S.favs[it.id]; // отложенное попалось в выдаче — запоминаем новую цену
      if (fv && it.price && fv.price !== it.price) { fv.price = it.price; S.favPrice.set(it.id, it.price); }
      if (seen.has(it.id)) continue;
      const prev = feed[it.id];
      if (prev) { // уже в ленте — освежаем данные (цена могла измениться), не трогая отметки
        if (prev.seenAt) continue; // вы его уже скрыли
        let { sid } = prev;
        // Авито подмешал вещь в чужой поиск, и её скрыли как «бренд/размер не тот» — а этот поиск находит её как свою:
        // переносим вещь к нему, иначе она так и осталась бы скрытой за первым поиском
        if (sid !== cs.id) {
          const os = S.mem.get(sid);
          const why = os ? feedHideReason(prev, os, ctx) : 'gone';
          if ((why === 'brand' || why === 'size' || why === 'gone') && !feedHideReason(it, cs, ctx)) sid = cs.id;
        }
        // ничего не поменялось — ленту не переписываем (раньше каждая проверка заново сохраняла её целиком)
        if (sid === prev.sid && it.price === prev.price && it.ts === prev.ts && it.title === prev.title && it.params === prev.params &&
          it.desc === prev.desc && it.img === prev.img && it.sellerKey === prev.sellerKey && it.sellerName === prev.sellerName && it.closed === prev.closed) continue;
        // цена поменялась — помним первую, чтобы показать «📉 было …»
        let oldPrice = prev.oldPrice;
        if (prev.price && it.price && it.price !== prev.price) oldPrice = prev.oldPrice || prev.price;
        if (oldPrice === it.price) oldPrice = undefined;
        feed[it.id] = { ...it, sid, found: prev.found, shownAt: prev.shownAt, bumped: prev.bumped, fullDesc: prev.fullDesc, descAt: prev.descAt, oldPrice };
        S.touched.add(it.id);
        continue;
      }
      if (hasTs && it.ts <= (cs.lastTs || 0)) { // дата старее прошлой проверки — уже было в выдаче
        stale.push(it.id); skips.push([it.id, { why: 'old', sid: cs.id, ts: it.ts }]); continue;
      }
      if (hasTs && !isFresh(it, cs)) it.bumped = true; // свежая дата, но старый номер — перевыложено/поднято: показываем с пометкой
      feed[it.id] = { ...it, sid: cs.id, found: Date.now() };
      S.touched.add(it.id);
      if (!feedHideReason(it, cs, ctx) && !palVerdict(it, ctx, cs)) found++;
    }
    if (stale.length) remember(stale);
    if (hasTs) { set('lastTs', Math.max(cs.lastTs || 0, maxTs)); set('maxId', Math.max(cs.maxId || 0, maxId)); }
    // активность: сколько новых объявлений в час появляется в этом поиске (сглаженно)
    const hrs = Math.max(0.05, (Date.now() - (s.lastCheckAt || Date.now() - 3600000)) / 3600000);
    const newHere = items.filter((it) => feed[it.id] && feed[it.id].sid === cs.id && Date.now() - feed[it.id].found < 60000).length;
    set('rate', +(0.7 * (cs.rate || 0) + 0.3 * (newHere / hrs)).toFixed(3));
    return { found };
  }

  // Раньше после каждого поиска целиком перезаписывались поиски (~1 МБ), лента (1–3 МБ) и журнал —
  // за полную проверку сотни мегабайт, это и тормозило. Теперь пишем только изменения, раз в несколько секунд.
  function newCheckState() {
    const mem = new Map(load().map((x) => [x.id, x]));
    const patches = new Map();
    const feed = loadFeed();
    const S = {
      mem, feed, touched: new Set(), skips: [], favs: loadFavs(), favPrice: new Map(),
      patch: (id) => { if (!patches.has(id)) patches.set(id, { fields: {}, seenAdd: new Set() }); return patches.get(id); },
      flush() {
        if (S.touched.size) {
          const f = loadFeed(); // свежая копия: пока шла проверка, вы могли что-то отметить в ленте
          for (const id of S.touched) {
            const mine = feed[id]; if (!mine) continue;
            const cur = f[id];
            f[id] = cur ? { ...mine, shownAt: cur.shownAt || mine.shownAt, seenAt: cur.seenAt || mine.seenAt, fullDesc: cur.fullDesc || mine.fullDesc, descAt: cur.descAt || mine.descAt } : mine;
            feed[id] = f[id];
          }
          saveFeed(f); S.touched.clear();
        }
        if (patches.size) {
          const list = load(); // свежая копия: отметки «просмотрено» из ленты не затираем, а дополняем
          for (const x of list) {
            const p = patches.get(x.id); if (!p) continue;
            Object.assign(x, p.fields);
            if (p.seenAdd.size) x.seen = [...new Set([...p.seenAdd, ...(x.seen || [])])].slice(0, SEEN_LIMIT);
          }
          save(list); patches.clear();
        }
        if (S.favPrice.size) {
          const fv = loadFavs(); let ch = false;
          for (const [id, p] of S.favPrice) {
            const x = fv[id]; if (!x || x.price === p) continue;
            if (!x.oldPrice) x.oldPrice = x.price;
            x.price = p; x.priceAt = Date.now(); ch = true;
            if (x.oldPrice === p) delete x.oldPrice;
          }
          S.favPrice.clear();
          if (ch) saveFavs(fv);
        }
        if (S.skips.length) { logSkip(S.skips.splice(0)); }
        try { palDbSave(); } catch { /* не критично */ }
      },
    };
    S.ctx = { ...hideCtx(), feed };
    return S;
  }

  // Чистим ленту от лишнего. Непросмотренные объявления НЕ трогаем (раньше обрезали всё подряд до 400 —
  // и после долгого перерыва большая часть новых пропадала). Режем только просмотренные и скрытые фильтрами.
  // номер версии кода: вкладка со старой версией, увидев более новую, перестаёт проверять в фоне
  const CODE_VER = 51;
  if (+GM_getValue('codeVer', 0) < CODE_VER) GM_setValue('codeVer', CODE_VER);
  const PENDING_MAX = 5000; // аварийный потолок для непросмотренных
  function trimFeed(feed) {
    const list = load();
    const byId = Object.fromEntries(list.map((s) => [s.id, s]));
    const seenSets = Object.fromEntries(list.map((s) => [s.id, new Set(s.seen || [])]));
    const ctx = hideCtx();
    const pending = [], rest = [];
    for (const [id, it] of Object.entries(feed)) {
      const s = byId[it.sid];
      if (!s) { delete feed[id]; continue; }                // поиск удалён
      (it.seenAt || seenSets[it.sid].has(id) || feedHideReason(it, s, ctx) ? rest : pending).push(id);
    }
    const byFound = (a, b) => feed[b].found - feed[a].found;
    rest.sort(byFound).slice(FEED_LIMIT).forEach((id) => delete feed[id]);
    if (pending.length > PENDING_MAX) pending.sort(byFound).slice(PENDING_MAX).forEach((id) => delete feed[id]);
  }

  // «⏪ Вернуть пропавшие»: откатываем отметку «проверено до …» на N часов назад и проверяем всё заново.
  // Просмотренное (кнопкой «✓ Скрыть» и т.п.) не вернётся — оно в списке просмотренных; то, что уже в ленте, не задвоится.
  // Важно: проверка, увидев в выдаче объявление с датой старше отметки, сама кладёт его в «просмотренные».
  // Поэтому пропавшие объявления после следующей проверки оказывались там, и простой откат их не находил.
  // Такие объявления записаны в журнал (why: 'old') — их и вынимаем из «просмотренных».
  // Объявления, которые вы скрыли сами или видели на сайте, в этот журнал не попадают и остаются скрытыми.
  function rewindSearches(hours) {
    const border = Date.now() - hours * 3600000;
    const list = load();
    const feed = loadFeed();
    const skip = loadSkip();
    const back = {}; // sid → Set(id), вернуть из «просмотренных»
    for (const [id, sk] of Object.entries(skip)) {
      if (sk.why !== 'old' || !(sk.ts > border) || feed[id]) continue;
      (back[sk.sid] = back[sk.sid] || new Set()).add(id);
      delete skip[id];
    }
    let n = 0, freed = 0;
    for (const s of list) {
      if (s.lastTs && s.lastTs > border) { s.lastTs = border; n++; }
      const b = back[s.id];
      if (b && s.seen) { const before = s.seen.length; s.seen = s.seen.filter((id) => !b.has(id)); freed += before - s.seen.length; }
    }
    save(list);
    GM_setValue(SKIP_KEY, JSON.stringify(skip));
    return { n, freed };
  }

  // limit — проверить только столько поисков, которые дольше всех не проверялись (по кругу)
  async function checkAll(onProgress, onPartial, limit = 0, pickIds = null) {
    if (feedRunning) return null;
    if (+GM_getValue('codeVer', 0) > CODE_VER) return { found: 0, problem: 'Скрипт обновился — обновите эту страницу.', busy: true };
    const lock = +GM_getValue(LOCK_KEY, 0);
    if (Date.now() - lock < 90000) return { found: 0, problem: '', busy: true }; // проверяет другая вкладка
    feedRunning = true;
    GM_setValue(LOCK_KEY, String(Date.now()));
    if (!palDbDirty) palDb = null;
    let list = load();
    if (pickIds) list = list.filter((x) => pickIds.includes(x.id));
    // сначала те, что дольше всех не проверялись: если прошлую проверку прервала пауза — продолжаем с них
    list = [...list].sort((a, b) => (a.lastCheckAt || 0) - (b.lastCheckAt || 0));
    if (limit && list.length > limit) list = list.slice(0, limit);
    const S = newCheckState();
    const flushTimer = setInterval(() => { try { S.flush(); } catch { /* попробуем в следующий раз */ } }, 3000);
    let found = 0, done = 0, problem = '', stop = false;
    const queue = [...list];
    // проверка из открытой ленты при паузе Авито ждёт и продолжает сама; фоновая — просто останавливается
    const interactive = !!onProgress;
    const PAUSES = [60, 120, 180, 240];   // секунды ожидания; после 4-й паузы сдаёмся
    let pauses = 0, pauseUntil = 0, maxWorkers = CONCURRENCY;
    let lockAt = 0;
    const report = () => {
      if (Date.now() - lockAt > 10000) { lockAt = Date.now(); GM_setValue(LOCK_KEY, String(lockAt)); } // «я ещё проверяю» — чтобы другие вкладки не начали параллельно
      if (!onProgress) return;
      const left = Math.ceil((pauseUntil - Date.now()) / 1000);
      onProgress(left > 0
        ? `⏸ Авито попросил паузу — продолжу сам через ${left} с. Проверено ${done} из ${list.length}.`
        : `Проверено ${done} из ${list.length}…`);
    };
    report();
    async function waitPause() {
      while (Date.now() < pauseUntil && !stop) { report(); await sleep(5000); }
    }
    async function worker(n) {
      await sleep(n * 250); // стартуем чуть вразнобой
      while (queue.length && !stop) {
        if (n >= maxWorkers) return;            // после паузы проверяем в один поток
        await waitPause();
        if (stop || !queue.length) break;
        const s = queue.shift();
        try {
          let r = await checkOne(s, S);
          if (r.blocked) { // один повтор после короткой паузы
            await sleep(4000);
            r = await checkOne(s, S);
          }
          if (r.blocked) {
            queue.unshift(s);                    // этот поиск проверим после паузы
            if (!interactive || pauses >= PAUSES.length) {
              stop = true;
              problem = 'Авито попросил паузу (защита от частых запросов). Непроверенные поиски не потеряются — ' +
                'нажмите «🔄 Проверить» через пару минут, проверка начнётся с них.';
              break;
            }
            if (Date.now() >= pauseUntil) {     // паузу назначает первый, кто упёрся
              pauseUntil = Date.now() + PAUSES[pauses++] * 1000;
              maxWorkers = 1;
            }
            continue;
          }
          found += r.found;
        } catch (e) {
          problem = 'Ошибка сети: ' + e.message;
        }
        done++;
        report();
        onPartial && onPartial();
        if (queue.length) await sleep((maxWorkers === 1 ? 900 : 200) + Math.random() * 300);
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, (_, i) => worker(i)));
    } finally {
      clearInterval(flushTimer);
      try { S.flush(); } catch { /* ниже ещё раз сохраним ленту */ }
      const f = loadFeed(), n0 = Object.keys(f).length;
      trimFeed(f);
      if (Object.keys(f).length !== n0) saveFeed(f);
      saveMeta({ lastCheck: Date.now() });
      GM_setValue(LOCK_KEY, '0');
      feedRunning = false;
      updateFabBadge();
    }
    return { found, problem, blocked: stop };
  }

  // ---- фоновая проверка: темп подстраивается под Авито, частые поиски проверяются чаще ----
  const BG = { minGap: 90000, start: 20, min: 8, max: 60, step: 5, pause: 10 * 60000, fast: 6 * 60000, slow: 40 * 60000 };
  const loadBg = () => { try { return JSON.parse(GM_getValue('bgState', '{}')) || {}; } catch { return {}; } };
  const saveBg = (o) => GM_setValue('bgState', JSON.stringify(o));
  // как часто проверять поиск: активные — раз в ~6 мин, «тихие» — раз в ~40 мин
  const wantEvery = (s) => Math.max(BG.fast, Math.min(BG.slow, BG.slow / (1 + 3 * (s.rate || 0))));
  const overdue = (s, now) => (now - (s.lastCheckAt || 0)) / wantEvery(s);

  async function backgroundTick() {
    if ((document.visibilityState !== 'visible' && !loadOpts().hiddenTab) || feedRunning || mergeRunning || !loadRO().length) return;
    const bg = loadBg(), now = Date.now();
    if (now < (bg.pauseUntil || 0) || now - (loadMeta().lastCheck || 0) < BG.minGap) return;
    const batch = bg.batch || BG.start;
    const due = loadRO().map((s) => [s, overdue(s, now)]).filter(([, o]) => o >= 1).sort((a, b) => b[1] - a[1]);
    if (!due.length) return;
    const pick = due.slice(0, batch).map(([s]) => s.id);
    // в открытой ленте найденное появляется само, не сбивая прокрутку
    const r = await checkAll(null, () => feedUi && feedUi.partial(), 0, pick);
    if (!r || r.busy) return;
    if (feedUi) feedUi.done(r);
    if (r.found) { await descRun(); notifyNew(now); } // сначала описания: паль из уведомления уйдёт
    if (r.blocked) { // Авито просит паузу — вдвое медленнее и отдыхаем
      saveBg({ batch: Math.max(BG.min, Math.floor(batch / 2)), pauseUntil: Date.now() + BG.pause, lastBlock: Date.now() });
    } else if (pick.length >= batch) { // всё прошло, а очередь была полной — можно чуть быстрее
      saveBg({ ...bg, batch: Math.min(BG.max, batch + BG.step), pauseUntil: 0 });
    }
  }
  setTimeout(backgroundTick, 4000);
  setInterval(backgroundTick, 60000);

  // 🔔 уведомление о новых, когда вы не смотрите на вкладку Авито (хорошие вещи разбирают быстро)
  let lastNotify = 0;
  function notifyNew(since) {
    if (!loadOpts().notify || typeof GM_notification !== 'function') return;
    if (document.visibilityState === 'visible' && document.hasFocus()) return; // вы и так смотрите на Авито
    const fresh = pendingItems().filter((x) => !x.pv && !x.shownAt && x.found >= since);
    if (!fresh.length || Date.now() - lastNotify < 60000) return;
    lastNotify = Date.now();
    const text = fresh.slice(0, 3).map((x) => `${fmtPrice(x.price)} — ${x.title}`).join('\n') +
      (fresh.length > 3 ? `\n…и ещё ${fresh.length - 3}` : '');
    try {
      GM_notification({ title: `⭐ Авито: новых ${fresh.length}`, text, timeout: 20000,
        onclick: () => { try { window.focus(); } catch { /* ничего */ } if (feedUi) feedUi.show(); else openFeed(false); } });
    } catch { /* уведомления недоступны */ }
  }

  // ---------------- полные описания: скачиваем анонимно ----------------
  // В выдаче Авито описания почти нет (было у 7 объявлений из 100), а «размеры S–XXL в наличии», «поможем подобрать
  // по росту и весу» пишут именно там. Страницу объявления берём БЕЗ cookie (credentials: 'omit'): Авито не связывает
  // этот просмотр с вами, рекомендации не портятся. Только новые вещи из ленты, по одной, каждую — один раз.
  const DESC = { perRun: 12, gap: 2500, maxAgeH: 72, keep: 1500, pause: 15 * 60000, maxPause: 2 * 3600000 };
  const loadDescSt = () => peekJSON('descState', '{}');
  const saveDescSt = (o) => GM_setValue('descState', JSON.stringify({ ...loadDescSt(), ...o }));
  let descRunning = false;

  function descCandidates() {
    const okSellers = loadPalOk(), border = Date.now() - DESC.maxAgeH * 3600000;
    return pendingItems().filter((it) => !it.descAt && !it.pv && it.url && (it.found || 0) > border && (it.desc || '').length < 250 &&
      /^новое/.test(norm(String(it.params || '').split('·')[0]).trim()) && !(it.sellerKey && okSellers[it.sellerKey]))
      .sort((a, b) => (a.shownAt ? 1 : 0) - (b.shownAt ? 1 : 0)); // сначала то, что вы ещё не видели
  }

  const htmlToText = (h) => {
    const t = document.createElement('textarea'); // только раскодирует &amp; и т.п., ничего не выполняет
    t.innerHTML = String(h).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|div|li)>/gi, '\n').replace(/<[^>]+>/g, '');
    return t.value.trim();
  };
  function jsonStrAt(html, i) { // строка JSON, начинающаяся сразу после открывающей кавычки
    let j = i;
    while (j < html.length && html[j] !== '"') j += html[j] === '\\' ? 2 : 1;
    try { return JSON.parse('"' + html.slice(i, j) + '"'); } catch { return ''; }
  }
  function extractDesc(html, id) {
    let m = html.match(/<div[^>]*(?:data-marker="item-view\/item-description"|itemprop="description")[^>]*>([\s\S]{0,30000}?)<\/div>/);
    if (m) { const t = htmlToText(m[1]); if (t.length >= 15) return t; }
    // JSON страницы: "description":"…" рядом с номером этого объявления (не похожих)
    let best = '';
    const re = /"description":"/g;
    let x;
    while ((x = re.exec(html))) {
      if (!html.slice(Math.max(0, x.index - 4000), x.index + 4000).includes(id)) continue;
      const t = jsonStrAt(html, x.index + x[0].length);
      if (t.length > best.length) best = t;
    }
    if (best.length >= 15) return htmlToText(best);
    m = html.match(/<meta[^>]+(?:property="og:description"|itemprop="description")[^>]+content="([^"]*)"/);
    return m ? htmlToText(m[1]) : '';
  }
  async function descFetch(it) {
    const u = new URL(it.url);
    const res = await fetch(location.origin + u.pathname, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (res.status === 404 || res.status === 410) return { text: '' };
    const html = await res.text();
    const text = extractDesc(html, it.id);
    if (res.status === 429 || res.status === 403 || (!text && /captcha|Доступ ограничен|firewall/i.test(html.slice(0, 30000)))) return { blocked: true };
    return { text };
  }

  async function descRun() {
    if (descRunning || feedRunning || mergeRunning || !loadOpts().desc) return 0;
    if (document.visibilityState !== 'visible' && !loadOpts().hiddenTab) return 0;
    const st = loadDescSt();
    if (Date.now() < (st.pauseUntil || 0) || Date.now() - +GM_getValue('descLock', 0) < 30000) return 0; // пауза или качает другая вкладка
    const todo = descCandidates().slice(0, DESC.perRun);
    if (!todo.length) return 0;
    descRunning = true;
    const got = {};
    let n = 0, ok = 0, fail = 0, blocked = false, lastFail = '';
    const save = () => { // пачкой: лента весит мегабайты
      const ids = Object.keys(got);
      if (!ids.length) return;
      const feed = loadFeed();
      for (const id of ids) if (feed[id]) Object.assign(feed[id], got[id]);
      saveFeed(feed);
      // паль нашлась по описанию — запоминаем у продавца: остальные его вещи тоже станут подозрительнее
      const byId = new Map(loadRO().map((s) => [s.id, s]));
      const ctx = { ...hideCtx(), feed }, db = palDbLoad();
      for (const id of ids) {
        const it = feed[id];
        if (it && it.fullDesc && it.sellerKey && db[it.sellerKey] && palVerdict(it, ctx, byId.get(it.sid))) { pushCap(db[it.sellerKey].bad, id, 5); palDbDirty = true; }
      }
      try { palDbSave(); } catch { /* не критично */ }
      ids.forEach((id) => delete got[id]);
      updateFabBadge();
      if (feedUi) feedUi.partial();
    };
    try {
      for (const it of todo) {
        if (feedRunning || mergeRunning) break; // проверке поисков не мешаем
        GM_setValue('descLock', String(Date.now()));
        let r;
        try { r = await descFetch(it); } catch { continue; } // сеть — попробуем в следующий раз
        if (r.blocked) { blocked = true; break; }
        const text = r.text.replace(/[ \t ]+/g, ' ').replace(/\n\s*\n+/g, '\n').slice(0, DESC.keep);
        got[it.id] = { fullDesc: text, descAt: Date.now() };
        if (text) ok++; else { fail++; lastFail = it.url; }
        if (++n % 4 === 0) save();
        await sleep(DESC.gap + Math.random() * 1500);
      }
    } finally {
      save();
      const st2 = loadDescSt();
      const pause = blocked ? Math.min(DESC.maxPause, st2.lastPause ? st2.lastPause * 2 : DESC.pause) : 0;
      saveDescSt({ ok: (st2.ok || 0) + ok, fail: (st2.fail || 0) + fail, lastPause: pause,
        ...(lastFail ? { lastFail } : {}), ...(blocked ? { pauseUntil: Date.now() + pause } : {}) });
      GM_setValue('descLock', '0');
      descRunning = false;
    }
    return n;
  }
  setInterval(() => { descRun(); }, 45000);
  function descStatus() {
    const st = loadDescSt();
    if (!loadOpts().desc) return '📄 Загрузка описаний выключена (⚙️).';
    const p = (st.pauseUntil || 0) - Date.now();
    return `📄 Описаний скачано: ${st.ok || 0}, страниц без описания: ${st.fail || 0}` +
      (p > 0 ? ` · Авито попросил паузу, продолжу через ${Math.ceil(p / 60000)} мин` : '');
  }

  function openFeedOpts() {
    modal('⚙️ Настройки ленты', (box, close) => {
      const o = loadOpts();
      const row = (key, text, hint) => {
        const l = el('label'); l.style.cssText = 'display:flex;gap:8px;align-items:flex-start;margin:10px 0;cursor:pointer';
        const c = el('input'); c.type = 'checkbox'; c.checked = !!o[key]; c.style.marginTop = '3px';
        c.onchange = () => saveOpt(key, c.checked);
        const t = el('div', null, text);
        const s = el('div', null, hint); s.style.cssText = 'color:#777;font-size:12px;margin-top:2px';
        t.append(s); l.append(c, t); box.append(l);
      };
      row('notify', '🔔 Уведомлять о новых объявлениях', 'Когда фоновая проверка нашла новое, а вы смотрите не на Авито. Не чаще раза в минуту.');
      row('hiddenTab', '🌙 Проверять, даже когда вкладка Авито не на экране',
        'Для ПК: оставьте одну вкладку Авито открытой в фоне — скрипт будет проверять поиски и присылать уведомления. На телефоне браузер обычно усыпляет фоновые вкладки.');
      row('desc', '📄 Загружать описания новых вещей для детектора пали',
        'В выдаче Авито описания нет, а «все размеры в наличии» пишут именно там. Страница скачивается анонимно, без ваших cookie — рекомендации не портятся. По одной раз в несколько секунд.');
      const ds = el('div', null, descStatus()); ds.style.cssText = 'color:#555;font-size:12px;margin:4px 0 0 24px';
      box.append(ds);
      const test = mbtn('Проверить уведомление');
      test.onclick = () => {
        if (typeof GM_notification !== 'function') { alert('Уведомления недоступны в этом браузере или Tampermonkey.'); return; }
        try { GM_notification({ title: '⭐ Авито: так выглядит уведомление', text: '5 000 ₽ — пример объявления', timeout: 8000 }); } catch (e) { alert('Не вышло: ' + e.message); }
      };
      const ok = mbtn('Готово', true); ok.onclick = close;
      const keys = el('div', null, 'Клавиши в ленте (ПК): J / K — следующее / предыдущее, O или Enter — открыть, X — скрыть, F — отложить.');
      keys.style.cssText = 'color:#555;font-size:12px;margin-top:6px';
      box.append(keys, test, ok);
    });
  }


  // объявления, которые ещё не просмотрены (нет в seen своего поиска) и не скрыты
  // результат пересчитываем, только если поменялись поиски, лента, скрытые продавцы, стоп-слова или «не паль»
  let pendCache = null;
  function pendingItems() {
    palDbLoad(); // чтобы отметка времени памяти о продавцах не менялась прямо посреди сравнения
    const sig = [GM_getValue(KEY, '[]'), GM_getValue(FEED_KEY, '{}'), GM_getValue('blockedSellers', '{}'),
      GM_getValue(GLOBAL_KEY, '[]'), GM_getValue('palOk', '{}'), GM_getValue('palOff', ''), palDbAt];
    if (pendCache && pendCache.sig.every((v, i) => v === sig[i])) return pendCache.out;
    const out = pendingCalc();
    pendCache = { sig, out };
    return out;
  }
  function pendingCalc() {
    const list = loadRO();
    const byId = Object.fromEntries(list.map((s) => [s.id, s]));
    const feed = loadFeedRO();
    const ctx = hideCtx();
    ctx.feed = feed; // для поиска одинаковых объявлений (сети магазинов пали)
    const seenSets = {};
    const out = [];
    for (const it of Object.values(feed)) {
      const s = byId[it.sid];
      if (!s) continue;
      if (!seenSets[s.id]) seenSets[s.id] = new Set(s.seen || []);
      if (it.seenAt || seenSets[s.id].has(it.id)) continue;
      if (feedHideReason(it, s, ctx)) continue;
      out.push({ ...it, sname: s.name, pv: palVerdict(it, ctx, s) });
    }
    return out.sort((a, b) => (b.ts || b.found) - (a.ts || a.found));
  }

  // Отметку ставим и на само объявление в ленте (seenAt): список «просмотрено» у поиска ограничен 500 —
  // раньше при «Всё просмотрено» на 600 объявлений одного поиска часть из них так и оставалась в ленте.
  // unmark — отменить отметку (кнопка «Отменить»)
  function markSeen(ids, unmark = false) {
    const feed = loadFeed(), now = Date.now();
    const bySid = new Map();
    for (const id of ids) {
      const it = feed[id]; if (!it) continue;
      if (unmark) delete it.seenAt; else it.seenAt = now;
      if (!bySid.has(it.sid)) bySid.set(it.sid, []);
      bySid.get(it.sid).push(id);
    }
    if (!bySid.size) return;
    const list = load();
    for (const s of list) {
      const add = bySid.get(s.id); if (!add) continue;
      if (unmark) { const drop = new Set(add); s.seen = (s.seen || []).filter((x) => !drop.has(x)); }
      else s.seen = [...new Set([...add, ...(s.seen || [])])].slice(0, SEEN_LIMIT);
    }
    save(list); saveFeed(feed);
    updateFabBadge();
  }

  // счётчик на кнопке: много вызовов подряд — один пересчёт
  let badgeTimer = null;
  function updateFabBadge() {
    if (!badgeTimer) badgeTimer = setTimeout(() => { badgeTimer = null; updateFabBadgeNow(); }, 400);
  }
  function updateFabBadgeNow() {
    const fabEl = document.getElementById('ams-fab');
    if (!fabEl) return;
    const n = pendingItems().filter((x) => !x.shownAt && !x.pv).length;
    // число новых и в заголовке вкладки — видно, даже когда смотрите другую вкладку
    const base = document.title.replace(/^\(\d+\+?\) /, '');
    const want = n ? `(${n > 99 ? '99+' : n}) ${base}` : base;
    if (document.title !== want) document.title = want;
    let b = fabEl.querySelector('.ams-badge');
    if (!n) { b?.remove(); return; }
    if (!b) { b = el('span', 'ams-badge'); fabEl.append(b); }
    b.textContent = n > 99 ? '99+' : String(n);
  }

  function fmtWhen(ts) {
    const d = new Date(ts), now = new Date();
    const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(now) - day(d)) / 86400000);
    if (diff === 0) return 'сегодня в ' + hm;
    if (diff === 1) return 'вчера в ' + hm;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ' в ' + hm;
  }

  function ago(ts) {
    if (!ts) return 'ещё не проверялось';
    const m = Math.round((Date.now() - ts) / 60000);
    return m < 1 ? 'только что' : m < 60 ? `${m} мин назад` : `${Math.round(m / 60)} ч назад`;
  }

  // подробная причина скрытия (для «Почему нет?»)
  function hideDetail(it, search) {
    const sellers = loadSellers();
    if ((it.sellerKey && sellers[it.sellerKey]) || (it.sellerName && sellers['name:' + it.sellerName.toLowerCase()])) {
      return `продавец «${it.sellerName || it.sellerKey}» у вас в скрытых`;
    }
    const text = itemText(it);
    const g = findWord(text, loadGlobal());
    if (g) return `сработало общее стоп-слово «${g}»`;
    const own = findWord(text, (search && search.ban) || []);
    if (own) return `сработало стоп-слово поиска «${own}»`;
    if (insoleMismatch(it, search)) return 'в описании указана другая длина стельки';
    const sz = sizeMismatch(it, search);
    if (sz) return `не ваш размер (${sz}) — Авито подмешал его мимо фильтра`;
    if (brandMismatch(it, search)) return `бренд не совпадает с поиском (${it.params}) — Авито подмешал его мимо фильтра`;
    return null;
  }

  function whyMissing(redraw) {
    const raw = prompt('Ссылка на объявление или его номер (№ …):') || '';
    const m = raw.match(/(\d{8,12})(?!.*\d{8,12})/);
    if (!m) return;
    const id = m[1];
    const list = load(), byId = Object.fromEntries(list.map((x) => [x.id, x]));
    const feed = loadFeed(), skip = loadSkip();
    const name = (sid) => (byId[sid] ? `«${byId[sid].name}»` : 'удалённого поиска');
    let ans;
    if (feed[id]) {
      const it = feed[id], s = byId[it.sid];
      const hd = hideDetail(it, s);
      if (s && (it.seenAt || (s.seen || []).includes(id))) ans = `Оно было в ленте (поиск ${name(it.sid)}), но отмечено просмотренным — кнопкой «✓ Скрыть», «Всё просмотрено» или потому, что вы открывали этот поиск на сайте.`;
      else if (hd) ans = `Найдено поиском ${name(it.sid)}, но скрыто: ${hd}.`;
      else if (palVerdict(it, null, s)) ans = `Оно во вкладке «🇨🇳 Похоже на паль» (поиск ${name(it.sid)}). Причины: ${palVerdict(it, null, s).why.join('; ')}.`;
      else ans = `Оно есть в ленте (поиск ${name(it.sid)}) — во вкладке «Новые» или «Уже показывались».`;
    } else if (skip[id]) {
      const sk = skip[id];
      ans = `Поиск ${name(sk.sid)} видел его ${new Date(sk.t).toLocaleString('ru-RU')}, но дата публикации (${fmtWhen(sk.ts)}) была старше прошлой проверки этого поиска — значит, оно уже было в выдаче раньше.`;
    } else {
      const inSeen = list.filter((x) => (x.seen || []).includes(id));
      if (inSeen.length) ans = `Оно уже было в выдаче поиска ${inSeen.map((x) => '«' + x.name + '»').join(', ')} на момент первой проверки или раньше (либо отсеяно старой версией скрипта как «поднятое»).`;
      else ans = 'Ни один ваш поиск его не видел. Значит, оно не подходит под фильтры поиска (бренд, категория, размер, цена до 10 000 ₽, только с доставкой) — или проверка этого поиска до него ещё не дошла (нажмите «🔄 Проверить»).';
    }
    alert(`№ ${id}\n\n${ans}`);
    if (redraw) redraw();
  }

  // свежее — «12 мин назад»: по нему видно, успеете ли первым
  function fmtAge(ts) {
    const m = Math.floor((Date.now() - ts) / 60000);
    return m >= 0 && m < 60 ? (m < 1 ? 'только что' : `${m} мин назад`) : fmtWhen(ts);
  }

  let feedUi = null; // открытая лента: фоновая проверка показывает в ней найденное
  function openFeed(autoCheck = true) {
    closePanel();
    if (feedUi) feedUi.shut();
    document.getElementById('ams-feed')?.remove();
    const root = el('div'); root.id = 'ams-feed';
    const top = el('div', 'amf-top');
    const h = el('h2', null, '🆕 Новые объявления');
    h.title = 'Клавиши: J / K — следующее / предыдущее, O или Enter — открыть, X — скрыть, F — отложить';
    const refresh = el('button', 'ams-btn primary', '🔄 Проверить');
    const allSeen = el('button', 'ams-btn', '✓ Всё просмотрено');
    const close = el('button', 'ams-btn', '✕'); close.id = 'amf-close';
    const status = el('div', 'amf-status');
    const chips = el('div', 'amf-chips');
    // колесо мыши над строкой брендов листает её вбок
    chips.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { chips.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    const why = el('button', 'ams-btn', '🔍 Почему нет?');
    why.title = 'Вставьте ссылку или номер объявления — скрипт скажет, почему его нет в ленте';
    why.onclick = () => whyMissing(draw);
    const back = el('button', 'ams-btn', '⏪ Вернуть пропавшие');
    back.title = 'Перепроверить все поиски за последние часы и вернуть в ленту то, что потерялось';
    back.onclick = () => {
      if (feedRunning) { alert('Сейчас идёт проверка — дождитесь, пока закончится.'); return; }
      const raw = prompt('За сколько последних часов перепроверить все поиски?\n\n' +
        'Вернётся всё, что вы ещё не смотрели. То, что вы уже скрыли кнопкой «✓ Скрыть», не вернётся, ' +
        'то, что уже в ленте, не задвоится.', '14');
      const hrs = parseFloat(String(raw || '').replace(',', '.'));
      if (!(hrs > 0)) return;
      const { n, freed } = rewindSearches(Math.min(hrs, 72));
      if (!n && !freed) { alert('Нечего перепроверять — все поиски и так проверены не позже этого времени.'); return; }
      alert(freed
        ? `Нашёл ${freed} объявл., которые пропали, не будучи показанными. Сейчас перепроверю все поиски — они вернутся в «Новые».`
        : 'В журнале нет пропавших объявлений за это время. Всё равно перепроверю поиски — вернётся то, что ещё есть в выдаче.');
      run(0);
    };
    const optBtn = el('button', 'ams-btn', '⚙️'); optBtn.title = 'Настройки: уведомления, проверка в фоне, клавиши';
    optBtn.onclick = openFeedOpts;
    top.append(h, refresh, allSeen, why, back, optBtn, close, status, chips);
    const listEl = el('div', 'amf-list');
    root.append(top, listEl);
    document.body.append(root);
    document.body.style.overflow = 'hidden';

    let filterSid = null; // теперь это выбранный бренд (по самому объявлению), а не поиск
    const bKey = (it) => brandKey(brandOf(it) || '') || '?';
    let tab = 'new';
    const session = Date.now(); // всё, что показано в этом открытии ленты, остаётся «новым» до закрытия
    const viewed = new Set();
    const isNew = (it) => !it.shownAt || it.shownAt >= session;
    const tabs = el('div', 'amf-tabs');
    top.insertBefore(tabs, chips);
    // вкладки по типу вещей: одежда / обувь / аксессуары (с сумками)
    let cat = 'all';
    const catTabs = el('div', 'amf-cats');
    top.insertBefore(catTabs, chips);
    const CAT_OF = { 748: 'odezhda', 2804317: 'obuv', 749: 'aks', 2804316: 'aks' };
    const searchCat = {};
    const catOf = (it) => {
      if (!(it.sid in searchCat)) {
        const sr = loadRO().find((x) => x.id === it.sid);
        let c = 'other';
        try { const cc = avfParse(new URL(sr.url).searchParams.get('f')).singles.find(([k]) => k === 175); if (cc) c = CAT_OF[cc[1]] || 'other'; }
        catch { const n = (sr && sr.name) || ''; c = /^👕/u.test(n) ? 'odezhda' : /^👟|^👞/u.test(n) ? 'obuv' : /^🕶|^👜/u.test(n) ? 'aks' : 'other'; }
        searchCat[it.sid] = c;
      }
      return searchCat[it.sid];
    };

    // Отметки «показано» и «скрыто» копим и пишем пачкой: лента в хранилище весит мегабайты,
    // и раньше каждое нажатие «✓ Скрыть» переписывало её и перерисовывало все карточки заново.
    const shownQ = new Set(); let shownT = null;
    function markShown(ids) {
      if (!ids.length) return;
      ids.forEach((id) => shownQ.add(id));
      if (!shownT) shownT = setTimeout(flushShown, 1500);
    }
    function flushShown() {
      clearTimeout(shownT); shownT = null;
      if (!shownQ.size) return;
      const feed = loadFeed(), now = Date.now();
      let ch = false;
      shownQ.forEach((id) => { if (feed[id] && !feed[id].shownAt) { feed[id].shownAt = now; ch = true; } });
      shownQ.clear();
      if (ch) { saveFeed(feed); updateFabBadge(); }
    }
    const hideQ = new Set(); let hideT = null;
    function queueHide(ids) { ids.forEach((id) => hideQ.add(id)); clearTimeout(hideT); hideT = setTimeout(flushHide, 700); }
    function commitHides() {
      clearTimeout(hideT); hideT = null;
      if (!hideQ.size) return false;
      const ids = [...hideQ]; hideQ.clear();
      markSeen(ids);
      return true;
    }
    function flushHide() { if (commitHides() && root.isConnected) drawHead(compute()); }

    function onKey(e) { // J/K/O/X/F — разбирать ленту с клавиатуры
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || document.getElementById('ams-modal')) return;
      const tg = e.target || {};
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName || '') || tg.isContentEditable) return;
      const k = e.code;
      if (k === 'KeyJ' || k === 'KeyK') {
        e.preventDefault();
        if (k === 'KeyJ' && kbIdx >= drawnN - 2 && drawnN < curShown.length) appendCards(drawnN + PAGE_N);
        kbFocus(kbIdx < 0 ? 0 : kbIdx + (k === 'KeyJ' ? 1 : -1));
        return;
      }
      const it = kbIdx >= 0 ? curShown[kbIdx] : null;
      const card = it && cardEls.get(it.id);
      if (!card) return;
      if (k === 'KeyO' || (k === 'Enter' && tg.tagName !== 'BUTTON')) { e.preventDefault(); card.querySelector('.amf-title').click(); }
      else if (k === 'KeyX') { e.preventDefault(); card.querySelector('[data-act="hide"]')?.click(); }
      else if (k === 'KeyF') { e.preventDefault(); card.querySelector('[data-act="fav"]')?.click(); }
    }
    document.addEventListener('keydown', onKey);

    const shut = () => {
      commitHides(); flushShown();
      if (feedUi && feedUi.root === root) feedUi = null;
      document.removeEventListener('keydown', onKey);
      root.remove(); document.body.style.overflow = '';
      if (location.hash === '#novye') history.replaceState(null, '', location.pathname + location.search);
    };
    close.onclick = shut;

    const PAGE_N = 100;             // сколько карточек рисуем за раз — тысяча сразу тормозит
    let limitN = PAGE_N;
    let drawTimer = null, headTimer = null;
    // во время проверки обновляем не чаще раза в 3 с (раньше — после каждого поиска)
    const drawSoon = () => { if (!drawTimer) drawTimer = setTimeout(() => { drawTimer = null; liveUpdate(); }, 3000); };
    const headSoon = () => { clearTimeout(headTimer); headTimer = setTimeout(() => { if (root.isConnected) drawHead(compute()); }, 400); };
    const resetView = () => { limitN = PAGE_N; listEl.scrollTop = 0; };
    const sortBy = () => loadOpts().sort;

    // что показать: вкладка → тип вещей → бренд → сортировка
    function compute() {
      commitHides();
      const all = pendingItems();
      const palItems = all.filter((x) => x.pv);
      const normal = all.filter((x) => !x.pv);
      const fresh = normal.filter(isNew);
      const old = normal.filter((x) => !isNew(x));
      const favs = Object.values(loadFavRO()).sort((a, b) => b.favAt - a.favAt);
      const tabItems = tab === 'new' ? fresh : tab === 'old' ? old : tab === 'pal' ? palItems : favs;
      const byCat = { all: tabItems.length, odezhda: 0, obuv: 0, aks: 0 };
      tabItems.forEach((it) => { const c = catOf(it); if (c in byCat) byCat[c]++; });
      const items = cat === 'all' ? tabItems : tabItems.filter((it) => catOf(it) === cat);
      if (filterSid && !items.some((x) => bKey(x) === filterSid)) filterSid = null;
      // плашки — по брендам из объявлений (поиски теперь общие на 7 брендов), самые частые первыми, в одну строку
      const counts = new Map(), label = {};
      items.forEach((it) => { const k = bKey(it); counts.set(k, (counts.get(k) || 0) + 1); if (!label[k]) label[k] = brandOf(it) || 'Без бренда'; });
      let shown = filterSid ? items.filter((x) => bKey(x) === filterSid) : items;
      if (sortBy() === 'price') shown = [...shown].sort((a, b) => (a.price || 1e9) - (b.price || 1e9));
      return { n: { new: fresh.length, old: old.length, pal: palItems.length, fav: favs.length }, byCat, items, counts, label, shown };
    }

    function drawHead(c) {
      tabs.textContent = '';
      [['new', `🆕 Новые (${c.n.new})`, 'Появились с прошлого открытия ленты'],
       ['old', `👁 Уже показывались (${c.n.old})`, 'Лента их уже показывала, но вы их не скрыли'],
       ['pal', `🇨🇳 Похоже на паль (${c.n.pal})`, 'Магазины реплик: новое с биркой, много размеров, «люкс качество»… Не удалены — проверьте сами'],
       ['fav', `❤️ Отложенные (${c.n.fav})`, 'Вещи, отложенные кнопкой 🤍: не пропадут, пока не уберёте сами. Если вещь снова попадётся в поиске, цена обновится']]
        .forEach(([key, label, hint]) => {
          const b = el('button', 'amf-tab' + (tab === key ? ' on' : ''), label); b.title = hint;
          b.onclick = () => { tab = key; filterSid = null; resetView(); draw(); };
          tabs.append(b);
        });
      catTabs.textContent = '';
      [['all', 'Всё'], ['odezhda', '👕 Одежда'], ['obuv', '👟 Обувь'], ['aks', '🕶 Аксессуары']].forEach(([key, label]) => {
        const b = el('button', 'amf-cat' + (cat === key ? ' on' : ''), `${label} (${c.byCat[key]})`);
        b.onclick = () => { cat = key; filterSid = null; resetView(); draw(); };
        catTabs.append(b);
      });
      const sb = el('button', 'amf-cat amf-sort', sortBy() === 'price' ? '↕ Сначала дешёвые' : '↕ Сначала свежие');
      sb.title = 'Сортировка: по дате или по цене';
      sb.onclick = () => { saveOpt('sort', sortBy() === 'price' ? 'date' : 'price'); resetView(); draw(); };
      catTabs.append(sb);
      chips.textContent = '';
      const mkChip = (label, sid) => {
        const ch = el('button', 'amf-chip' + (filterSid === sid ? ' on' : ''), label);
        ch.onclick = () => { filterSid = sid; resetView(); draw(); };
        chips.append(ch);
      };
      if (c.items.length) {
        mkChip(`Все (${c.items.length})`, null);
        [...c.counts].sort((a, b) => b[1] - a[1] || c.label[a[0]].localeCompare(c.label[b[0]])).forEach(([k, n]) => mkChip(`${c.label[k]} (${n})`, k));
      }
      allSeen.style.display = tab === 'fav' ? 'none' : '';
    }

    let curShown = [], drawnN = 0, moreBtn = null, pill = null, kbIdx = -1;
    const cardEls = new Map(); // id → карточка на экране
    function drawList(c) {
      const keepScroll = listEl.scrollTop;
      pill?.remove(); pill = null;
      listEl.textContent = '';
      cardEls.clear(); curShown = []; drawnN = 0; moreBtn = null; kbIdx = -1;
      if (tab === 'pal') listEl.append(palBox(c.shown));
      if (!c.shown.length) {
        listEl.append(el('div', 'amf-empty', !loadRO().length
          ? 'Сначала сохраните поиски: ⭐ → «+ Сохранить этот».'
          : tab === 'fav' ? 'Отложенных нет. Нажмите «🤍 Отложить» у объявления — оно сохранится здесь, даже когда уйдёт из ленты.'
          : feedRunning ? 'Ищу новые…'
          : tab === 'pal' ? (palOn() ? 'Подозрительных объявлений нет 👌' : 'Фильтр пали выключен — всё показывается в обычных вкладках.')
          : tab === 'new' ? 'Новых объявлений нет 👌' + (c.n.old ? ' Загляните во вкладку «Уже показывались».' : '')
          : 'Здесь пусто — всё, что лента показывала, вы уже разобрали.'));
        return;
      }
      curShown = c.shown;
      appendCards(limitN);
      listEl.scrollTop = keepScroll;
    }
    function draw() {
      if (drawTimer) { clearTimeout(drawTimer); drawTimer = null; }
      const c = compute();
      drawHead(c); drawList(c);
    }
    // найдено новое: если вы листаете ленту — не сдвигаем её, а показываем кнопку «⬆ Новых: N»
    function liveUpdate() {
      if (drawTimer) { clearTimeout(drawTimer); drawTimer = null; }
      if (!root.isConnected) return;
      if (!curShown.length || listEl.scrollTop < 60) { draw(); return; }
      const c = compute();
      drawHead(c);
      const have = new Set(curShown.map((x) => x.id));
      const add = c.shown.filter((x) => !have.has(x.id)).length;
      if (!add) return;
      if (!pill) { pill = el('button', 'amf-pill'); pill.onclick = () => { resetView(); draw(); }; root.append(pill); }
      pill.textContent = `⬆ Новых: ${add} — показать`;
    }

    // дорисовываем следующие карточки в конец (без перерисовки всего списка)
    function appendCards(upTo) {
      const page = curShown.slice(drawnN, upTo);
      drawnN += page.length; limitN = Math.max(limitN, drawnN);
      if (tab === 'new') markShown(page.filter((x) => !x.shownAt).map((x) => x.id)); // «показанными» считаем только нарисованные
      const favs = loadFavRO();
      const frag = document.createDocumentFragment();
      for (const it of page) frag.append(makeCard(it, favs));
      moreBtn?.remove(); moreBtn = null;
      listEl.append(frag);
      renderMore();
    }
    function renderMore() {
      moreBtn?.remove(); moreBtn = null;
      const left = curShown.length - drawnN;
      if (left > 0) {
        moreBtn = el('button', 'ams-btn primary', `Показать ещё ${Math.min(PAGE_N, left)} (осталось ${left})`);
        moreBtn.style.cssText = 'grid-column:1/-1;justify-self:center;margin:6px 0 20px;padding:10px 18px';
        moreBtn.onclick = () => appendCards(drawnN + PAGE_N);
        listEl.append(moreBtn);
      }
    }
    // убрать карточки с экрана на месте, без перерисовки всей ленты
    function dropCards(pred) {
      const keep = []; let drawn = 0;
      curShown.forEach((x, i) => {
        if (pred(x)) { cardEls.get(x.id)?.remove(); cardEls.delete(x.id); }
        else { keep.push(x); if (i < drawnN) drawn++; }
      });
      curShown = keep; drawnN = drawn;
      if (!curShown.length) { draw(); return; }
      renderMore();
      if (kbIdx >= 0) kbFocus(Math.min(kbIdx, drawnN - 1), false);
    }
    function kbFocus(i, scroll = true) {
      listEl.querySelector('.amf-card.kb')?.classList.remove('kb');
      if (!drawnN) { kbIdx = -1; return; }
      kbIdx = Math.max(0, Math.min(i, drawnN - 1));
      const card = cardEls.get(curShown[kbIdx].id);
      if (!card) return;
      card.classList.add('kb');
      if (scroll) card.scrollIntoView({ block: 'nearest' });
    }
    let toastT = null;
    function feedToast(text, undo) {
      root.querySelector('.amf-toast')?.remove(); clearTimeout(toastT);
      const t = el('div', 'amf-toast'); t.append(el('span', null, text));
      if (undo) { const b = el('button', null, 'Отменить'); b.onclick = () => { t.remove(); undo(); }; t.append(b); }
      root.append(t);
      toastT = setTimeout(() => t.remove(), 6000);
    }
    function hideItem(it) {
      queueHide([it.id]);
      dropCards((x) => x.id === it.id);
      feedToast('Скрыто', () => { if (!hideQ.delete(it.id)) markSeen([it.id], true); draw(); });
    }

    function makeCard(it, favs) {
      const card = el('div', 'amf-card' + (viewed.has(it.id) ? ' viewed' : ''));
      cardEls.set(it.id, card);
      const open = () => { window.open(it.url, '_blank'); viewed.add(it.id); card.classList.add('viewed'); };
      const img = el('img', 'amf-img'); img.src = it.img; img.loading = 'lazy'; img.decoding = 'async'; img.onclick = open;
      const body = el('div', 'amf-body');
      const t = el('div', 'amf-title', it.title); t.onclick = open;
      const pr = el('div', 'amf-price', fmtPrice(it.price));
      if (it.oldPrice && it.price && it.oldPrice !== it.price) {
        pr.append(el('span', 'amf-old', `${it.oldPrice > it.price ? '📉' : '📈'} было ${fmtPrice(it.oldPrice)}`));
      }
      body.append(t, pr,
        el('div', 'amf-meta', [it.ts ? '🕒 ' + fmtAge(it.ts) : '', it.bumped ? '♻️ перевыложено' : '', it.city, it.sellerName, it.sname ? '🔎 ' + it.sname : ''].filter(Boolean).join(' · ')));
      if (it.params) body.append(el('div', 'amf-meta', '🏷 ' + it.params));
      if (it.favAt && tab === 'fav') body.append(el('div', 'amf-meta', '❤️ отложено ' + fmtWhen(it.favAt) + (it.priceAt ? ' · цена обновлена ' + fmtWhen(it.priceAt) : '')));
      if (it.pv) body.append(el('div', 'amf-pal', '🇨🇳 ' + it.pv.why.join(' · ')));
      const dsc = it.desc || (it.fullDesc || '').slice(0, 300);
      if (dsc) body.append(el('div', 'amf-desc', dsc));
      const act = el('div', 'amf-actions');
      const bOpen = el('button', null, '🔗 Открыть'); bOpen.onclick = open;
      act.append(bOpen);
      if (tab === 'fav') {
        const bUn = el('button', null, '💔 Убрать'); bUn.title = 'Убрать из отложенных';
        bUn.onclick = () => {
          toggleFav(it); dropCards((x) => x.id === it.id); headSoon();
          feedToast('Убрано из отложенных', () => { toggleFav(it); draw(); });
        };
        act.append(bUn);
      } else {
        const bSeen = el('button', null, '✓ Скрыть'); bSeen.title = 'Убрать из ленты (X)'; bSeen.dataset.act = 'hide';
        bSeen.onclick = () => hideItem(it);
        const isFav = !!favs[it.id];
        const bFav = el('button', isFav ? 'on' : null, isFav ? '❤️ Отложено' : '🤍 Отложить'); bFav.dataset.act = 'fav';
        bFav.title = 'Сохранить во вкладку «❤️ Отложенные» — не пропадёт из ленты (F)';
        bFav.onclick = () => {
          const on = toggleFav(it);
          bFav.textContent = on ? '❤️ Отложено' : '🤍 Отложить'; bFav.classList.toggle('on', on);
          headSoon();
        };
        act.append(bSeen, bFav);
        if (it.sellerKey) {
          const bSel = el('button', null, '🚫 Продавец');
          bSel.title = 'Скрыть все объявления этого продавца';
          bSel.onclick = () => {
            if (!confirm(`Скрыть все объявления продавца «${it.sellerName || it.sellerKey}»?`)) return;
            const sl = loadSellers(); sl[it.sellerKey] = it.sellerName || it.sellerKey;
            GM_setValue('blockedSellers', JSON.stringify(sl));
            dropCards((x) => x.sellerKey === it.sellerKey); updateFabBadge(); headSoon();
            feedToast(`Продавец «${it.sellerName || it.sellerKey}» скрыт`, () => {
              const s2 = loadSellers(); delete s2[it.sellerKey]; GM_setValue('blockedSellers', JSON.stringify(s2)); updateFabBadge(); draw();
            });
          };
          act.append(bSel);
        }
        if (it.pv) {
          const bOk = el('button', null, '✅ Не паль');
          bOk.title = it.sellerKey ? 'Больше не считать паленым этого продавца' : 'Вернуть объявление в обычную ленту';
          bOk.onclick = () => {
            const ok = loadPalOk(); ok[it.sellerKey || 'id:' + it.id] = it.sellerName || it.title;
            GM_setValue('palOk', JSON.stringify(ok));
            dropCards((x) => (it.sellerKey ? x.sellerKey === it.sellerKey : x.id === it.id)); updateFabBadge(); headSoon();
          };
          act.append(bOk);
        }
      }
      body.append(act);
      card.append(img, body);
      return card;
    }
    // долистали почти до конца — подгружаем следующие сами (на телефоне кнопку внизу бывает не достать)
    listEl.addEventListener('scroll', () => {
      if (drawnN < curShown.length && listEl.scrollTop + listEl.clientHeight > listEl.scrollHeight - 1500) appendCards(drawnN + PAGE_N);
      if (pill && listEl.scrollTop < 10) draw(); // вернулись наверх — показываем новые
    }, { passive: true });

    // пояснение и массовые действия на вкладке «Похоже на паль»
    function palBox(items) {
      const box = el('div', 'amf-palbox');
      box.append(el('span', null, palOn()
        ? 'Сюда скрипт убирает объявления, похожие на паль: у каждого написано, почему. Ничего не удалено — нормального продавца верните кнопкой «✅ Не паль», он больше не попадёт сюда.'
        : 'Фильтр пали выключен.'));
      const keys = [...new Map(items.filter((x) => x.sellerKey).map((x) => [x.sellerKey, x.sellerName || x.sellerKey])).entries()];
      if (palOn() && keys.length) {
        const bAll = el('button', null, `🚫 Скрыть всех продавцов отсюда (${keys.length})`);
        bAll.onclick = () => {
          const names = keys.slice(0, 12).map(([, n]) => n).join(', ') + (keys.length > 12 ? ` и ещё ${keys.length - 12}` : '');
          if (!confirm(`Скрыть навсегда ${keys.length} продавцов?\n\n${names}\n\nВернуть можно в 🚫 → список скрытых.`)) return;
          const sl = loadSellers(); keys.forEach(([k, n]) => { sl[k] = n; });
          GM_setValue('blockedSellers', JSON.stringify(sl));
          markSeen(items.filter((x) => !x.sellerKey).map((x) => x.id));
          updateFabBadge(); draw();
        };
        box.append(bAll);
      }
      box.append(el('span', null, descStatus()));
      const bTog = el('button', null, palOn() ? 'Выключить фильтр' : 'Включить фильтр пали');
      bTog.onclick = () => { GM_setValue('palOff', palOn() ? '1' : ''); updateFabBadge(); draw(); };
      box.append(bTog);
      return box;
    }

    function setStatus(text) {
      status.textContent = text || `Последняя проверка: ${ago(loadMeta().lastCheck)}`;
      if (text) return; // во время проверки — только строка прогресса, без разбора всех поисков
      const gone = loadRO().filter((x) => x.warn === 'notfound');
      if (gone.length) {
        const w = el('div', null, `⚠️ Эти поиски не открываются на Авито («страницы не существует»): ` +
          `${gone.slice(0, 5).map((x) => '«' + x.name + '»').join(', ')}${gone.length > 5 ? ` и ещё ${gone.length - 5}` : ''}.`);
        w.style.cssText = 'color:#d32f2f;margin-top:4px';
        status.append(w);
      }
      const bad = loadRO().filter((x) => x.warn === 'region');
      if (bad.length) {
        const w = el('div', null, `⚠️ В выбранном регионе нет объявлений — Авито показывает случайные из других городов, ` +
          `их нельзя отслеживать по дате. Поставьте «Все регионы» в поисках: ${bad.map((x) => '«' + x.name + '»').join(', ')} ` +
          `(откройте поиск, смените регион и нажмите 🔄 у поиска в ⭐).`);
        w.style.cssText = 'color:#b26a00;margin-top:4px';
        status.append(w);
      }
    }

    async function run(limit = 0) {
      refresh.disabled = true; refresh.textContent = '⏳ Проверяю…';
      const p = checkAll(setStatus, drawSoon, typeof limit === 'number' ? limit : 0);
      if (!curShown.length) draw(); // пустая лента — пишем «Ищу новые…»
      const r = await p;
      refresh.disabled = false; refresh.textContent = '🔄 Проверить';
      if (!r) { setStatus('Проверка уже идёт — найденное появится само.'); return; }
      setStatus(r.problem ? '⚠️ ' + r.problem : r.busy ? 'Проверка уже идёт в другой вкладке' : null);
      liveUpdate();
      descRun(); // описания новых — для детектора пали
    }
    refresh.onclick = () => run(0);
    allSeen.onclick = () => {
      const items = compute().shown;
      if (!items.length) return;
      if (!confirm(`Отметить просмотренными ${items.length} объявл.?`)) return;
      const ids = items.map((x) => x.id);
      markSeen(ids); draw();
      feedToast(`Отмечено: ${ids.length}`, () => { markSeen(ids, true); draw(); });
    };
    feedUi = {
      root, shut,
      partial: drawSoon,
      done: (r) => { if (!refresh.disabled) setStatus(r && r.problem ? '⚠️ ' + r.problem : null); liveUpdate(); },
      show: () => liveUpdate(),
    };
    setStatus(); draw();
    // если давно не проверяли — проверяем сразу
    if (autoCheck && Date.now() - (loadMeta().lastCheck || 0) > 2 * 60000) run(40);
  }

  // ---------------- фильтры Авито (параметр f и код в адресе) ----------------
  // Формат: заголовок 01 28 01, флаги, одиночные параметры (0x44), множественные (0x40), цена-JSON (0x45).
  // Все номера в нём удвоены. Проверено на ваших ссылках: кодирование совпадает побайтно.
  const P_CAT = 175, P_BRAND = 115634, P_SIZE = 115539, P_SHOE = 115164, P_PRICE = 100003;
  const STD = {
    sizes: [1364251, 1364252, 1364253, 1364254],   // 42 (XS), 44 (XS/S), 46 (S), 48 (M)
    shoes: [1211561, 1211563, 1211565],
    price: { from: 0, to: 10000 },
  };
  const CATS = [
    { id: 748, slug: 'muzhskaya_odezhda', label: 'одежда', icon: '👕', size: P_SIZE, sizes: () => STD.sizes },
    { id: 2804317, slug: 'obuv_muzhskaya', label: 'обувь', icon: '👟', size: P_SHOE, sizes: () => STD.shoes },
  ];
  const avfB64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '~').replace(/\//g, '_').replace(/=+$/, '');
  const avfUnB64 = (s) => Uint8Array.from(atob(s.replace(/~/g, '+').replace(/_/g, '/').replace(/-/g, '=')), (c) => c.charCodeAt(0));
  const varint = (n) => { const o = []; do { let b = n % 128; n = Math.floor(n / 128); if (n) b |= 128; o.push(b); } while (n); return o; };
  function readVarint(b, i) { let n = 0, mul = 1, x; do { x = b[i++]; n += (x & 127) * mul; mul *= 128; } while (x & 128); return [n, i]; }

  function avfParse(code) {
    const b = avfUnB64(code); let i = 6;
    if (b[0] !== 1 || b[1] !== 0x28) throw new Error('не фильтр Авито');
    const hasMulti = b[3] === 1, hasJson = b[4] === 1;
    const singles = [], multi = []; let json = null;
    const n = b[i++]; if (b[i++] !== 0x44) throw new Error('формат');
    for (let k = 0; k < n; k++) { let p, v; [p, i] = readVarint(b, i); [v, i] = readVarint(b, i); singles.push([p / 2, v / 2]); }
    if (hasMulti) {
      const m = b[i++]; if (b[i++] !== 0x40) throw new Error('формат');
      for (let k = 0; k < m; k++) {
        let p, c; [p, i] = readVarint(b, i); [c, i] = readVarint(b, i);
        const vals = []; for (let t = 0; t < (c - 4) / 16; t++) { let v; [v, i] = readVarint(b, i); vals.push(v / 2); }
        multi.push([p / 2, vals]);
      }
    }
    if (hasJson) {
      i += 2; let p, len; [p, i] = readVarint(b, i); [len, i] = readVarint(b, i);
      json = [p / 2, JSON.parse(new TextDecoder().decode(b.slice(i, i + len)))];
    }
    return { singles, multi, json };
  }

  function avfEncode({ singles = [], multi = [], json = null, jsons = null }) {
    const js = jsons || (json ? [json] : []);
    const out = [1, 0x28, 1, multi.length ? 1 : 2, js.length ? 1 : 2, 2];
    const s = [...singles].sort((a, b) => a[0] - b[0]);
    out.push(s.length, 0x44); for (const [p, v] of s) out.push(...varint(p * 2), ...varint(v * 2));
    if (multi.length) {
      const m = [...multi].sort((a, b) => a[0] - b[0]); out.push(m.length, 0x40);
      for (const [p, vals] of m) { out.push(...varint(p * 2), ...varint(vals.length * 16 + 4)); vals.forEach((v) => out.push(...varint(v * 2))); }
    }
    if (js.length) {
      out.push(js.length, 0x45);
      for (const [p, val] of [...js].sort((a, b) => a[0] - b[0])) {
        const bytes = new TextEncoder().encode(JSON.stringify(val));
        out.push(...varint(p * 2), ...varint(bytes.length), ...bytes);
      }
    }
    return avfB64(out);
  }

  function makeBrandUrl(cat, brandIds, slug) {
    const singles = [[P_CAT, cat.id]];
    const multi = [[cat.size, cat.sizes()]];
    let path = cat.slug;
    if (brandIds.length === 1 && slug) { singles.push([P_BRAND, brandIds[0]]); path += '/' + slug; }
    else multi.push([P_BRAND, brandIds]);
    const pathCode = avfEncode({ singles });
    const f = avfEncode({ singles, multi, json: [P_PRICE, STD.price] });
    return `https://www.avito.ru/all/odezhda_obuv_aksessuary/${path}-${pathCode}?d=1&f=${f}&s=104`;
  }

  // бренд(ы), выбранные в фильтре на открытой странице
  function brandsOnPage() {
    const u = new URL(location.href);
    const segs = u.pathname.split('/').filter(Boolean);
    const last = segs[segs.length - 1] || '';
    const codes = [u.searchParams.get('f'), last.includes('-') ? last.split('-').pop() : null].filter(Boolean);
    const ids = new Set();
    for (const c of codes) {
      try {
        const p = avfParse(c);
        p.singles.filter(([k]) => k === P_BRAND).forEach(([, v]) => ids.add(v));
        (p.multi.find(([k]) => k === P_BRAND) || [0, []])[1].forEach((v) => ids.add(v));
      } catch { /* не фильтр */ }
    }
    // слаг бренда в адресе: …/muzhskaya_odezhda/gucci-ASgB…
    const slug = ids.size === 1 && segs.length >= 4 && last.includes('-') ? last.slice(0, last.lastIndexOf('-')) : null;
    return { ids: [...ids], slug };
  }

  function guessBrandName() {
    const h1 = document.querySelector('h1')?.textContent || '';
    const m = h1.match(/бренда\s+(.+?)(?:\s+в\s+|\s*$)/i);
    if (m) return m[1].trim();
    const checked = [...document.querySelectorAll('input[type="checkbox"]:checked')]
      .map((x) => x.getAttribute('name') || '').filter((n) => n && !/\d|Новое|Отличное|Хорошее/.test(n));
    return checked[0] || '';
  }

  function addBrandFromPage() {
    const { ids, slug } = brandsOnPage();
    if (!ids.length) {
      alert('На этой странице не выбран бренд.\n\nОткройте на Авито мужскую одежду или обувь, поставьте галочку ' +
        'нужного бренда в фильтре «Бренд» слева (можно несколько, например Hugo и Boss), дождитесь обновления ' +
        'страницы и нажмите кнопку снова.');
      return;
    }
    const name = (prompt(`Найден бренд (код${ids.length > 1 ? 'ы' : ''}: ${ids.join(', ')}). Как назвать?`, guessBrandName()) || '').trim();
    if (!name) return;
    const list = load();
    let added = 0, replaced = 0;
    CATS.forEach((cat, i) => {
      const title = `${cat.icon} ${name} — ${cat.label}`;
      const url = makeBrandUrl(cat, ids, slug);
      const same = list.find((x) => x.name.replace(/\s*🆕$/, '') === title);
      if (same) { // например, был поиском по названию — заменяем на точный фильтр
        Object.assign(same, { name: title, url, seen: [], lastTs: 0, maxId: 0, warn: '' });
        replaced++;
      } else if (!list.some((x) => fingerprint(x.url) === fingerprint(url))) {
        list.push({ id: Date.now() + i, name: title, url, ban: [], seen: [], lastVisit: 0 });
        added++;
      }
    });
    save(list);
    render();
    alert(`Готово: «${name}» — одежда (XS–M) и обувь, до 10 000 ₽, вся Россия, с доставкой.\n` +
      `Добавлено поисков: ${added}${replaced ? `, заменено старых (по названию): ${replaced}` : ''}.`);
  }

  // ---------------- резервные копии (живут в хранилище сайта, а не скрипта) ----------------
  // Если скрипт удалить и поставить заново, его хранилище пустое — а копии в localStorage avito.ru остаются.
  const BK_KEY = 'ams-backups', BK_MAX = 15, BK_FEED_N = 100, BK_SEEN_N = 60;
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const strHash = (str) => { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return h; };

  function fullState() {
    const searches = loadRO().map((x) => ({ ...x, seen: (x.seen || []).slice(0, BK_SEEN_N) }));
    const feed = loadFeedRO();
    const lastFeed = Object.fromEntries(Object.entries(feed).sort((a, b) => b[1].found - a[1].found).slice(0, BK_FEED_N));
    return { kind: 'ams-local', searches, global: loadGlobal(), sellers: loadSellers(), palOk: loadPalOk(), feed: lastFeed, feedMeta: loadMeta(), favs: loadFavRO() };
  }

  let bkBusy = false;
  async function backupTick(force = false) {
    if (bkBusy) return; bkBusy = true;
    try {
      const st = fullState();
      if (!st.searches.length && !Object.keys(st.sellers).length) return; // пустое состояние копией не считаем
      // сравниваем без служебных отметок, чтобы не плодить копии от каждой проверки
      const shape = JSON.stringify([st.searches.map((x) => [x.name, x.url, x.ban]), st.global, Object.keys(st.sellers).length, Object.keys(st.palOk || {}).length]);
      const h = strHash(shape);
      const list = lsGet(BK_KEY, []);
      if (!force && list[0] && list[0].h === h) {
        // поиски те же — тихо обновляем последнюю копию (отметки «просмотрено», лента)
        if (Date.now() - list[0].t > 10 * 60000) { list[0].code = await encode(st); list[0].t = Date.now(); lsSet(BK_KEY, list); }
        return;
      }
      const entry = { t: Date.now(), h, n: st.searches.length, w: st.global.length, s: Object.keys(st.sellers).length,
        f: Object.keys(st.feed).length, code: await encode(st) };
      // частые правки подряд схлопываем, но копию «до» большой потери поисков сохраняем всегда
      if (list[0] && entry.t - list[0].t < 10 * 60000 && entry.n >= list[0].n * 0.7) list.shift();
      list.unshift(entry);
      while (list.length > BK_MAX) list.pop();
      while (!lsSet(BK_KEY, list) && list.length > 1) list.pop(); // не влезло — выкидываем самые старые
    } finally { bkBusy = false; }
  }

  function applyState(st, label) {
    GM_setValue(KEY, JSON.stringify(st.searches || []));
    saveGlobal(st.global || []);
    GM_setValue('blockedSellers', JSON.stringify(st.sellers || {}));
    if (st.palOk) GM_setValue('palOk', JSON.stringify(st.palOk));
    if (st.favs) saveFavs(st.favs);
    saveFeed(st.feed || {}); saveMeta(st.feedMeta || {});
    alert(`${label}: поисков ${(st.searches || []).length}, скрытых продавцов ${Object.keys(st.sellers || {}).length}, ` +
      `объявлений в ленте ${Object.keys(st.feed || {}).length}.\nСтраница обновится.`);
    location.reload();
  }

  async function restoreBackup(entry) {
    const st = await decode(entry.code);
    if (!st || st.kind !== 'ams-local') { alert('Копия повреждена'); return; }
    applyState(st, 'Восстановлено');
  }

  function openBackups() {
    const list = lsGet(BK_KEY, []);
    modal('🗂 Резервные копии', (box, close) => {
      box.append(el('div', null, list.length
        ? 'Скрипт сам сохраняет копию, когда что-то меняется (последние 15). Копии лежат в хранилище сайта avito.ru и переживают переустановку скрипта.'
        : 'Копий пока нет — первая появится через минуту.'));
      const ul = el('div'); ul.style.cssText = 'max-height:50vh;overflow:auto;margin-top:8px';
      for (const e of list) {
        const row = el('div'); row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 0;border-top:1px solid #eee;flex-wrap:wrap';
        const info = el('div', null, `${new Date(e.t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} — ` +
          `поисков ${e.n}, стоп-слов ${e.w}, продавцов ${e.s}`);
        info.style.flex = '1';
        const r = el('button', 'ams-btn', 'Восстановить');
        r.onclick = () => { if (confirm('Заменить текущие поиски, стоп-слова и продавцов этой копией?')) { close(); restoreBackup(e); } };
        const f = el('button', 'ams-btn', '💾'); f.title = 'Сохранить файлом';
        f.onclick = () => downloadText(e.code, `avito-kopiya-${new Date(e.t).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.txt`);
        row.append(info, r, f); ul.append(row);
      }
      const now = el('button', 'ams-btn primary', 'Сделать копию сейчас');
      now.style.marginTop = '10px';
      now.onclick = async () => { await backupTick(true); close(); openBackups(); };
      box.append(ul, now);
    });
  }

  // пустой скрипт + есть копия → предлагаем восстановить (один раз за сеанс)
  setTimeout(async () => {
    const list = lsGet(BK_KEY, []);
    if (load().length || !list.length || sessionStorage.getItem('ams-no-restore')) { backupTick(); return; }
    const e = list[0];
    if (confirm(`⭐ Мои поиски: список пуст, но есть резервная копия от ${new Date(e.t).toLocaleString('ru-RU')} ` +
      `(поисков ${e.n}, скрытых продавцов ${e.s}). Восстановить?`)) restoreBackup(e);
    else sessionStorage.setItem('ams-no-restore', '1');
  }, 2500);
  setInterval(() => backupTick(), 60000);

  // ---------------- сборщик поисков по рецепту ----------------
  // Коды фильтров узнаём прямо на страницах Авито: в каждой странице есть описание фильтров
  // ({"id":"params[N]","attrId":N,"defaultTitle":"Размер","values":[{name,value}…]})
  // и параметры текущего поиска ("page":1,"params":{…}). После сборки проверяем по одному поиску
  // каждого вида: открываем его и сравниваем, как Авито понял фильтры.
  const ROOT = '/all/odezhda_obuv_aksessuary/';
  const KIND = {
    odezhda: { id: 748, slug: 'muzhskaya_odezhda', icon: '👕', label: 'одежда' },
    obuv: { id: 2804317, slug: 'obuv_muzhskaya', icon: '👟', label: 'обувь' },
    aksessuary: { id: 749, slug: 'kupit-aksessuary', icon: '🕶', label: 'Аксессуары' }, // адрес раздела у Авито — kupit-aksessuary-…
    sumki: { id: 2804316, slug: 'sumki_ryukzaki_i_chemodany', icon: '👜', label: 'Сумки' },
  };

  // путь категории с кодом — без кода Авито отвечает «Такой страницы не существует»
  const catPath = (kindKey) => `${ROOT}${KIND[kindKey].slug}-${avfEncode({ singles: [[P_CAT, KIND[kindKey].id]] })}`;
  const NOT_FOUND = /Такой страницы не существует/;

  async function getPage(pathAndQuery) {
    await sleep(window.__sleepFast ? 5 : 1200 + Math.random() * 800);
    const res = await fetch(location.origin + pathAndQuery, { credentials: 'include' });
    const html = await res.text();
    if (!/"params"/.test(html) && (res.status === 429 || res.status === 403 || /captcha|Доступ ограничен|firewall/i.test(html.slice(0, 30000)))) {
      throw new Error('Авито попросил паузу (защита от частых запросов). Подождите пару минут и загрузите файл снова.');
    }
    if (res.status === 404 || NOT_FOUND.test(html.slice(0, 200000)) && !/"params"/.test(html)) {
      const e = new Error('страница не существует (404): ' + pathAndQuery.split('?')[0]); e.notFound = true; throw e;
    }
    return html;
  }

  function pageFilters(html) {
    const out = [], seenIds = new Set();
    const re = /\{"id":"params\[(\d+)\]"/g;
    let m;
    while ((m = re.exec(html))) {
      const end = spanAt(html, m.index);
      if (end < 0) break;
      try {
        const o = JSON.parse(html.slice(m.index, end));
        if (!seenIds.has(o.attrId)) { seenIds.add(o.attrId); out.push(o); }
      } catch { /* пропускаем */ }
      re.lastIndex = end;
    }
    return out;
  }

  function searchEcho(html) {
    let params = null;
    const m = /"page":\d+,"params":\{/.exec(html);
    if (m) {
      const st = m.index + m[0].length - 1, end = spanAt(html, st);
      try { params = JSON.parse(html.slice(st, end)); } catch { params = null; }
    }
    const pm = html.match(/"priceMax":(\d+|null)/);
    const dl = html.match(/"withDeliveryOnly":(\d+|null)/);
    return { params, priceMax: pm ? (pm[1] === 'null' ? null : +pm[1]) : undefined, delivery: dl ? dl[1] === '1' : undefined };
  }
  const asIds = (v) => (v == null ? [] : [].concat(v).map(Number));

  async function runBuilder(recipe) {
    let logBox, okBtn;
    modal('🛠 Собираю поиски', (box, close) => {
      logBox = el('div');
      logBox.style.cssText = 'max-height:55vh;overflow:auto;font-size:13px;line-height:1.5;white-space:pre-wrap';
      okBtn = el('button', 'ams-btn primary', 'Подождите…'); okBtn.disabled = true; okBtn.style.marginTop = '10px';
      okBtn.onclick = () => { close(); location.reload(); };
      box.append(logBox, okBtn);
    });
    const say = (t, color) => { const d = el('div', null, t); if (color) d.style.color = color; logBox.append(d); logBox.scrollTop = 1e9; };
    const warns = [];
    const warn = (t) => { warns.push(t); say('⚠️ ' + t, '#b26a00'); };

    try {
      const price = [P_PRICE, { from: 0, to: recipe.price }];

      // 1) фильтры обуви: размеры, стелька, вид обуви
      say('Открываю мужскую обувь — ищу коды размеров, стельки и видов обуви…');
      const shoesHtml = await getPage(catPath('obuv') + '?d=1&s=104');
      const shoeDefs = pageFilters(shoesHtml);
      const diag = [];   // страницы, которые сборщик не понял — для разработчика
      const sizeDef = shoeDefs.find((d) => /^размер$/i.test((d.defaultTitle || '').trim()))
        || shoeDefs.find((d) => /размер/i.test(d.defaultTitle || '') && !/стельк/i.test(d.defaultTitle || ''));
      let shoeSize = null;
      if (sizeDef) {
        const ids = recipe.shoeSizeNames.map((n) => (sizeDef.values || [])
          .find((v) => new RegExp('^' + n + '(?!\\d|[.,]\\d)').test(String(v.name).trim()))).filter(Boolean);
        if (ids.length) {
          shoeSize = [sizeDef.attrId, ids.map((v) => +v.value)];
          say(`✓ Размеры обуви: ${ids.map((v) => v.name).join(', ')}`);
        }
        if (ids.length < recipe.shoeSizeNames.length) warn(`Нашёл не все размеры обуви (${ids.map((v) => v.name).join(', ') || 'ни одного'}).`);
      } else warn('Не нашёл фильтр «Размер» у обуви — обувь будет без размеров.');

      let insoleMulti = null, insoleRange = null;
      const insDef = shoeDefs.find((d) => /стельк/i.test(d.defaultTitle || ''));
      if (insDef && (insDef.values || []).length) {
        const v = insDef.values.filter((x) => new RegExp('(^|[^\\d.,])' + recipe.insoleName + '([.,]0)?(?!\\d|[.,]\\d)').test(String(x.name)));
        if (v.length) { insoleMulti = [insDef.attrId, v.map((x) => +x.value)]; say(`✓ Стелька: ${v.map((x) => x.name).join(', ')}`); }
        else warn(`В фильтре «${insDef.defaultTitle}» нет значения ${recipe.insoleName} см — обувь будет без стельки.`);
      } else if (insDef) {
        insoleRange = [insDef.attrId, { from: +recipe.insoleName, to: +recipe.insoleName }];
        say(`✓ Стелька: диапазон ${recipe.insoleName}–${recipe.insoleName} см (проверю ниже)`);
      } else {
        // у Авито нет такого фильтра — отсеиваем в ленте по тексту, если в объявлении явно указана другая стелька
        GM_setValue('insoleCm', String(recipe.insoleName));
        say(`✓ Стелька: фильтра на Авито нет — в ленте скрою обувь, где в тексте указана стелька не ${recipe.insoleName} см`);
      }

      // виды обуви — подразделы категории (…/obuv_muzhskaya/tufli-<код>), параметр 118631. Берём только классику.
      const TYPE_PARAM = recipe.classicFallback[0];
      const CLASSIC_SLUGS = recipe.classicSlugs || ['botinki_i_polubotinki', 'tufli', 'sapogi_i_polusapogi', 'mokasiny_i_lofery'];
      const subTypes = new Map();
      for (const m of shoesHtml.matchAll(/<a[^>]*href="[^"]*obuv_muzhskaya\/([a-z0-9_]+)-([A-Za-z0-9_~]+)[^"]*"[^>]*>/g)) {
        const [tag, slug, code] = m;
        if (subTypes.has(slug) || !CLASSIC_SLUGS.includes(slug)) continue;
        try {
          const p = avfParse(code);
          const t = p.singles.find(([k]) => k === TYPE_PARAM);
          if (!t || p.singles.length !== 2 || p.multi.length) continue;
          const title = (tag.match(/title="([^"]+)"/) || [])[1];
          subTypes.set(slug, { slug, code, param: t[0], value: t[1], name: title || slug.replace(/_/g, ' ') });
        } catch { /* не код фильтра */ }
      }
      let classicTypes = CLASSIC_SLUGS.map((sl) => subTypes.get(sl)).filter(Boolean);
      if (classicTypes.length) say(`✓ Классическая обувь: ${classicTypes.map((t) => t.name).join(', ')}`);
      else {
        const [p, v] = [recipe.classicFallback[0], recipe.classicFallback[1][0]];
        classicTypes = [{ slug: 'botinki_i_polubotinki', param: p, value: v, name: 'Ботинки и полуботинки',
          code: avfEncode({ singles: [[P_CAT, KIND.obuv.id], [p, v]] }) }];
        warn('Не нашёл подразделы обуви — «классика» будет только по ботинкам и полуботинкам (как было у вас).');
        diag.push({ name: 'обувь (виды)', url: catPath('obuv'), html: shoesHtml });
      }

      // 2) бренды без кода (ссылки только с названием) и бренды без названия
      const brands = [];
      for (const b of recipe.brands) {
        let { name, ids } = b;
        if ((!ids || !ids.length || !name) && b.fromUrl) {
          say(`Узнаю бренд по ссылке${name ? ' «' + name + '»' : ''}…`);
          const u = new URL(b.fromUrl);
          const html = await getPage(u.pathname + u.search);
          const echo = searchEcho(html);
          if (!ids || !ids.length) ids = asIds(echo.params && echo.params[P_BRAND]);
          if (!name) {
            const bd = pageFilters(html).find((d) => d.attrId === P_BRAND);
            name = ((bd && bd.selectedValue) || []).map((v) => v.name).join(' / ') || null;
          }
          if (b.typeFromUrl && echo.params && !classicTypes) {
            const k = Object.keys(echo.params).find((x) => ![String(P_CAT), String(P_BRAND)].includes(x));
            if (k) classicTypes = [+k, asIds(echo.params[k])];
          }
        }
        if (!ids || !ids.length) { if (b.q) { brands.push({ ...b, name: name || b.q, ids: [] }); continue; } warn(`Не удалось узнать код бренда${name ? ' «' + name + '»' : ''} — пропускаю.`); continue; }
        brands.push({ ...b, name: name || 'Бренд ' + ids[0], ids });
        say(`✓ ${name}: код ${ids.join(', ')}`);
      }

      brands.sort((a, b) => (a.classic === b.classic ? a.name.localeCompare(b.name) : a.classic ? 1 : -1));

      // 3) собираем ссылки
      const mk = (kindKey, { brandIds = [], extra = [], jsons = [], q = null, path = null }) => {
        const singles = [[P_CAT, KIND[kindKey].id]], multi = [];
        for (const [p, vals] of [...extra, ...(brandIds.length ? [[P_BRAND, brandIds]] : [])]) {
          if (!vals || !vals.length) continue;
          if (vals.length === 1) singles.push([p, vals[0]]); else multi.push([p, vals]);
        }
        const f = avfEncode({ singles, multi, jsons: [price, ...jsons] });
        return `https://www.avito.ru${path || catPath(kindKey)}?d=1&f=${f}${q ? '&q=' + encodeURIComponent(q) : ''}&s=104`;
      };
      let groupMax = recipe.groupMax || 7;
      let accMode = 'group';
      // для одного бренда путь как в вашей рабочей ссылке: …/aksessuary/<слаг бренда>-<код категории+бренда>
      const accPath = (b) => {
        const src = (b.paths && (b.paths.odezhda || b.paths.obuv)) || '';
        const m = src.match(/\/(?:muzhskaya_odezhda|obuv_muzhskaya)\/([a-z0-9_]+)-/);
        return m ? `${ROOT}aksessuary/${m[1]}-${avfEncode({ singles: [[P_CAT, KIND.aksessuary.id], [P_BRAND, b.ids[0]]] })}` : null;
      };
      const shoeExtra = () => [shoeSize, insoleMulti].filter(Boolean);
      const shoeJsons = () => (insoleRange ? [insoleRange] : []);
      const ban = (key) => (recipe.bans && recipe.bans[key]) || [];

      const out = [];
      const add = (name, url, words, kind) => out.push({ name, url, ban: words || [], _kind: kind });
      const groupBrands = (list) => {
        const groups = []; let cur = [];
        for (const b of list) {
          if (cur.length && cur.reduce((n, x) => n + x.ids.length, 0) + b.ids.length > groupMax) { groups.push(cur); cur = []; }
          cur.push(b);
        }
        if (cur.length) groups.push(cur);
        return groups;
      };
      const names = (g) => g.map((x) => x.name).join(', ');
      const buildAll = () => {
        out.length = 0;
        const wear = brands.filter((x) => !x.classic);
        // одежда — по бренду (в ленте удобно фильтровать по бренду)
        for (const b of wear) {
          add(`👕 ${b.name} — одежда`, mk('odezhda', { brandIds: b.ids, extra: [[P_SIZE, recipe.clothingSizes]], path: b.paths && b.paths.odezhda }), ban('odezhda:' + b.key), b.ids.length > 1 ? 'odezhda-multi' : 'odezhda');
        }
        // обувь — группами; бренды со своими стоп-словами отдельно, чтобы слова не задевали другие бренды
        const ownBan = wear.filter((b) => ban('obuv:' + b.key).length);
        for (const b of ownBan) add(`👟 ${b.name} — обувь`, mk('obuv', { brandIds: b.ids, extra: shoeExtra(), jsons: shoeJsons(), path: b.paths && b.paths.obuv }), ban('obuv:' + b.key), 'obuv');
        for (const g of groupBrands(wear.filter((b) => !ownBan.includes(b)))) {
          add(`👟 Обувь: ${names(g)}`, mk('obuv', { brandIds: g.flatMap((x) => x.ids), extra: shoeExtra(), jsons: shoeJsons() }), [], 'obuv-group');
        }
        // классика — по подразделу (ботинки, туфли, сапоги…): вид обуви задаётся адресом раздела
        const cls = brands.filter((x) => x.classic);
        for (const t of classicTypes) {
          const tPath = `${ROOT}obuv_muzhskaya/${t.slug}-${t.code}`;
          const typed = (opts) => mk('obuv', { ...opts, extra: [[t.param, [t.value]], ...shoeExtra()], jsons: shoeJsons(), path: tPath });
          for (const b of cls.filter((x) => !x.ids.length)) add(`👞 ${b.name} — ${t.name.toLowerCase()}`, typed({ q: b.q }), ban('obuv:' + b.key), 'classic-q');
          for (const g of groupBrands(cls.filter((x) => x.ids.length))) add(`👞 ${t.name}: ${names(g)}`, typed({ brandIds: g.flatMap((x) => x.ids) }), [], 'classic');
        }
        // аксессуары и сумки — группами (аксессуары по одному бренду, если Авито не принимает список)
        const groups = groupBrands(brands.filter((x) => x.ids.length));
        for (const k of ['aksessuary', 'sumki']) {
          if (k === 'aksessuary' && accMode === 'single') {
            for (const b of brands.filter((x) => x.ids.length && accPath(x))) {
              add(`${KIND[k].icon} ${KIND[k].label}: ${b.name}`, mk(k, { brandIds: b.ids.slice(0, 1), path: accPath(b) }), recipe.groupBans[k], 'aksessuary-single');
            }
            continue;
          }
          for (const g of groups) add(`${KIND[k].icon} ${KIND[k].label}: ${names(g)}`, mk(k, { brandIds: g.flatMap((x) => x.ids) }), recipe.groupBans[k], k);
        }
      };
      buildAll();

      // 4) проверка: по одному поиску каждого вида
      const expectOf = (url) => {
        const p = avfParse(new URL(url).searchParams.get('f'));
        return [...p.singles.map(([k, v]) => [k, [v]]), ...p.multi];
      };
      async function verify(item) {
        const u = new URL(item.url);
        let html;
        try { html = await getPage(u.pathname + u.search); } catch (e) { if (e.notFound) { diag.push({ name: item.name, url: item.url, html: '404' }); return ['страница не существует']; } throw e; }
        const echo = searchEcho(html);
        if (!echo.params) { diag.push({ name: item.name, url: item.url, html }); return ['страница не распознана']; }
        const probs = [];
        for (const [k, vals] of expectOf(item.url)) {
          const got = new Set(asIds(echo.params[k]));
          if (!vals.every((v) => got.has(v))) probs.push(k === P_BRAND ? 'бренд' : k === P_SIZE ? 'размеры одежды'
            : shoeSize && k === shoeSize[0] ? 'размеры обуви' : insoleMulti && k === insoleMulti[0] ? 'стелька'
            : classicTypes.some((t) => t.param === k) ? 'вид обуви' : k === P_CAT ? 'категория' : 'параметр ' + k);
        }
        if (insoleRange) {
          const g = echo.params[insoleRange[0]];
          if (!g || (typeof g === 'object' && +g.from !== insoleRange[1].from)) probs.push('стелька');
        }
        if (echo.priceMax !== undefined && echo.priceMax !== recipe.price) probs.push('цена');
        if (echo.delivery === false) probs.push('доставка');
        return probs;
      }
      say('\nПроверяю на Авито по одному поиску каждого вида…');
      const kinds = [...new Set(out.map((x) => x._kind))];
      const failed = [];
      for (const kind of kinds) {
        let item = out.find((x) => x._kind === kind);
        let probs = await verify(item);
        if (probs.includes('стелька') && (insoleMulti || insoleRange)) {
          warn('Авито не понял фильтр стельки — убираю его, оставляю размеры 41/42/43.');
          insoleMulti = null; insoleRange = null; buildAll();
          item = out.find((x) => x._kind === kind);
          probs = await verify(item);
        }
        if (kind === 'aksessuary' && probs.length && accMode === 'group') {
          warn('Аксессуары не принимают список брендов — пробую по одному бренду.');
          accMode = 'single'; buildAll();
          item = out.find((x) => x._kind === 'aksessuary-single');
          probs = await verify(item);
          if (!probs.length) { say(`✓ ${item.name} — фильтры совпали`); continue; }
          failed.push('aksessuary-single');
        }
        if (probs.includes('бренд') && groupMax > 7) {
          warn(`Авито не понял список из ${groupMax} брендов в одном поиске — делаю группы по 7.`);
          groupMax = 7; buildAll();
          item = out.find((x) => x._kind === kind);
          probs = await verify(item);
        }
        if (probs.length) { warn(`«${item.name}»: Авито не понял — ${probs.join(', ')}.`); failed.push(kind); if (!diag.some((d) => d.url === item.url)) diag.push({ name: item.name, url: item.url, html: '(страница открылась, параметры: ' + probs.join(', ') + ')' }); }
        else say(`✓ ${item.name} — фильтры совпали`);
      }
      const saveList = (list) => {
        const fresh = list.map(({ _kind, ...x }, i) => ({ ...x, id: Date.now() + i, seen: [], lastVisit: 0 }));
        save(fresh); saveFeed({}); saveMeta({});
        return fresh.length;
      };
      if (failed.length) {
        const okList = out.filter((x) => !failed.includes(x._kind));
        say(`\n❌ Не прошли проверку: ${failed.length} вид(а) поисков. Текущие поиски пока не изменены.`, '#d32f2f');
        const row = el('div'); row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px';
        const bSave = el('button', 'ams-btn primary', `Сохранить проверенные (${okList.length})`);
        bSave.onclick = () => { const n = saveList(okList); say(`✓ Сохранено ${n} проверенных поисков. Остальные добавлю, когда разработчик исправит.`, '#1b7f3b'); bSave.disabled = true; };
        const bDiag = el('button', 'ams-btn', '💾 Скачать страницы для разработчика');
        bDiag.onclick = async () => {
          const pack = { v: (typeof GM_info !== 'undefined' && GM_info.script) ? GM_info.script.version : '', log: logBox.innerText, pages: diag.map((d) => ({ ...d, html: String(d.html) })) };
          downloadText(await encode(pack), 'avito-dlya-razrabotchika.txt');
        };
        row.append(bSave, bDiag);
        logBox.append(row);
        okBtn.disabled = false; okBtn.textContent = 'Закрыть и обновить страницу';
        return;
      }

      // 5) сохраняем
      const savedN = saveList(out);
      say(`\nГотово: ${savedN} поисков.` + (warns.length ? ` Предупреждений: ${warns.length} (выше).` : ' Всё проверено.'), '#1b7f3b');
    } catch (e) {
      say('\n❌ ' + e.message + '\nТекущие поиски не изменены.', '#d32f2f');
    }
    okBtn.disabled = false; okBtn.textContent = 'Закрыть и обновить страницу';
  }

  // ---------------- панель ----------------
  let filterText = '';

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function closePanel() { document.getElementById('ams-panel')?.remove(); }

  function addCurrent() {
    const list = load();
    const fp = fingerprint(location.href);
    if (list.some((x) => fingerprint(x.url) === fp)) { alert('Этот поиск уже сохранён'); return; }
    const name = prompt('Название поиска:', defaultName());
    if (!name) return;
    const u = new URL(cleanUrl(location.href));
    if (!u.searchParams.get('s')) u.searchParams.set('s', '104'); // сразу «по дате»
    const seen = [...document.querySelectorAll('[data-marker="item"][data-item-id]')]
      .map((e) => e.getAttribute('data-item-id'));
    list.unshift({ id: Date.now(), name: name.trim(), url: u.toString(), seen, lastVisit: Date.now() });
    save(list);
    render();
  }

  function render() {
    closePanel();
    const list = load();
    const curFp = isSearchPage() ? fingerprint(location.href) : null;
    const panel = el('div'); panel.id = 'ams-panel';

    const head = el('div', 'ams-head');
    head.append(el('b', null, `⭐ Мои поиски (${list.length})`));
    const pend = pendingItems().filter((x) => !x.shownAt && !x.pv).length;
    const feedBtn = el('button', 'ams-btn primary', '🆕 Новые' + (pend ? ` (${pend})` : ''));
    feedBtn.title = 'Все новые объявления по всем поискам (Alt+N)';
    feedBtn.style.marginLeft = 'auto'; feedBtn.style.marginRight = '6px';
    feedBtn.onclick = () => openFeed();
    head.append(feedBtn);
    const x = el('button', 'ams-x', '✕'); x.title = 'Закрыть (Esc)'; x.onclick = closePanel;
    head.append(x);

    const tools = el('div', 'ams-tools');
    const search = el('input'); search.placeholder = 'Найти…'; search.value = filterText;
    search.oninput = () => { filterText = search.value; drawList(); };
    const add = el('button', 'ams-btn primary', '+ Сохранить этот');
    add.title = 'Сохранить текущий поиск со всеми фильтрами';
    add.disabled = !isSearchPage() || list.some((s) => fingerprint(s.url) === curFp);
    if (add.disabled) add.title = isSearchPage() ? 'Уже сохранён' : 'Откройте страницу поиска';
    add.onclick = addCurrent;
    const brandBtn = el('button', 'ams-btn', '🏷 Бренд');
    brandBtn.title = 'Добавить поиски «одежда + обувь» для бренда, выбранного в фильтре на этой странице';
    brandBtn.onclick = addBrandFromPage;
    tools.append(search, add, brandBtn);

    const box = el('div', 'ams-list');

    function drawList() {
      box.innerHTML = '';
      const q = filterText.trim().toLowerCase();
      const items = list.filter((s) => !q || s.name.toLowerCase().includes(q) || s.url.toLowerCase().includes(q));
      if (!items.length) {
        box.append(el('div', 'ams-empty', list.length ? 'Ничего не найдено'
          : 'Пока пусто. Настройте поиск на Авито и нажмите «+ Сохранить этот».'));
        return;
      }
      items.forEach((s) => {
        const row = el('div', 'ams-row' + (fingerprint(s.url) === curFp ? ' current' : ''));
        const main = el('div', 'ams-main');
        const banN = (s.ban || []).length;
        main.append(el('div', 'ams-name', s.name),
          el('div', 'ams-sub', subtitle(s.url) + (banN ? ` · стоп-слов: ${banN}` : '')));
        row.title = s.url;
        row.onclick = (e) => {
          if (e.ctrlKey || e.metaKey || e.button === 1) window.open(s.url, '_blank');
          else location.href = s.url;
        };
        row.onauxclick = (e) => { if (e.button === 1) window.open(s.url, '_blank'); };

        const mk = (icon, title, fn) => {
          const b = el('button', 'ams-icon', icon); b.title = title;
          b.onclick = (e) => { e.stopPropagation(); fn(); };
          return b;
        };
        const idx = list.indexOf(s);
        row.append(main,
          mk('↑', 'Выше', () => {
            if (idx > 0) { [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]]; save(list); render(); }
          }),
          mk('🔤', 'Стоп-слова этого поиска' + ((s.ban || []).length ? ': ' + s.ban.join(', ') : ''), () => {
            const w = editWords(s.ban, `Стоп-слова для «${s.name}»`);
            if (w) { s.ban = w; save(list); render(); applyWords(); }
          }),
          mk('✏️', 'Переименовать', () => {
            const n = prompt('Название:', s.name); if (n) { s.name = n.trim(); save(list); render(); }
          }),
          mk('🔄', 'Заменить ссылку на текущую страницу (если поменяли фильтры)', () => {
            if (!isSearchPage()) return alert('Откройте страницу поиска с нужными фильтрами');
            if (!confirm(`Обновить «${s.name}» фильтрами с текущей страницы?`)) return;
            const u = new URL(cleanUrl(location.href));
            if (!u.searchParams.get('s')) u.searchParams.set('s', '104');
            s.url = u.toString(); save(list); render();
          }),
          mk('🗑', 'Удалить', () => {
            if (confirm(`Удалить «${s.name}»?`)) { list.splice(idx, 1); save(list); render(); }
          }));
        box.append(row);
      });
    }
    drawList();

    const foot = el('div', 'ams-foot');
    foot.append(el('span', null, `v${typeof GM_info !== 'undefined' ? GM_info.script.version : '?'} · поисков ${loadRO().length} · Alt+S — открыть`));
    const io = el('span');
    const exp = el('button', 'ams-btn', '📤 Перенос');
    exp.title = 'Скопировать всё (поиски, стоп-слова, скрытых продавцов) одним кодом';
    exp.onclick = exportAll;
    const imp = el('button', 'ams-btn', '📥 Загрузить');
    imp.title = 'Вставить код с другого устройства';
    imp.onclick = importAll;
    const gw = loadGlobal();
    const glob = el('button', 'ams-btn', '🔤 Для всех' + (gw.length ? ` (${gw.length})` : ''));
    glob.title = 'Стоп-слова для всех поисков на Авито' + (gw.length ? ': ' + gw.join(', ') : '');
    glob.onclick = () => {
      const w = editWords(loadGlobal(), 'Стоп-слова для ВСЕХ поисков');
      if (w) { saveGlobal(w); render(); applyWords(); }
    };
    io.style.display = 'flex'; io.style.gap = '6px'; io.style.flexWrap = 'wrap'; io.style.justifyContent = 'flex-end';
    const bk = el('button', 'ams-btn', '🗂 Копии');
    bk.title = 'Резервные копии: восстановить поиски, если что-то пропало';
    bk.onclick = openBackups;
    io.append(glob, exp, imp, bk);
    // обновление с GitHub: Tampermonkey сам узнаёт ссылку .user.js и предлагает «Обновить» в тот же скрипт (данные не теряются)
    const upd = typeof GM_info !== 'undefined' && GM_info.script && (GM_info.script.downloadURL || GM_info.script.updateURL);
    if (upd) {
      const ub = el('button', 'ams-btn', '⬆️ Обновить');
      ub.title = 'Проверить новую версию на GitHub. Если она есть — Tampermonkey предложит «Обновить». После обновления перезагрузите вкладки Авито.';
      ub.onclick = () => window.open(upd, '_blank');
      io.append(ub);
    }
    foot.append(io);

    panel.append(head, tools, box, foot);
    document.body.appendChild(panel);
    if (list.length > 6) search.focus();
  }

  function toggle() { document.getElementById('ams-panel') ? closePanel() : render(); }

  const fab = el('button', null, '⭐'); fab.id = 'ams-fab'; fab.title = 'Мои поиски (Alt+S)';
  fab.onclick = toggle;
  document.body.appendChild(fab);
  updateFabBadge();
  // закладка avito.ru/#novye сразу открывает ленту
  if (location.hash === '#novye') setTimeout(() => openFeed(), 300);
  window.addEventListener('hashchange', () => { if (location.hash === '#novye') openFeed(); });

  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.code === 'KeyS')) { e.preventDefault(); toggle(); }
    if (e.altKey && (e.code === 'KeyN')) { e.preventDefault(); openFeed(); }
    if (e.key === 'Escape') { closePanel(); document.getElementById('amf-close')?.click(); }
  });
  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('Мои поиски', toggle);
    GM_registerMenuCommand('Новые объявления', () => openFeed());
  }

  // ---------------- скрытие по стоп-словам ----------------
  const pageFp = isSearchPage() ? fingerprint(location.href) : null;
  const pageNum = +(new URL(location.href).searchParams.get('p') || 1);

  function cardText(card) {
    const title = card.querySelector('[data-marker="item-title"]')?.textContent || '';
    const meta = card.querySelector('meta[itemprop="description"]')?.getAttribute('content') || '';
    const desc = card.querySelector('[class*="descriptionStep"], [class*="description"]')?.textContent || '';
    return norm(title + '\n' + meta + '\n' + desc);
  }

  function updateBar(n, words) {
    let bar = document.getElementById('ams-bar');
    if (!n) { bar?.remove(); return; }
    const showing = document.body.classList.contains('ams-show-hidden');
    const label = `Скрыто по стоп-словам: ${n}`;
    const btnText = showing ? 'спрятать' : 'показать';
    if (bar && bar.dataset.state === label + btnText) return; // не трогаем DOM без нужды
    if (!bar) { bar = el('div'); bar.id = 'ams-bar'; document.body.appendChild(bar); }
    bar.dataset.state = label + btnText;
    bar.textContent = '';
    const t = el('span', null, label); t.title = words.join(', ');
    const b = el('button', null, btnText);
    b.onclick = () => { document.body.classList.toggle('ams-show-hidden'); applyWords(); };
    bar.append(t, b);
  }

  function applyWords() {
    if (!isSearchPage()) return;
    const saved = pageFp ? loadRO().find((x) => fingerprint(x.url) === pageFp) : null;
    const words = [...new Set([...loadGlobal(), ...((saved && saved.ban) || [])])];
    let hidden = 0;
    document.querySelectorAll('[data-marker="item"]').forEach((card) => {
      const text = words.length ? cardText(card) : '';
      // связкам «бренд+слово» нужен и бренд — он есть только в полном тексте карточки
      const full = words.some((w) => w.includes('+')) ? text + '\n' + norm(card.textContent || '') : text;
      const hit = findWord(text, words.filter((w) => !w.includes('+'))) || findWord(full, words.filter((w) => w.includes('+')));
      if (hit) {
        hidden++;
        if (card.dataset.amsWord !== hit) {
          card.dataset.amsWord = hit;
          card.classList.add('ams-hidden');
          card.querySelector('.ams-why')?.remove();
          const why = el('div', 'ams-why', 'скрыто: ' + hit);
          const title = card.querySelector('[data-marker="item-title"]');
          (title?.parentElement || card).prepend(why);
        }
      } else if (card.classList.contains('ams-hidden')) {
        card.classList.remove('ams-hidden');
        delete card.dataset.amsWord;
        card.querySelector('.ams-why')?.remove();
      }
    });
    updateBar(hidden, words);
  }

  // ---------------- отметка новых объявлений ----------------
  if (!isSearchPage()) return;

  let pageState = null, visitMarked = false;
  function markNew() {
    const s = loadRO().find((x) => fingerprint(x.url) === pageFp); // только читаем; пишем ниже и только если есть что
    if (!s) return;
    if (!pageState) {
      const st = parseState(document.documentElement.innerHTML);
      pageState = st.length ? Object.fromEntries(st.map((x) => [x.id, x])) : {};
    }
    const hasTs = Object.keys(pageState).length > 0;
    const seen = new Set(s.seen || []);
    const feed = loadFeedRO();
    const firstVisit = hasTs ? !s.lastTs : seen.size === 0;
    let fresh = 0;
    const ids = [];
    document.querySelectorAll('[data-marker="item"][data-item-id]').forEach((card) => {
      const id = card.getAttribute('data-item-id');
      const st = pageState[id];
      if (st && st.extra) return; // «из других городов» — не трогаем
      ids.push(id);
      const isNewHere = hasTs
        ? (!seen.has(id) && !(feed[id] && feed[id].seenAt) && (feed[id] || (st && isFresh(st, s))))
        : !seen.has(id);
      if (!firstVisit && isNewHere && !card.hasAttribute('data-ams-new') && !card.classList.contains('ams-hidden')) {
        card.setAttribute('data-ams-new', '1');
        const badge = el('div', 'ams-new', 'НОВОЕ');
        const title = card.querySelector('[data-marker="item-title"]');
        (title?.parentElement || card).prepend(badge);
        fresh++;
      }
    });
    // запоминаем всё увиденное (новые — в начало, старые хвосты отрезаем)
    const old = s.seen || [];
    const merged = [...new Set([...ids, ...old])].slice(0, SEEN_LIMIT);
    let lastTs = s.lastTs, maxId = s.maxId;
    if (hasTs) {
      const mine = Object.values(pageState).filter((x) => !x.extra);
      if (mine.length) {
        lastTs = Math.max(s.lastTs || 0, ...mine.map((x) => x.ts));
        maxId = Math.max(s.maxId || 0, ...mine.map((x) => +x.id));
      }
    }
    const markVisit = pageNum === 1 && !visitMarked;
    const changed = markVisit || lastTs !== s.lastTs || maxId !== s.maxId ||
      merged.length !== old.length || merged.some((id, i) => id !== old[i]);
    if (changed) { // раньше поиски перезаписывались при каждом шевелении страницы
      const list = load();
      const w = list.find((x) => x.id === s.id);
      if (w) {
        w.seen = [...new Set([...ids, ...(w.seen || [])])].slice(0, SEEN_LIMIT);
        if (lastTs !== undefined) w.lastTs = Math.max(w.lastTs || 0, lastTs || 0);
        if (maxId !== undefined) w.maxId = Math.max(w.maxId || 0, maxId || 0);
        if (markVisit) { w.lastVisit = Date.now(); visitMarked = true; }
        save(list);
        updateFabBadge();
      }
    }
    if (fresh) {
      const t = el('div', null, `⭐ «${s.name}»: новых с прошлого визита — ${fresh}`);
      Object.assign(t.style, { position: 'fixed', left: '50%', top: '16px', transform: 'translateX(-50%)',
        background: '#2fbf71', color: '#fff', padding: '8px 16px', borderRadius: '10px', zIndex: 99999,
        font: '600 14px Arial,sans-serif', boxShadow: '0 4px 14px rgba(0,0,0,.2)' });
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 6000);
    }
  }

  // карточки догружаются — отмечаем после паузы и при подгрузке
  // Авито постоянно меняет страницу (картинки, реклама), а скрипт сам добавляет значки «НОВОЕ».
  // Поэтому работаем, только когда поменялся набор карточек (или стоп-слова).
  let lastSig = '';
  const run = () => {
    const cards = document.querySelectorAll('[data-marker="item"]');
    const sig = [cards.length, cards[0]?.getAttribute('data-item-id'), cards[cards.length - 1]?.getAttribute('data-item-id'),
      GM_getValue(GLOBAL_KEY, '[]').length].join('|');
    if (sig === lastSig) return;
    lastSig = sig;
    applyWords(); if (pageFp) markNew();
  };
  setTimeout(run, 800);
  let tm = null;
  new MutationObserver(() => { clearTimeout(tm); tm = setTimeout(run, 600); })
    .observe(document.body, { childList: true, subtree: true });
})();