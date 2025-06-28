const http = require('http');
const url = require('url');
const apiRouter = require('./api/router');
const { serveStatic } = require('./utils');

const PORT = process.env.PORT || 3000;

http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url);
    const pathname = parsedUrl.pathname;

    // Setam headerele CORS pentru TOATE raspunsurile
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Raspundem la cererile pre-flight CORS
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    // Daca este o cerere catre API, o trimitem la router-ul de API
    if (pathname.startsWith('/api/') || pathname === '/rss') {
        return apiRouter(req, res);
    }
    
    // DACA NU ESTE O CERERE API, O TRATAM CA O CERERE PENTRU UN FISIER STATIC
    // Functia 'serveStatic' va gestiona tot (HTML, CSS, JS, imagini etc.)
    serveStatic(res, pathname);

}).listen(PORT, () => console.log(`Server pornit pe http://localhost:${PORT}`));