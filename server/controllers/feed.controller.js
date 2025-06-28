const rssService = require('../services/rss.service');
const { sendJSON } = require('../utils');

/**
 * Controller pentru a gestiona cererea GET /rss.
 */
async function getRssFeed(req, res) {
    try {
        const xmlFeed = await rssService.generateRssFeed();
        res.writeHead(200, { 'Content-Type': 'application/rss+xml' });
        res.end(xmlFeed);
    } catch (error) {
        // Daca serviciul arunca o eroare, o prindem aici si trimitem un raspuns de eroare.
        sendJSON(res, { message: error.message || 'Eroare de server.' }, 500);
    }
}

module.exports = {
    getRssFeed
};