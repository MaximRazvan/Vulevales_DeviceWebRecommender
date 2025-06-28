const jwt = require('jsonwebtoken');
const { sendJSON } = require('../utils');
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_12345';

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return sendJSON(res, { message: 'Acces refuzat.' }, 401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return sendJSON(res, { message: 'Token invalid.' }, 403);
        req.user = user;
        next();
    });
}

function isAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return sendJSON(res, { message: 'Acces interzis. Doar administratorii pot efectua aceasta actiune.' }, 403);
    }
    next();
}

module.exports = {
    authenticateToken,
    isAdmin
};