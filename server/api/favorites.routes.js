const favoriteController = require('../controllers/favorite.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

module.exports = {
    '/api/favorites': {
        // Aici folosim paranteze drepte pentru a crea un array
        GET: [authenticateToken, favoriteController.listFavorites],
        POST: [authenticateToken, favoriteController.addFavorite]
    },
    '/api/favorites/:id': {
        // Si aici folosim paranteze drepte
        DELETE: [authenticateToken, favoriteController.removeFavorite]
    }
};