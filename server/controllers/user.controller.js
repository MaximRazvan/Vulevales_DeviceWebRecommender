const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const pool = require('../config/database');
const { sendJSON, parseBody } = require('../utils');

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_12345';

// TODO: Aceasta configurare poate fi mutata in server/services/email.service.js
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'razvanmaxim3@gmail.com',
        pass: process.env.EMAIL_PASS || 'pquq zost lruw aoly'
    }
});

/**
 * Controller pentru inregistrarea unui utilizator nou.
 * POST /api/register
 */
async function registerUser(req, res) {
    try {
        const { username, password, email } = await parseBody(req);

        // Validari
        if (!username || !password || !email) {
            return sendJSON(res, { message: 'Numele de utilizator, parola si emailul sunt obligatorii.' }, 400);
        }
        if (password.length < 6) {
             return sendJSON(res, { message: 'Parola trebuie sa aiba minim 6 caractere.' }, 400);
        }
        if (!/\S+@\S+\.\S+/.test(email)) {
            return sendJSON(res, { message: 'Format email invalid.' }, 400);
        }

        const userCheck = await pool.query('SELECT * FROM users WHERE username = $1 OR email = $2', [username, email]);
        if (userCheck.rows.length > 0) {
            return sendJSON(res, { message: 'Numele de utilizator sau emailul exista deja.' }, 409);
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const result = await pool.query(
            'INSERT INTO users (username, password_hash, email, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
            [username, passwordHash, email.toLowerCase(), 'user']
        );
        
        const newUser = result.rows[0];
        
        // AICI A FOST CORECTATA EROAREA (era 'lqslter' in loc de 'transporter')
        transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: newUser.email,
            subject: 'Contul tau a fost creat cu succes!',
            html: `<p>Salut, ${newUser.username}! Contul tau a fost creat cu succes.</p>`
        }).catch(err => console.error("Failed to send email:", err));

        sendJSON(res, { message: 'Utilizator înregistrat cu succes!', user: newUser }, 201);

    } catch (error) {
        console.error('Eroare la înregistrarea utilizatorului:', error);
        sendJSON(res, { message: 'Eroare de server la înregistrare.' }, 500);
    }
}

/**
 * Controller pentru conectarea unui utilizator.
 * POST /api/login
 */
async function loginUser(req, res) {
    try {
        const { username, password } = await parseBody(req);

        if (!username || !password) {
            return sendJSON(res, { message: 'Numele de utilizator si parola sunt obligatorii.' }, 400);
        }

        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];

        if (!user) {
            return sendJSON(res, { message: 'Nume de utilizator sau parola incorecte.' }, 401);
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return sendJSON(res, { message: 'Nume de utilizator sau parola incorecte.' }, 401);
        }

        const token = jwt.sign(
            { userId: user.id, role: user.role },
            JWT_SECRET,
            { expiresIn: '1h' } // Am marit durata de viata a token-ului la 1 ora
        );

        sendJSON(res, { message: 'Conectat cu succes!', token, role: user.role, username: user.username });

    } catch (error) {
        console.error('Eroare la conectarea utilizatorului:', error);
        sendJSON(res, { message: 'Eroare de server la conectare.' }, 500);
    }
}

module.exports = {
    registerUser,
    loginUser,
};