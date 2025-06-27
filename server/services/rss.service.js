const RSS = require('rss');
const pool = require('../config/database');

const PORT = process.env.PORT || 3000;

/**
 * Genereaza un feed RSS cu cele mai populare produse.
 * @returns {Promise<string>} Un promise care se rezolva cu feed-ul in format XML.
 */
async function generateRssFeed() {
    try {
        const feed = new RSS({
            title: 'Top 5 Cele Mai Vizionate Produse',
            description: 'O listă cu cele mai populare 5 produse de pe platformă, ordonate după numărul de vizualizări.',
            feed_url: `http://localhost:${PORT}/rss`,
            site_url: `http://localhost:${PORT}`,
            language: 'ro'
        });

        const queryText = 'SELECT id, name, price, batterylife, type, features, link, created_at, image, site_name, COALESCE(views_count, 0) as views_count FROM products ORDER BY views_count DESC NULLS LAST LIMIT 5';
        const { rows } = await pool.query(queryText);

        rows.forEach(d => {
            feed.item({
                title: `${d.name} (${d.views_count} vizualizări)`,
                description: `Pret: ${d.price} Lei, Tip: ${d.type}, Caracteristici: ${Array.isArray(d.features) ? d.features.join(', ') : 'N/A'}.`,
                url: d.link || `http://localhost:${PORT}/product-details.html?product_id=${d.id}`,
                date: d.created_at || new Date(),
                guid: d.id,
                enclosure: d.image ? { url: d.image } : undefined
            });
        });

        return feed.xml({ indent: true });

    } catch (error) {
        console.error('Eroare la generarea feed-ului RSS din DB:', error);
        // Aruncam eroarea pentru a fi prinsa de controller
        throw new Error('Eroare la generarea feed-ului RSS.');
    }
}

module.exports = {
    generateRssFeed
};