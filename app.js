console.log('Voix du Sahel app.js loaded ✅');

const CONTENT_URL = 'content/articles.json';
const LIVE_URL    = 'content/live.json';

const UI_STRINGS = {
  about_title: { en: 'About', fr: 'À propos' },
  about_body: {
    en: 'Independent reporting from the Sahel region. Bilingual: English & French.',
    fr: 'Reportages indépendants sur la région du Sahel. Bilingue : anglais et français.'
  },
  latest_videos: { en: 'Latest videos', fr: 'Dernières vidéos' }
};

/* ================= Traducción EN->FR con cache ================= */
const CACHE_KEY = 'vds_translation_cache_v1';
let TRANSLATION_CACHE = {};
try { TRANSLATION_CACHE = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch {}

function cacheKey(text, from, to){
  let h = 0; for (const c of `${from}:${to}:${text}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return String(h);
}

async function translateText(text, from='en', to='fr'){
  if (!text || from === to) return text;
  const key = cacheKey(text, from, to);
  if (TRANSLATION_CACHE[key]) return TRANSLATION_CACHE[key];
  try{
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`);
    const j = await r.json();
    const out = j?.responseData?.translatedText || text;
    TRANSLATION_CACHE[key] = out;
    localStorage.setItem(CACHE_KEY, JSON.stringify(TRANSLATION_CACHE));
    return out;
  }catch{ return text; }
}

/* ================= Utilidades imagen segura ================= */
const FALLBACK_IMG = 'https://via.placeholder.com/1200x675?text=Image+unavailable';

function makeSafeImage(src, alt = ''){
  const img = new Image();
  img.loading = 'lazy';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.alt = alt || '';
  img.src = src;
  img.onerror = () => { img.onerror = null; img.src = FALLBACK_IMG; };
  return img;
}

function escapeHTML(s){
  return (s || '').replace(/[&<>"]/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'
  }[ch]));
}
function el(tag, cls){ const x=document.createElement(tag); if(cls) x.className=cls; return x; }

const main = document.getElementById('mainColumn');
const videoList = document.getElementById('videoList');
let viewMode = 'en';
let ARTICLES = [];

/* ================= Helpers ================= */
function formatDate(s){
  const d = s ? new Date(s) : new Date();
  return d.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });
}

async function fetchJSON(url){
  const res = await fetch(`${url}?nocache=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/* ================= Render lead ================= */
async function renderLead(a){
  const box = el('section','lead');
  const fig = el('figure');

  if (a.media?.type === 'image'){
    fig.appendChild(makeSafeImage(a.media.src, a.media.alt || a.title?.en || ''));
  } else if (a.media?.type === 'video'){
    const v = document.createElement('video');
    v.controls = true; v.preload = 'metadata'; v.playsInline = true;
    if (a.media.poster) v.poster = a.media.poster;
    v.src = a.media.src;
    fig.appendChild(v);
  }
  box.appendChild(fig);

  // Títulos + bajada con traducción si falta FR
  let tEN=a.title?.en||'', tFR=a.title?.fr||'';
  let eEN=a.excerpt?.en||'', eFR=a.excerpt?.fr||'';
  if (viewMode !== 'en'){
    if (!tFR && tEN) tFR = await translateText(tEN);
    if (!eFR && eEN) eFR = await translateText(eEN);
  }

  const h = el('h2','headline');
  const d = el('p','dek');
  if (viewMode === 'fr'){ h.textContent = tFR || tEN; d.textContent = eFR || eEN; }
  else if (viewMode === 'both'){
    h.innerHTML = `${escapeHTML(tEN)} <span class="excerpt" style="font-size:16px">/ ${escapeHTML(tFR)}</span>`;
    d.innerHTML = `${escapeHTML(eEN)}<br><em>${escapeHTML(eFR)}</em>`;
  } else { h.textContent = tEN || tFR; d.textContent = eEN || eFR; }

  const meta = el('div','excerpt'); meta.textContent = `${a.category || 'World'} • ${formatDate(a.date)}`;
  box.appendChild(h); box.appendChild(d); box.appendChild(meta);

  // Cuerpo + galería
  const photos = (a.photos || []);
  if (a.body?.en || a.body?.fr || photos.length){
    const grid = el('div'); grid.className='lead-grid';
    const story = el('div'); const gallery = el('div'); gallery.className='photo-grid';

    let bEN=a.body?.en||'', bFR=a.body?.fr||'';
    if (viewMode !== 'en' && !bFR && bEN) bFR = await translateText(bEN);

    story.className='excerpt';
    if (viewMode === 'both') story.innerHTML = `${escapeHTML(bEN)}<br><em>${escapeHTML(bFR)}</em>`;
    else if (viewMode === 'fr') story.textContent = bFR || bEN;
    else story.textContent = bEN || bFR;

    photos.forEach((src,i)=>{
      const f = el('figure','photo');
      f.appendChild(makeSafeImage(src, `Photo ${i+1}`));
      const cap = el('figcaption','caption'); cap.textContent = `Photo ${i+1}`;
      f.appendChild(cap);
      gallery.appendChild(f);
    });

    grid.appendChild(story); grid.appendChild(gallery);
    box.appendChild(grid);
  }
  return box;
}

/* ================= Tarjetas y Latest ================= */
async function renderCard(a){
  const card = el('a','card'); card.href='#';
  const fig = el('figure','thumb');

  if (a.media?.type === 'image'){
    fig.appendChild(makeSafeImage(a.media.src, a.media.alt || ''));
  } else if (a.media?.poster){
    fig.appendChild(makeSafeImage(a.media.poster, 'Video'));
  }
  card.appendChild(fig);

  let tEN=a.title?.en||'', tFR=a.title?.fr||'', eEN=a.excerpt?.en||'', eFR=a.excerpt?.fr||'';
  if (viewMode !== 'en'){
    if (!tFR && tEN) tFR = await translateText(tEN);
    if (!eFR && eEN) eFR = await translateText(eEN);
  }

  const h3 = el('h3'); const p = el('p');
  if (viewMode === 'fr'){ h3.textContent = tFR || tEN; p.textContent = eFR || eEN; }
  else if (viewMode === 'both'){
    h3.innerHTML = `${escapeHTML(tEN)} / ${escapeHTML(tFR)}`;
    p.innerHTML = `${escapeHTML(eEN)}<br><em>${escapeHTML(eFR)}</em>`;
  } else { h3.textContent = tEN || tFR; p.textContent = eEN || eFR; }

  card.appendChild(h3); card.appendChild(p);
  return card;
}

async function renderLatestItem(a){
  const row = el('div','item');
  const thumb = el('div','thumb latest-thumb');

  if (a.media?.type === 'image'){
    thumb.appendChild(makeSafeImage(a.media.src, a.media.alt||''));
  } else if (a.media?.poster){
    thumb.appendChild(makeSafeImage(a.media.poster, 'Video'));
  }
  row.appendChild(thumb);

  let tEN=a.title?.en||'', tFR=a.title?.fr||'';
  if (viewMode !== 'en' && !tFR && tEN) tFR = await translateText(tEN);

  const text = el('div');
  const h4 = el('h4'); h4.textContent = (viewMode==='fr') ? (tFR||tEN) : (viewMode==='both' ? `${tEN} / ${tFR}` : (tEN||tFR));
  const meta = el('div','muted'); meta.textContent = `${a.category || 'World'} • ${formatDate(a.date)}`;

  text.appendChild(h4); text.appendChild(meta);
  row.appendChild(text);
  return row;
}

/* ================= Render general ================= */
async function render(){
  main.innerHTML = '';
  const sorted = [...ARTICLES].sort((x,y)=> (y.isHero - x.isHero) || (new Date(y.date||0)-new Date(x.date||0)));

  const lead = sorted.find(a=>a.isHero) || sorted[0];
  if (lead) main.appendChild(await renderLead(lead));

  const rest = sorted.filter(a=>a!==lead);
  if (rest.length){
    const title = el('div','section-title'); title.textContent = (viewMode==='fr' ? 'À la une' : 'Top stories');
    main.appendChild(title);
    const grid = el('section','grid-cards');
    for (const a of rest.slice(0,4)) grid.appendChild(await renderCard(a));
    main.appendChild(grid);
  }

  if (rest.length > 4){
    main.appendChild(el('div','hr'));
    const title2 = el('div','section-title'); title2.textContent = (viewMode==='fr' ? 'Dernières' : 'Latest');
    main.appendChild(title2);
    const list = el('section','latest');
    for (const a of rest.slice(4,10)) list.appendChild(await renderLatestItem(a));
    main.appendChild(list);
  }

  const vids = sorted.filter(a=>a.media && a.media.type==='video');
  if (!vids.length){ videoList.textContent = '—'; }
  else{
    videoList.innerHTML = '';
    for (const v of vids.slice(0,3)){
      const item = document.createElement('div');
      const txt = (viewMode==='fr' ? (v.title.fr || v.title.en) : (v.title.en || v.title.fr));
      item.textContent = txt || '';
      videoList.appendChild(item);
    }
  }

  // Textos fijos (sin optional chaining a la izquierda)
  const elAbout = document.querySelector('[data-i18n="about_title"]');
  if (elAbout) elAbout.textContent = (viewMode==='fr'
    ? UI_STRINGS.about_title.fr
    : (viewMode==='both'
        ? `${UI_STRINGS.about_title.en} / ${UI_STRINGS.about_title.fr}`
        : UI_STRINGS.about_title.en));

  const elBody = document.querySelector('[data-i18n="about_body"]');
  if (elBody) elBody.textContent = (viewMode==='fr'
    ? UI_STRINGS.about_body.fr
    : (viewMode==='both'
        ? `${UI_STRINGS.about_body.en} / ${UI_STRINGS.about_body.fr}`
        : UI_STRINGS.about_body.en));

  const elLatest = document.querySelector('[data-i18n="latest_videos"]');
  if (elLatest) elLatest.textContent = (viewMode==='fr'
    ? UI_STRINGS.latest_videos.fr
    : (viewMode==='both'
        ? `${UI_STRINGS.latest_videos.en} / ${UI_STRINGS.latest_videos.fr}`
        : UI_STRINGS.latest_videos.en));
}

/* ================= Eventos UI ================= */
document.querySelectorAll('.lang-switch button').forEach(btn=>{
  btn.addEventListener('click', async ()=>{
    document.querySelectorAll('.lang-switch button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    viewMode = btn.dataset.lang;
    await render();
  });
});

document.getElementById('year').textContent = new Date().getFullYear();

/* ================= Boot: intenta LIVE y cae a ARTICLES ================= */
async function loadLiveArticles() {
  try {
    const live = await fetchJSON(LIVE_URL);
    if (Array.isArray(live) && live.length) return live;
  } catch (e) {
    console.info('live.json not available (yet):', e.message);
  }
  return null;
}

async function boot(){
  // 1) Intenta usar live.json (RSS por Actions)
  const live = await loadLiveArticles();
  if (live) {
    console.log(`Using LIVE feed (${live.length} items)`);
    ARTICLES = live;
    await render();
  } else {
    // 2) Fallback a articles.json del repo
    try{
      const data = await fetchJSON(CONTENT_URL);
      if (Array.isArray(data)) ARTICLES = data;
      console.log(`Loaded ${ARTICLES.length} item(s) from ${CONTENT_URL}`);
    }catch(e){
      console.error('Failed to load articles.json', e);
      ARTICLES = [];
    }
    await render();
  }

  // 3) Auto-refresh del feed LIVE cada 5 min (si aparece luego)
  setInterval(async ()=>{
    const fresh = await loadLiveArticles();
    if (fresh) {
      ARTICLES = fresh;
      console.log('LIVE feed refreshed.');
      render();
    }
  }, 5 * 60 * 1000);
}

boot();
