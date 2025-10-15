const Parser = require('rss-parser');
const axios = require('axios');

// === КОНФИГУРАЦИЯ ===
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
  },
  MAX_NEWS_AGE: 7 * 24 * 60 * 60 * 1000,
  HUGGINGFACE_API_URL: 'https://api-inference.huggingface.co/models/alexander-pyshkin/russian-news-classifier'
};

// Кэш для геокодирования улиц
const streetCache = new Map();

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

function isKareliaNews(text) {
  const lower = text.toLowerCase();
  return CONFIG.KARELIA_CITIES.some(city => 
    lower.includes(city.toLowerCase())
  );
}

function extractCity(text) {
  const lower = text.toLowerCase();
  for (const city of CONFIG.KARELIA_CITIES) {
    if (lower.includes(city.toLowerCase())) {
      return city;
    }
  }
  return 'Петрозаводск';
}

// Геокодирование улицы в Петрозаводске через Nominatim
async function geocodeStreet(street) {
  if (streetCache.has(street)) {
    return streetCache.get(street);
  }

  try {
    const query = `${street}, Петрозаводск, Республика Карелия`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1`;
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'KareliaNewsMap/1.0 (your-email@example.com)' }
    });

    if (res.data && res.data.length > 0) {
      const first = res.data[0];
      if (first.address && first.address.city === 'Petrozavodsk') {
        const coords = { lon: parseFloat(first.lon), lat: parseFloat(first.lat) };
        streetCache.set(street, coords);
        await new Promise(r => setTimeout(r, 1100)); // лимит Nominatim
        return coords;
      }
    }
  } catch (e) {
    console.warn(`Geocoding failed for street: ${street}`, e.message);
  }

  return null;
}

// Извлечение улицы из текста
function extractStreet(text) {
  const match = text.match(/(?:улиц[аы]|ул\.?|проспект|пр\.?|бульвар|б\.?|переулок|пер\.?)\s+([А-ЯЁ][а-яё\s\-]+)/i);
  return match ? match[1].trim() : null;
}

// Классификация через AI + fallback
async function classifyWithAI(text) {
  if (!text || text.length < 20) return 'other';

  try {
    const payload = { inputs: text.substring(0, 512) };
    const response = await axios.post(CONFIG.HUGGINGFACE_API_URL, payload, { timeout: 10000 });
    const result = response.data;

    if (Array.isArray(result) && result.length > 0) {
      const labelMap = {
        'Политика': 'politics',
        'Преступность': 'crime',
        'Культура': 'culture',
        'Экономика': 'economy',
        'Спорт': 'sports',
        'Наука': 'science',
        'Аварии': 'accidents',
        'Инфраструктура': 'infrastructure'
      };
      return labelMap[result[0].label] || 'other';
    }
  } catch (e) {
    console.warn('AI classification failed, using fallback:', e.message);
  }

  // Fallback на ключевые слова
  const lower = text.toLowerCase();
  const CATEGORIES = {
    politics: ['выборы', 'правительство', 'администрация', 'губернатор', 'депутат', 'закон'],
    crime: ['задержан', 'кража', 'ДТП', 'пожар', 'преступление', 'полиция', 'суд'],
    culture: ['выставка', 'концерт', 'музей', 'фестиваль', 'театр', 'библиотека'],
    economy: ['экономика', 'бизнес', 'инвестиции', 'производство', 'завод'],
    sports: ['спорт', 'чемпионат', 'матч', 'турнир', 'стадион', 'футбол', 'хоккей'],
    science: ['наука', 'исследование', 'университет', 'академия', 'лаборатория'],
    accidents: ['авария', 'катастрофа', 'ЧП', 'утечка', 'обрушение'],
    infrastructure: ['дорога', 'ремонт', 'теплотрасса', 'светофор', 'мост']
  };

  for (const [cat, keywords] of Object.entries(CATEGORIES)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return cat;
    }
  }
  return 'other';
}

// === ОСНОВНАЯ ФУНКЦИЯ ===
let cachedNews = [];
let lastFetch = 0;

async function fetchAndProcessNews() {
  const now = Date.now();
  if (now - lastFetch < 3 * 60 * 1000 && cachedNews.length > 0) {
    return cachedNews;
  }

  const parser = new Parser();
  const allNews = [];

  for (const url of CONFIG.RSS_SOURCES) {
    try {
      console.log(`✅ Парсинг: ${url}`);
      const feed = await parser.parseURL(url);
      let count = 0;
      for (const item of feed.items || []) {
        if (!item.title || !item.link) continue;

        const fullText = (item.title + ' ' + (item.contentSnippet || item.content || '')).trim();
        if (!isKareliaNews(fullText)) continue;

        const pubDate = new Date(item.pubDate || item.isoDate || Date.now());
        if (isNaN(pubDate.getTime()) || now - pubDate.getTime() > CONFIG.MAX_NEWS_AGE) continue;

        const city = extractCity(fullText);
        let coords = CONFIG.CITY_COORDS[city] || CONFIG.CITY_COORDS['Петрозаводск'];

        if (city === 'Петрозаводск') {
          const street = extractStreet(fullText);
          if (street) {
            const streetCoords = await geocodeStreet(street);
            if (streetCoords) coords = streetCoords;
          }
        }

        const category = await classifyWithAI(fullText);

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
        count++;
      }
      console.log(`  → Найдено новостей: ${count}`);
    } catch (e) {
      console.error(`❌ Ошибка при парсинге ${url}:`, e.message);
    }
  }

  // Дедупликация
  const seen = new Set();
  const uniqueNews = allNews.filter(item => {
    const key = `${item.link}|${item.title}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  cachedNews = uniqueNews;
  lastFetch = now;
  console.log(`📤 Отправлено ${cachedNews.length} новостей`);
  return cachedNews;
}

module.exports = { fetchAndProcessNews };