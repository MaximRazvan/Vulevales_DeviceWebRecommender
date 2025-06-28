const userController = require('../controllers/user.controller');

module.exports = {
    '/api/register': {
        POST: userController.registerUser
    },
    '/api/login': {
        POST: userController.loginUser
    },
};