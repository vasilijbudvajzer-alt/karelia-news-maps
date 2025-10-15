const express = require('express');
const path = require('path');
const cors = require('cors');
const { fetchAndProcessNews } = require('./parser');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/news', async (req, res) => {
  try {
    const news = await fetchAndProcessNews();
    res.json(news);
  } catch (error) {
    console.error('Ошибка сервера:', error);
    res.status(500).json({ error: 'Не удалось загрузить новости' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});