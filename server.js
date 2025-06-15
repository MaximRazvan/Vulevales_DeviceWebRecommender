// server.js
const express = require('express');
const cors = require('cors');
const RSS = require('rss');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static('public'));

const devices = [
  {
    name: 'iPhone 14',
    price: 5000,
    batteryLife: 20,
    type: 'telefon',
    features: ['5G', 'iOS', 'Face ID']
  },
  {
    name: 'Samsung Galaxy S23',
    price: 4500,
    batteryLife: 24,
    type: 'telefon',
    features: ['Android', '5G', 'AMOLED']
  },
  {
    name: 'DJI Mini 3 Pro',
    price: 3800,
    batteryLife: 30,
    type: 'drona',
    features: ['Drone', 'Camera 4K', 'GPS']
  },
  {
    name: 'Huawei Watch GT 4',
    price: 900,
    batteryLife: 14,
    type: 'ceas',
    features: ['Smartwatch', 'Bluetooth', 'Monitorizare somn']
  },
  {
    name: 'iPad Air',
    price: 3200,
    batteryLife: 10,
    type: 'tableta',
    features: ['iOS', 'Apple Pencil', 'Retina Display']
  }
];

app.get('/api/recommendations', (req, res) => {
  const { q = '', minPrice, maxPrice, batteryLife, deviceType } = req.query;

  const results = devices.filter(d => {
    const matchesQuery =
      q === '' ||
      d.name.toLowerCase().includes(q.toLowerCase()) ||
      d.features.some(f => f.toLowerCase().includes(q.toLowerCase()));

    const matchesMinPrice = !minPrice || d.price >= parseFloat(minPrice);
    const matchesMaxPrice = !maxPrice || d.price <= parseFloat(maxPrice);
    const matchesBattery = !batteryLife || d.batteryLife >= parseFloat(batteryLife);
    const matchesType = !deviceType || d.type === deviceType;

    return matchesQuery && matchesMinPrice && matchesMaxPrice && matchesBattery && matchesType;
  });

  res.json(results);
});

app.get('/rss', (req, res) => {
  const feed = new RSS({
    title: 'Recomandări populare de dispozitive',
    description: 'Cele mai populare dispozitive electronice filtrate',
    feed_url: 'http://localhost:3000/rss',
    site_url: 'http://localhost:3000',
    language: 'ro'
  });

  devices.slice(0, 5).forEach(d => {
    feed.item({
      title: d.name,
      description: `Preț: ${d.price} Lei, Autonomie: ${d.batteryLife}h, Tip: ${d.type}`,
      url: '#',
      date: new Date()
    });
  });

  res.set('Content-Type', 'application/rss+xml');
  res.send(feed.xml({ indent: true }));
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Serverul rulează pe http://localhost:${PORT}`);
});