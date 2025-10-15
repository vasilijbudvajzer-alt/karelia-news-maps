const Parser = require('rss-parser');

const CONFIG = {
  RSS_SOURCES: [
    'https://karelia.news/rss',
    'https://petrozavodsk.info/rss/',
    'https://karelinform.ru/rss.xml'
  ],
  KARELIA_CITIES: [
    'Петрозаводск', 'Кондопога', 'Сортавала', 'Кемь', 'Беломорск',
    'Лоухи', 'Медвежьегорск', 'Сегежа', 'Питкяранта', 'Суоярви',
    'Олонец', 'Пряжа', 'Пудож', 'Лахденпохья'
  ],
  CATEGORIES: {
    politics: ['выборы', 'правительство', 'администрация', 'губернатор', 'депутат', 'закон', 'парламент'],
    crime: ['задержан', 'кража', 'ДТП', 'пожар', 'преступление', 'полиция', 'суд', 'уголовное'],
    culture: ['выставка', 'концерт', 'музей', 'фестиваль', 'театр', 'библиотека', 'кино', 'искусство'],
    economy: ['экономика', 'бизнес', 'инвестиции', 'производство', 'завод', 'предприятие', 'торговля'],
    sports: ['спорт', 'чемпионат', 'матч', 'турнир', 'стадион', 'футбол', 'хоккей', 'лыжи'],
    science: ['наука', 'исследование', 'университет', 'академия', 'лаборатория', 'профессор'],
    accidents: ['авария', 'катастрофа', 'ЧП', 'пожар', 'утечка', 'обрушение', 'аварийные'],
    infrastructure: ['дорога', 'ремонт', 'теплотрасса', 'светофор', 'мост', 'трубопровод', 'электросети']
  },
  MAX_NEWS_AGE: 7 * 24 * 60 * 60 * 1000,
  CITY_COORDS: {
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
  }
};

function isKareliaNews(text) {
  const lower = text.toLowerCase();
  return CONFIG.KARELIA_CITIES.some(city => 
    lower.includes(city.toLowerCase())
  );
}

function classifyNews(text) {
  const lower = text.toLowerCase();
  for (const [cat, keywords] of Object.entries(CONFIG.CATEGORIES)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return cat;
    }
  }
  return 'other';
}

function getCityFromText(text) {
  const lower = text.toLowerCase();
  for (const city of CONFIG.KARELIA_CITIES) {
    if (lower.includes(city.toLowerCase())) {
      return city;
    }
  }
  return 'Петрозаводск';
}

let cachedNews = [];
let lastFetch = 0;

async function fetchAndProcessNews() {
  const now = Date.now();
  if (now - lastFetch < 4 * 60 * 1000 && cachedNews.length > 0) {
    return cachedNews;
  }

  const parser = new Parser();
  let allNews = [];

  for (const url of CONFIG.RSS_SOURCES) {
    try {
      const feed = await parser.parseURL(url);
      for (const item of feed.items || []) {
        const fullText = (item.title || '') + ' ' + (item.contentSnippet || item.content || '');
        if (!isKareliaNews(fullText)) continue;

        const city = getCityFromText(fullText);
        const coords = CONFIG.CITY_COORDS[city] || CONFIG.CITY_COORDS['Петрозаводск'];
        const pubDate = new Date(item.pubDate || item.isoDate || Date.now());
        const age = now - pubDate.getTime();
        if (age > CONFIG.MAX_NEWS_AGE) continue;

        allNews.push({
          title: item.title || 'Без заголовка',
          description: item.contentSnippet || item.content || '',
          link: item.link || '#',
          pubDate: pubDate.toISOString(),
          location: city,
          lon: coords.lon,
          lat: coords.lat,
          category: classifyNews(fullText)
        });
      }
    } catch (e) {
      console.error(`Ошибка при парсинге ${url}:`, e.message);
    }
  }

  const seen = new Set();
  cachedNews = allNews.filter(item => {
    if (seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });

  lastFetch = now;
  return cachedNews;
}

module.exports = { fetchAndProcessNews };