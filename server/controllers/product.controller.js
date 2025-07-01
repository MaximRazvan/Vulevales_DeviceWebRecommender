const pool = require('../config/database');
const { sendJSON, parseBody } = require('../utils');

/**
 * Controller pentru a gestiona cererea de recomandari de produse, cu toate filtrele.
 * GET /api/recommendations
 */
async function getRecommendations(req, res) {
    const { q = '', minPrice, maxPrice, batteryLife, deviceType, siteName } = req.query;

    let queryText = 'SELECT id, name, price, batterylife, type, features, link, image, site_name FROM products WHERE 1=1';
    const queryParams = [];
    let paramIndex = 1;

    if (minPrice && parseFloat(minPrice) >= 0) {
        queryText += ` AND price >= $${paramIndex++}`;
        queryParams.push(parseFloat(minPrice));
    }
    if (maxPrice && parseFloat(maxPrice) >= 0) {
        queryText += ` AND price <= $${paramIndex++}`;
        queryParams.push(parseFloat(maxPrice));
    }
    if (batteryLife && parseInt(batteryLife, 10) >= 0) {
        queryText += ` AND batterylife >= $${paramIndex++}`;
        queryParams.push(parseInt(batteryLife, 10));
    }
    if (deviceType) {
        queryText += ` AND type = $${paramIndex++}`;
        queryParams.push(deviceType.toLowerCase());
    }
    if (siteName) {
        queryText += ` AND site_name = $${paramIndex++}`;
        queryParams.push(siteName);
    }
    if (q) {
        const searchTerm = `%${q.toLowerCase()}%`;
        queryText += ` AND (name ILIKE $${paramIndex++} OR EXISTS (SELECT 1 FROM UNNEST(features) AS feature WHERE feature ILIKE $${paramIndex++}) OR type ILIKE $${paramIndex++})`;
        queryParams.push(searchTerm, searchTerm, searchTerm);
    }
    
    queryText += ' ORDER BY id ASC';

    try {
        const { rows } = await pool.query(queryText, queryParams);
        const formattedRows = rows.map(row => ({
            ...row,
            features: Array.isArray(row.features) ? row.features : []
        }));
        sendJSON(res, formattedRows);
    } catch (error) {
        console.error('Error fetching recommendations from DB:', error);
        sendJSON(res, { message: 'Eroare la preluarea Recomandărilor.' }, 500);
    }
}

/**
 * Controller pentru a gasi un produs dupa ID.
 * GET /api/products/:id
 */
async function getProductById(req, res) {
    const productId = req.params.id;
    if (isNaN(parseInt(productId, 10))) {
        return sendJSON(res, { message: 'ID produs invalid.' }, 400);
    }
    try {
        const queryText = `
            SELECT id, name, price, batterylife, type, features, link, image, site_name, 
                   COALESCE(likes_count, 0) as likes_count, 
                   COALESCE(views_count, 0) as views_count 
            FROM products WHERE id = $1
        `;
        const { rows } = await pool.query(queryText, [productId]);
        if (rows.length > 0) {
            await pool.query('UPDATE products SET views_count = COALESCE(views_count, 0) + 1 WHERE id = $1', [productId]);
            sendJSON(res, rows[0]);
        } else {
            sendJSON(res, { message: 'Produsul nu a fost gasit.' }, 404);
        }
    } catch (error) {
        console.error(`Error fetching product with ID ${productId}:`, error);
        sendJSON(res, { message: 'Eroare la preluarea produsului.' }, 500);
    }
}

/**
 * Controller pentru a crea un produs nou (doar admin).
 * POST /api/products
 */
async function createProduct(req, res) {
    try {
        const { name, price, batteryLife, type, features, link, image, siteName } = await parseBody(req);
        if (!name || !price || !type || !features || features.length === 0) {
            return sendJSON(res, { message: 'Campurile Nume, Pret, Tip si Caracteristici sunt obligatorii.' }, 400);
        }
        const result = await pool.query(
            'INSERT INTO products (name, price, batterylife, type, features, link, image, site_name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, name',
            [name, price, batteryLife, type, features, link, image, siteName]
        );
        sendJSON(res, { message: 'Produs adaugat cu succes!', product: result.rows[0] }, 201);
    } catch (error) {
        console.error('SERVER ERROR adding product:', error);
        sendJSON(res, { message: 'Eroare de server la adaugarea produsului.' }, 500);
    }
}

/**
 * Controller pentru a obtine cele mai populare produse.
 * GET /api/popular
 */
async function getPopularProducts(req, res) {
    try {
        const { rows } = await pool.query('SELECT name, COALESCE(likes_count, 0) as likes_count, COALESCE(views_count, 0) as views_count FROM products ORDER BY likes_count DESC, views_count DESC LIMIT 10');
        sendJSON(res, rows);
    } catch (error) {
        console.error('Error fetching popular stats:', error);
        sendJSON(res, { message: 'Eroare la preluarea statisticilor.' }, 500);
    }
}

/**
 * Controller pentru a obtine lista de site-uri unice.
 * GET /api/sites
 */
async function getDistinctSites(req, res) {
    try {
        const { rows } = await pool.query('SELECT DISTINCT site_name FROM products WHERE site_name IS NOT NULL AND site_name <> \'\' ORDER BY site_name');
        const sites = rows.map(row => row.site_name);
        sendJSON(res, sites);
    } catch (error) {
        console.error('Error fetching distinct sites from DB:', error);
        sendJSON(res, { message: 'Eroare la preluarea site-urilor.' }, 500);
    }
}

async function deleteProduct(req, res) {
    const productId = req.params.id;
    try {
        // Stergem mai intai intrarile din user_favorites pentru a nu avea erori de constrangere
        await pool.query('DELETE FROM user_favorites WHERE product_id = $1', [productId]);
        
        const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [productId]);

        if (result.rowCount > 0) {
            sendJSON(res, { message: 'Produs sters cu succes!' });
        } else {
            sendJSON(res, { message: 'Produsul nu a fost gasit pentru stergere.' }, 404);
        }
    } catch (error) {
        console.error(`SERVER ERROR deleting product ID ${productId}:`, error);
        sendJSON(res, { message: 'Eroare de server la stergerea produsului.' }, 500);
    }
}

async function updateProduct(req, res) {
    const productId = req.params.id;
    try {
        const { name, price, batteryLife, type, features, link, image, siteName } = await parseBody(req);
        if (!name || !price || !type || !features || features.length === 0) {
            return sendJSON(res, { message: 'Toate campurile obligatorii trebuie completate.' }, 400);
        }

        const result = await pool.query(
            'UPDATE products SET name = $1, price = $2, batterylife = $3, type = $4, features = $5, link = $6, image = $7, site_name = $8 WHERE id = $9 RETURNING id',
            [name, price, batteryLife, type, features, link, image, siteName, productId]
        );

        if (result.rowCount > 0) {
            sendJSON(res, { message: 'Produs actualizat cu succes!', product: result.rows[0] });
        } else {
            sendJSON(res, { message: 'Produsul nu a fost gasit pentru actualizare.' }, 404);
        }
    } catch (error) {
        console.error(`SERVER ERROR updating product ID ${productId}:`, error);
        sendJSON(res, { message: 'Eroare de server la actualizarea produsului.' }, 500);
    }
}

// Exportam TOATE functiile necesare
module.exports = {
    getRecommendations,
    getProductById,
    createProduct,
    getPopularProducts,
    getDistinctSites,
    deleteProduct,
    updateProduct, // <-- Asigura-te ca aceasta linie exista
};