import fs from 'node:fs/promises';
import path from 'node:path';
import Parser from 'rss-parser';

const root = path.resolve(process.cwd());
const sources = JSON.parse(await fs.readFile(path.join(root, 'content', 'sources.json'), 'utf8'));
const parser = new Parser({
  timeout: 15000,
  headers: { 'user-agent': 'VoixDuSahelBot/1.0 (+https://github.com/)' }
});

/* ---------- helpers ---------- */
function cleanText(s = '') {
  return String(s).replace(/\s+/g, ' ').trim();
}

function shorten(s = '', max = 180) {
  s = cleanText(s);
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const last = cut.lastIndexOf(' ');
  return (last > 100 ? cut.slice(0, last) : cut) + '…';
}

function firstDefined(...vals) {
  for (const v of vals) if (v) return v;
  return null;
}

/* Try to extract an image URL from common RSS fields */
function pickImage(item) {
  // rss-parser flattens some media:content attributes sometimes
  const enclose = item.enclosure?.url;
  const mediaContent = item['media:content']?.url || item.mediaContent?.url;
  const mediaThumb = item['media:thumbnail']?.url || item.mediaThumbnail?.url;
  const image = firstDefined(enclose, mediaContent, mediaThumb);
  return image || null;
}

/* YouTube detection */
function parseYouTube(link) {
  if (!link) return null;
  try {
    const u = new URL(link);
    if (u.hostname.includes('youtube.com') || u.hostname === 'youtu.be') {
      let id = null;
      if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
      else if (u.searchParams.get('v')) id = u.searchParams.get('v');
      if (id) {
        return {
          type: 'video',
          src: `https://www.youtube.com/embed/${id}`,
          poster: `https://img.youtube.com/vi/${id}/hqdefault.jpg`
        };
      }
    }
  } catch {}
  return null;
}

/* Map RSS item -> our ARTICLES model */
function normalizeItem(item, feedTitle) {
  const title = cleanText(item.title || '');
  const link  = item.link || '';
  const iso   = item.isoDate || item.pubDate || new Date().toISOString();

  // Try media
  const yt = parseYouTube(link);
  let media = null;
  if (yt) {
    media = yt;
  } else {
    const img = pickImage(item);
    if (img) media = { type: 'image', src: img, alt: title };
  }

  // Description/excerpt
  const raw = firstDefined(item.contentSnippet, item.summary, item.content) || '';
  const excerptEN = shorten(raw, 200);

  return {
    id: (item.guid || link || title).slice(0, 128),
    category: feedTitle || 'World',
    date: new Date(iso).toISOString(),
    isHero: false,
    media,                       // {type:'image'|'video', src, poster?, alt?} | null
    title: { en: title, fr: '' },
    excerpt: { en: excerptEN, fr: '' },
    body: { en: '', fr: '' },
    photos: media?.type === 'image' ? [media.src] : []
  };
}

function keywordHit(str, keywords){
  const s = (str||'').toLowerCase();
  return keywords.length === 0 || keywords.some(k => s.includes(k.toLowerCase()));
}

/* ---------- main ---------- */
const collected = [];

for (const url of sources.feeds) {
  try {
    const feed = await parser.parseURL(url);
    for (const item of feed.items || []) {
      const obj = normalizeItem(item, feed.title);
      const haystack = `${obj.title.en} ${obj.excerpt.en}`;
      if (keywordHit(haystack, sources.keywords)) {
        collected.push(obj);
      }
    }
  } catch (e) {
    console.error('Feed error:', url, e.message);
  }
}

collected.sort((a,b)=> new Date(b.date) - new Date(a.date));
if (collected[0]) collected[0].isHero = true;

const TOP = collected.slice(0, 20);
const outPath = path.join(root, 'content', 'live.json');
await fs.writeFile(outPath, JSON.stringify(TOP, null, 2), 'utf8');
console.log(`Wrote ${TOP.length} items to content/live.json`);
