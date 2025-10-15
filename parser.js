const Parser = require('rss-parser');
const axios = require('axios');

// === ИСТОЧНИКИ: местные + федеральные с фильтрацией ===
const RSS_SOURCES = [
  // Местные
 'https://karelia.info/rss/',
  'https://karelia.news/rss',
  'https://petrozavodsk.info/rss/',
  'https://karelinform.ru/rss.xml',
  'https://petrimedia.ru/export/rss2/news/index.xml',
  'https://government.karelia.ru/press/news/rss/',
  'https://segezha.info/rss/'
  // Федеральные (будут фильтроваться по ключевым словам)
  'https://ria.ru/export/rss2/archive/index.xml',
  'https://tass.ru/rss/v2.xml',
  'https://lenta.ru/rss/'
];

// Ключевые слова для фильтрации федеральных новостей
const KARELIA_KEYWORDS = [
  'карелия', 'кarelia', 'петрозаводск', 'кондопога', 'сортавала', 'кемь',
  'беломорск', 'лоухи', 'медвежьегорск', 'сегежа', 'питкяранта', 'суоярви',
  'олонец', 'пряжа', 'пудож', 'лахденпохья', 'республика карелия'
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

// Простое извлечение города (без улиц — слишком ненадёжно)
function extractCity(text) {
  const lower = text.toLowerCase();
  for (const [city, coords] of Object.entries(CITY_COORDS)) {
    if (lower.includes(city.toLowerCase())) {
      return city;
    }
  }
  return 'Петрозаводск'; // fallback
}

// Проверка: относится ли новость к Карелии?
function isKareliaRelevant(text) {
  const lower = text.toLowerCase();
  return KARELIA_KEYWORDS.some(kw => lower.includes(kw));
}

// Классификация (упрощённая, без AI — для надёжности)
function classifyNews(text) {
  const lower = text.toLowerCase();
  const categories = {
    politics: ['выборы', 'правительство', 'администрация', 'губернатор', 'депутат', 'закон', 'парламент'],
    crime: ['задержан', 'кража', 'ДТП', 'пожар', 'преступление', 'полиция', 'суд', 'уголовное'],
    culture: ['выставка', 'концерт', 'музей', 'фестиваль', 'театр', 'библиотека', 'кино', 'искусство'],
    economy: ['экономика', 'бизнес', 'инвестиции', 'производство', 'завод', 'предприятие', 'торговля'],
    sports: ['спорт', 'чемпионат', 'матч', 'турнир', 'стадион', 'футбол', 'хоккей', 'лыжи'],
    science: ['наука', 'исследование', 'университет', 'академия', 'лаборатория', 'профессор'],
    accidents: ['авария', 'катастрофа', 'ЧП', 'пожар', 'утечка', 'обрушение', 'аварийные'],
    infrastructure: ['дорога', 'ремонт', 'теплотрасса', 'светофор', 'мост', 'трубопровод', 'электросети']
  };

  for (const [cat, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return cat;
    }
  }
  return 'other';
}

// Надёжный парсинг с таймаутом и повторами
async function safeParse(url, retries = 2) {
  const parser = new Parser({
    timeout: 10000,
    headers: { 'User-Agent': 'KareliaNewsBot/1.0 (+https://your-site.onrender.com)' }
  });

  for (let i = 0; i <= retries; i++) {
    try {
      return await parser.parseURL(url);
    } catch (e) {
      console.warn(`Попытка ${i + 1} не удалась для ${url}:`, e.message);
      if (i < retries) await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error(`Не удалось спарсить ${url} после ${retries + 1} попыток`);
}

let cachedNews = [];
let lastFetch = 0;

async function fetchAndProcessNews() {
  const now = Date.now();
  if (now - lastFetch < 4 * 60 * 1000 && cachedNews.length > 0) {
    return cachedNews;
  }

  const allNews = [];

  for (const url of RSS_SOURCES) {
    try {
      console.log(`📡 Парсинг: ${url}`);
      const feed = await safeParse(url);
      let count = 0;

      for (const item of feed.items || []) {
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
        count++;
      }

      console.log(`  → Найдено релевантных новостей: ${count}`);
    } catch (e) {
      console.error(`❌ Ошибка при обработке ${url}:`, e.message);
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
  console.log(`✅ Всего уникальных новостей: ${cachedNews.length}`);
  return cachedNews;
}

module.exports = { fetchAndProcessNews };