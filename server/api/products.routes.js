const productController = require('../controllers/product.controller');
const { authenticateToken, isAdmin } = require('../middleware/auth.middleware');

module.exports = {
    '/api/recommendations': { 
        GET: productController.getRecommendations 
    },
    '/api/products/:id': { 
        GET: productController.getProductById 
    },
    '/api/popular': {
        GET: productController.getPopularProducts
    },
    '/api/sites': {
        GET: productController.getDistinctSites
    },
    '/api/products': {
        // Asigura-te ca aici este 'createProduct', nu 'create'
        POST: [authenticateToken, isAdmin, productController.createProduct]
    },
     '/api/products/:id': {
        GET: productController.getProductById,
        // Adaugam metoda PUT, protejata de aceleasi middleware-uri ca DELETE si POST
        PUT: [authenticateToken, isAdmin, productController.updateProduct],
        DELETE: [authenticateToken, isAdmin, productController.deleteProduct]
    },
};
