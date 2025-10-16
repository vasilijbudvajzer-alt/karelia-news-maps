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
  { url: 'https://t.me/s/novostikarelia', name: 'novostikarelia' },
  { url: 'https://t.me/s/sortavala_karelia', name: 'sortavala_karelia' },
  { url: 'https://t.me/s/karjala_pulp', name: 'karjala_pulp' },
  { url: 'https://t.me/s/AParfenchikov', name: 'AParfenchikov' },
  { url: 'https://t.me/s/karelialive', name: 'karelialive' },
  { url: 'https://t.me/s/kar_el', name: 'kar_el' },
  { url: 'https://t.me/s/vkratse_petrozavodsk', name: 'vkratse_petrozavodsk' },
  { url: 'https://t.me/s/kalitki', name: 'kalitki' },
  { url: 'https://t.me/s/podslushano_petrozavodsk', name: 'podslushano_petrozavodsk' }
];

// === Ключевые слова для фильтрации по Карелии ===
const KARELIA_KEYWORDS = [
  'карелия', 'петрозаводск', 'кондопога', 'сортавала', 'кемь',
  'беломорск', 'лоухи', 'медвежьегорск', 'сегежа', 'питкяранта',
  'суоярви', 'олонец', 'пряжа', 'пудож', 'лахденпохья', 'республика карелия',
  'карельская', 'карелы', 'онежское', 'ладожское', 'кижи', 'соловки',
  'парфенчиков', 'глава карелии', 'карнц'
];

// === Координаты городов ===
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

// === Объекты в Петрозаводске для точной привязки ===
const PETROZAVODSK_PLACES = {
  // Политика
  'правительство': { lon: 34.3431, lat: 61.7851 },
  'администрация': { lon: 34.3431, lat: 61.7851 },
  'госсобрание': { lon: 34.3425, lat: 61.7860 },
  'парламент': { lon: 34.3425, lat: 61.7860 },
  'мэрия': { lon: 34.3431, lat: 61.7851 },
  'парфенчиков': { lon: 34.3431, lat: 61.7851 },
  // Культура
  'театр': { lon: 34.3490, lat: 61.7820 },
  'драмтеатр': { lon: 34.3490, lat: 61.7820 },
  'музей': { lon: 34.3510, lat: 61.7835 },
  'галерея': { lon: 34.3510, lat: 61.7835 },
  'библиотека': { lon: 34.3470, lat: 61.7880 },
  'консерватория': { lon: 34.3450, lat: 61.7900 },
  'кижи': { lon: 34.3510, lat: 61.7835 },
  // Спорт
  'стадион': { lon: 34.3300, lat: 61.7700 },
  'арена': { lon: 34.3300, lat: 61.7700 },
  // Наука
  'университет': { lon: 34.3200, lat: 61.7950 },
  'карнц': { lon: 34.3200, lat: 61.7950 },
  'академия': { lon: 34.3200, lat: 61.7950 },
  // Инфраструктура
  'вокзал': { lon: 34.3100, lat: 61.7600 },
  'аэропорт': { lon: 34.1500, lat: 61.8800 }
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
  if (/выборы|правительство|администрация|губернатор|депутат|закон|парламент|госсобрание|мэрия|глава республики|парфенчиков/.test(lower)) return 'politics';
  if (/задержан|кража|ДТП|пожар|преступление|полиция|суд|уголовное|мошенничество|наркотики/.test(lower)) return 'crime';
  if (/выставка|концерт|музей|фестиваль|театр|библиотека|кино|искусство|галерея|кижи|фольклор/.test(lower)) return 'culture';
  if (/экономика|бизнес|инвестиции|производство|завод|предприятие|торговля|бюджет|промышленность/.test(lower)) return 'economy';
  if (/спорт|чемпионат|матч|турнир|стадион|футбол|хоккей|лыжи|арена|гонки/.test(lower)) return 'sports';
  if (/наука|исследование|университет|академия|лаборатория|профессор|карнц|диссертация/.test(lower)) return 'science';
  if (/авария|катастрофа|ЧП|утечка|обрушение|аварийные|инцидент|пожар/.test(lower)) return 'accidents';
  if (/дорога|ремонт|теплотрасса|светофор|мост|трубопровод|электросети|вокзал|благоустройство/.test(lower)) return 'infrastructure';
  return 'other';
}

function getCoordinates(text, city) {
  const lower = text.toLowerCase();
  if (city === 'Петрозаводск') {
    for (const [place, coords] of Object.entries(PETROZAVODSK_PLACES)) {
      if (lower.includes(place)) {
        return { ...coords };
      }
    }
  }
  return CITY_COORDS[city] || CITY_COORDS['Петрозаводск'];
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
    const res = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'KareliaNewsBot/1.0 (+https://your-site.onrender.com)' }
    });
    const $ = cheerio.load(res.data);
    const items = [];

    if (name === 'ptzgovorit') {
      $('article, .news-item, .post, .news-card, .post-item').each((i, el) => {
        const title = $(el).find('h1, h2, h3, a').first().text().trim();
        const link = $(el).find('a').attr('href');
        const desc = $(el).find('p').first().text().trim();
        if (title && link) {
          items.push({
            title,
            link: link.startsWith('http') ? link : 'https://ptzgovorit.ru' + link,
            description: desc
          });
        }
      });
    } else if (name === 'karelinform') {
      $('div.news-item, article, .post, .news, .entry').each((i, el) => {
        const title = $(el).find('h2, h3, a').first().text().trim();
        const link = $(el).find('a').attr('href');
        const desc = $(el).find('p').first().text().trim();
        if (title && link) {
          items.push({
            title,
            link: link.startsWith('http') ? link : 'https://karelinform.ru' + link,
            description: desc
          });
        }
      });
    } else if (name.includes('telegram_')) {
      $('.tgme_widget_message').each((i, el) => {
        const text = $(el).find('.tgme_widget_message_text').text().trim();
        const link = $(el).find('.tgme_widget_message_date').attr('href');
        if (text && link) {
          items.push({
            title: text.substring(0, 80) + '...',
            description: text,
            link: link
          });
        }
      });
    }

    return items.slice(0, 15);
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
      const coords = getCoordinates(fullText, city);
      const category = classifyNews(fullText);
      allNews.push({
        title: item.title.trim(),
        description: (item.contentSnippet || item.content || '').trim(),
        link: item.link,
        pubDate: pubDate.toISOString(),
        location: city,
        lon: coords.lon,
        lat: coords.lat,
        category: category
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
      const coords = getCoordinates(fullText, city);
      const category = classifyNews(fullText);
      allNews.push({
        title: item.title,
        description: item.description,
        link: item.link,
        pubDate: new Date().toISOString(),
        location: city,
        lon: coords.lon,
        lat: coords.lat,
        category: category
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
      const coords = getCoordinates(fullText, city);
      const category = classifyNews(fullText);
      allNews.push({
        title: item.title,
        description: item.description,
        link: item.link,
        pubDate: new Date().toISOString(),
        location: city,
        lon: coords.lon,
        lat: coords.lat,
        category: category
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