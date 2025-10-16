const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');

// === RSS-источники ===
const RSS_SOURCES = [
  'https://karelia.news/rss',
  'https://ria.ru/export/rss2/archive/index.xml',
  'https://tass.ru/rss/v2.xml',
  'https://www.bezformata.com/rss/region/10',
  'https://tv-karelia.ru/feed/',
  'https://rk.karelia.ru/feed/'
];

// === HTML-сайты (fallback) ===
const HTML_SOURCES = [
  { url: 'https://ptzgovorit.ru/', name: 'ptzgovorit' },
  { url: 'https://karelinform.ru/', name: 'karelinform' }
];

// === Telegram-каналы (публичные архивы) ===
const TELEGRAM_SOURCES = [
  { url: 'https://t.me/s/gorodskoyadmin', name: 'gorodskoyadmin' },
  { url: 'https://t.me/s/tvojakarelia', name: 'tvojakarelia' },
  { url: 'https://t.me/s/novostikarelia', name: 'novostikarelia' }
];

// === Ключевые слова для фильтрации по Карелии ===
const KARELIA_KEYWORDS = [
  'карелия', 'петрозаводск', 'кондопога', 'сортавала', 'кемь',
  'беломорск', 'лоухи', 'медвежьегорск', 'сегежа', 'питкяранта',
  'суоярви', 'олонец', 'пряжа', 'пудож', 'лахденпохья', 'республика карелия'
];

const CITY_COORDS = {
  'Петрозаводск': { lon: 34.3469, lat: 61.7849 },
  'Кондопога': { lon: 33.9272, lat: 62.2167 },
  'Сортавала': { lon: 30.7031, lat: 61.7167 },
  'Кемь': { lon: 34.5956, lat: 64.9444 },
  'Беломорск': { lon: 34.4667, lat: 64.5222 },
  'Лоухи': { lon: 32.3500, lat: 65.7333 },
  'Медвежьегорск': { lon: 34.4500, lat: 62.9333 },
  'Сегежа': { lon: 34.2833, lat: 62.5167 },
  'Питкяранта': { lon: 30.6500, lat: 61.4000 },
  'Суоярви': { lon: 30.9000, lat: 62.1667 },
  'Олонец': { lon: 32.3667, lat: 60.9833 },
  'Пряжа': { lon: 33.3500, lat: 61.2500 },
  'Пудож': { lon: 36.8500, lat: 61.9000 },
  'Лахденпохья': { lon: 29.9667, lat: 61.0500 }
};

const MAX_NEWS_AGE = 7 * 24 * 60 * 60 * 1000;

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

function isKareliaRelevant(text) {
  const lower = text.toLowerCase();
  return KARELIA_KEYWORDS.some(kw => lower.includes(kw));
}

function extractCity(text) {
  const lower = text.toLowerCase();
  for (const city of Object.keys(CITY_COORDS)) {
    if (lower.includes(city.toLowerCase())) return city;
  }
  return 'Петрозаводск';
}

function classifyNews(text) {
  const lower = text.toLowerCase();
  const categories = {
    politics: ['выборы', 'правительство', 'администрация', 'губернатор', 'депутат', 'закон'],
    crime: ['задержан', 'кража', 'ДТП', 'пожар', 'преступление', 'полиция', 'суд'],
    culture: ['выставка', 'концерт', 'музей', 'фестиваль', 'театр', 'библиотека'],
    economy: ['экономика', 'бизнес', 'инвестиции', 'производство', 'завод'],
    sports: ['спорт', 'чемпионат', 'матч', 'турнир', 'стадион', 'футбол', 'хоккей'],
    science: ['наука', 'исследование', 'университет', 'академия', 'лаборатория'],
    accidents: ['авария', 'катастрофа', 'ЧП', 'утечка', 'обрушение'],
    infrastructure: ['дорога', 'ремонт', 'теплотрасса', 'светофор', 'мост']
  };
  for (const [cat, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => lower.includes(kw))) return cat;
  }
  return 'other';
}

// === ПАРСИНГ RSS ===
async function parseRSS(url) {
  const parser = new Parser({ timeout: 12000 });
  try {
    const feed = await parser.parseURL(url);
    return feed.items || [];
  } catch (e) {
    console.warn(`⚠️ RSS парсинг не удался: ${url}`, e.message);
    return [];
  }
}

// === ПАРСИНГ HTML (сайты и Telegram) ===
async function parseHTML({ url, name }) {
  try {
    const res = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(res.data);
    const items = [];

    if (name === 'ptzgovorit') {
      $('article.news-item, .news-list-item, .post, .news-card').each((i, el) => {
        const title = $(el).find('h1, h2, h3, a').first().text().trim();
        const link = $(el).find('a').attr('href');
        const desc = $(el).find('p').first().text().trim();
        if (title && link) {
          items.push({ title, link: link.startsWith('http') ? link : 'https://ptzgovorit.ru' + link, description: desc });
        }
      });
    } else if (name === 'karelinform') {
      $('div.news-item, article, .post, .news').each((i, el) => {
        const title = $(el).find('h2, h3, a').first().text().trim();
        const link = $(el).find('a').attr('href');
        const desc = $(el).find('p').first().text().trim();
        if (title && link) {
          items.push({ title, link: link.startsWith('http') ? link : 'https://karelinform.ru' + link, description: desc });
        }
      });
    } else if (name.includes('telegram_')) {
      $('.tgme_widget_message').each((i, el) => {
        const text = $(el).find('.tgme_widget_message_text').text().trim();
        const link = $(el).find('.tgme_widget_message_date').attr('href');
        if (text && link) {
          items.push({ title: text.substring(0, 80) + '...', description: text, link });
        }
      });
    }

    return items.slice(0, 10);
  } catch (e) {
    console.warn(`⚠️ HTML парсинг не удался: ${url}`, e.message);
    return [];
  }
}

// === ОСНОВНАЯ ФУНКЦИЯ ===
let cachedNews = [];
let lastFetch = 0;

async function fetchAndProcessNews() {
  const now = Date.now();
  if (now - lastFetch < 4 * 60 * 1000 && cachedNews.length > 0) {
    return cachedNews;
  }

  const allNews = [];

  // 1. RSS
  for (const url of RSS_SOURCES) {
    const items = await parseRSS(url);
    for (const item of items) {
      if (!item.title || !item.link) continue;
      const fullText = (item.title + ' ' + (item.contentSnippet || item.content || '')).trim();
      if (!isKareliaRelevant(fullText)) continue;
      const pubDate = new Date(item.pubDate || item.isoDate || Date.now());
      if (isNaN(pubDate.getTime()) || now - pubDate.getTime() > MAX_NEWS_AGE) continue;
      const city = extractCity(fullText);
      const coords = CITY_COORDS[city] || CITY_COORDS['Петрозаводск'];
      allNews.push({
        title: item.title.trim(),
        description: (item.contentSnippet || item.content || '').trim(),
        link: item.link,
        pubDate: pubDate.toISOString(),
        location: city,
        lon: coords.lon,
        lat: coords.lat,
        category: classifyNews(fullText)
      });
    }
  }

  // 2. HTML-сайты
  for (const source of HTML_SOURCES) {
    const items = await parseHTML(source);
    for (const item of items) {
      const fullText = (item.title + ' ' + item.description).trim();
      if (!isKareliaRelevant(fullText)) continue;
      const city = extractCity(fullText);
      allNews.push({
        title: item.title,
        description: item.description,
        link: item.link,
        pubDate: new Date().toISOString(),
        location: city,
        lon: CITY_COORDS[city]?.lon || CITY_COORDS['Петрозаводск'].lon,
        lat: CITY_COORDS[city]?.lat || CITY_COORDS['Петрозаводск'].lat,
        category: classifyNews(fullText)
      });
    }
  }

  // 3. Telegram
  for (const source of TELEGRAM_SOURCES) {
    const items = await parseHTML({ ...source, name: `telegram_${source.name}` });
    for (const item of items) {
      const fullText = item.description;
      if (!isKareliaRelevant(fullText)) continue;
      const city = extractCity(fullText);
      allNews.push({
        title: item.title,
        description: item.description,
        link: item.link,
        pubDate: new Date().toISOString(),
        location: city,
        lon: CITY_COORDS[city]?.lon || CITY_COORDS['Петрозаводск'].lon,
        lat: CITY_COORDS[city]?.lat || CITY_COORDS['Петрозаводск'].lat,
        category: classifyNews(fullText)
      });
    }
  }

  // Удаление дубликатов
  const seen = new Set();
  const uniqueNews = allNews.filter(item => {
    const key = `${item.link}|${item.title}`.toLowerCase().replace(/\s+/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  cachedNews = uniqueNews;
  lastFetch = now;
  console.log(`✅ Загружено ${cachedNews.length} новостей`);
  return cachedNews;
}

module.exports = { fetchAndProcessNews };