const fs = require('fs');
const path = require('path');

/**
 * Trimite un raspuns JSON standardizat.
 */
function sendJSON(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

/**
 * Parseaza body-ul unei cereri HTTP in format JSON.
 */
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}

/**
 * Serveste fisiere statice din directorul 'public'.
 */
function serveStatic(res, pathname) {
    // Construieste calea corecta catre directorul 'public', indiferent de unde este rulat scriptul
    const publicFolderPath = path.join(__dirname, '..', 'public');

    // Daca se cere radacina ('/'), servim 'index.html'
    let safePath = pathname === '/' ? '/index.html' : pathname;

    // Prevenim atacuri de tip 'directory traversal'
    const finalPath = path.join(publicFolderPath, path.normalize(safePath).replace(/^(\.\.[\/\\])+/, ''));

    fs.readFile(finalPath, (err, data) => {
        if (err) {
            console.error(`EROARE la servire fisier static: ${finalPath}. Motiv: ${err.message}`);
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        } else {
            const ext = path.extname(finalPath).toLowerCase();
            const contentType = {
                '.html': 'text/html',
                '.css': 'text/css',
                '.js': 'application/javascript',
                '.ico': 'image/x-icon',
                '.jpg': 'image/jpeg',
            }[ext] || 'application/octet-stream';

            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        }
    });
}

module.exports = {
    sendJSON,
    parseBody,
    serveStatic,
};