const feedController = require('../controllers/feed.controller');

module.exports = {
    // Ruta este '/rss', nu '/api/rss', pentru a pastra URL-ul original
    '/rss': {
        GET: feedController.getRssFeed
    }
};