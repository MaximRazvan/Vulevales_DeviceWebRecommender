const pool = require('../config/database');
const { sendJSON, parseBody } = require('../utils');

/**
 * Controller pentru a lista produsele favorite ale unui utilizator.
 * GET /api/favorites
 */
async function listFavorites(req, res) {
    const userId = req.user.userId; 

    try {
        const { rows } = await pool.query(
            `SELECT p.id, p.name, p.price, p.type, p.features, p.image, p.site_name
             FROM products p JOIN user_favorites uf ON p.id = uf.product_id
             WHERE uf.user_id = $1 ORDER BY uf.favorited_at DESC`,
            [userId]
        );
        sendJSON(res, rows);
    } catch (error) {
        console.error('Eroare la preluarea listei de favorite:', error);
        sendJSON(res, { message: 'Eroare de server la preluarea favoritelor.' }, 500);
    }
}

/**
 * Controller pentru a adauga un produs la favorite.
 * POST /api/favorites
 */
async function addFavorite(req, res) {
    const userId = req.user.userId;
    try {
        const { productId } = await parseBody(req);
        if (!productId) {
            return sendJSON(res, { message: 'ID-ul produsului este obligatoriu.' }, 400);
        }

        const result = await pool.query(
            'INSERT INTO user_favorites (user_id, product_id) VALUES ($1, $2) ON CONFLICT (user_id, product_id) DO NOTHING RETURNING *',
            [userId, productId]
        );

        if (result.rowCount > 0) {
            await pool.query('UPDATE products SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = $1', [productId]);
            sendJSON(res, { message: 'Produs adaugat la favorite!' }, 201);
        } else {
            sendJSON(res, { message: 'Produsul este deja în favorite.' }, 409);
        }
    } catch (error) {
        console.error('Eroare la adaugarea la favorite:', error);
        sendJSON(res, { message: 'Eroare de server la adaugarea la favorite.' }, 500);
    }
}

/**
 * Controller pentru a sterge un produs din favorite.
 * DELETE /api/favorites/:id
 */
async function removeFavorite(req, res) {
    const userId = req.user.userId;
    const productId = req.params.id; // ID-ul vine din URL

    try {
        const result = await pool.query(
            'DELETE FROM user_favorites WHERE user_id = $1 AND product_id = $2 RETURNING *',
            [userId, productId]
        );

        if (result.rowCount > 0) {
            await pool.query('UPDATE products SET likes_count = GREATEST(0, COALESCE(likes_count, 0) - 1) WHERE id = $1', [productId]);
            sendJSON(res, { message: 'Produs eliminat din favorite!' });
        } else {
            sendJSON(res, { message: 'Produsul nu a fost gasit în favorite.' }, 404);
        }
    } catch (error) {
        console.error('Eroare la eliminarea din favorite:', error);
        sendJSON(res, { message: 'Eroare de server la eliminarea din favorite.' }, 500);
    }
}


module.exports = { listFavorites, addFavorite, removeFavorite };