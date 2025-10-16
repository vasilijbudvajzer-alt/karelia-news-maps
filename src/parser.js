const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');

// === ИСТОЧНИКИ ===
const RSS_SOURCES = [
  'https://karelia.news/rss',
  'https://ria.ru/export/rss2/archive/index.xml',
  'https://tass.ru/rss/v2.xml',
  'https://www.bezformata.com/rss/region/10',
  'https://tv-karelia.ru/feed/',
  'https://rk.karelia.ru/feed/'
];

const HTML_SOURCES = [
  { url: 'https://ptzgovorit.ru/', name: 'ptzgovorit' },
  { url: 'https://karelinform.ru/', name: 'karelinform' }
];

const TELEGRAM_SOURCES = [
  { url: 'https://t.me/s/gorodskoyadmin', name: 'gorodskoyadmin' },
  { url: 'https://t.me/s/tvojakarelia', name: 'tvojakarelia' },
  { url: 'https://t.me/s/novostikarelia', name: 'novostikarelia' }
];

// === ГЕО-ОБЪЕКТЫ ПЕТРОЗАВОДСКА ===
const PETROZAVODSK_PLACES = {
  // Политика
  'правительство': { lon: 34.3431, lat: 61.7851 },
  'администрация': { lon: 34.3431, lat: 61.7851 },
  'госсобрание': { lon: 34.3425, lat: 61.7860 },
  'парламент': { lon: 34.3425, lat: 61.7860 },
  // Культура
  'театр': { lon: 34.3490, lat: 61.7820 },
  'драмтеатр': { lon: 34.3490, lat: 61.7820 },
  'музей': { lon: 34.3510, lat: 61.7835 },
  'галерея': { lon: 34.3510, lat: 61.7835 },
  'библиотека': { lon: 34.3470, lat: 61.7880 },
  'консерватория': { lon: 34.3450, lat: 61.7900 },
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

// === КОНТЕКСТНАЯ КЛАССИФИКАЦИЯ ===
function classifyNews(text) {
  const lower = text.toLowerCase();

  // Политика
  if (/выборы|правительство|администрация|губернатор|депутат|закон|парламент|госсобрание|мэрия/.test(lower)) return 'politics';
  // Преступления
  if (/задержан|кража|ДТП|пожар|преступление|полиция|суд|уголовное|мошенничество/.test(lower)) return 'crime';
  // Культура
  if (/выставка|концерт|музей|фестиваль|театр|библиотека|кино|искусство|галерея/.test(lower)) return 'culture';
  // Экономика
  if (/экономика|бизнес|инвестиции|производство|завод|предприятие|торговля|бюджет/.test(lower)) return 'economy';
  // Спорт
  if (/спорт|чемпионат|матч|турнир|стадион|футбол|хоккей|лыжи|арена/.test(lower)) return 'sports';
  // Наука
  if (/наука|исследование|университет|академия|лаборатория|профессор|карнц/.test(lower)) return 'science';
  // Аварии
  if (/авария|катастрофа|ЧП|утечка|обрушение|аварийные|инцидент/.test(lower)) return 'accidents';
  // Инфраструктура
  if (/дорога|ремонт|теплотрасса|светофор|мост|трубопровод|электросети|вокзал/.test(lower)) return 'infrastructure';

  return 'other';
}

// === ГЕОПРИВЯЗКА ===
function getCoordinates(text, city) {
  const lower = text.toLowerCase();

  // Для Петрозаводска — ищем объекты
  if (city === 'Петрозаводск') {
    for (const [place, coords] of Object.entries(PETROZAVODSK_PLACES)) {
      if (lower.includes(place)) {
        return { ...coords };
      }
    }
  }

  // Fallback — центр города
  return CITY_COORDS[city] || CITY_COORDS['Петрозаводск'];
}

// === ПАРСИНГ ===
async function parseRSS(url) { /* ... как раньше ... */ }
async function parseHTML({ url, name }) { /* ... как раньше ... */ }

// === ОСНОВНАЯ ФУНКЦИЯ ===
let cachedNews = [];
let lastFetch = 0;

async function fetchAndProcessNews() {
  const now = Date.now();
  if (now - lastFetch < 4 * 60 * 1000 && cachedNews.length > 0) return cachedNews;

  const allNews = [];
  // ... парсинг RSS, HTML, Telegram ...

  // После сбора всех новостей:
  const uniqueNews = /* дедупликация */;

  // Улучшенная геопривязка
  uniqueNews.forEach(news => {
    const city = extractCity(news.title + ' ' + news.description);
    const coords = getCoordinates(news.title + ' ' + news.description, city);
    news.lon = coords.lon;
    news.lat = coords.lat;
    news.category = classifyNews(news.title + ' ' + news.description);
  });

  cachedNews = uniqueNews;
  lastFetch = now;
  return cachedNews;
}

// extractCity, isKareliaRelevant — как раньше

module.exports = { fetchAndProcessNews };