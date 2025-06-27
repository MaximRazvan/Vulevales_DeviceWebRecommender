const url = require('url');

const productRoutes = require('./products.routes.js');
const userRoutes = require('./users.routes.js');
const favoriteRoutes = require('./favorites.routes.js');
const feedRoutes = require('./feed.routes.js');

const allRoutes = {
    ...productRoutes, ...userRoutes, ...favoriteRoutes, ...feedRoutes
};

const dynamicRoutes = Object.keys(allRoutes)
    .filter(route => route.includes(':'))
    .map(route => {
        const paramNames = [];
        const regex = new RegExp('^' + route.replace(/:(\w+)/g, (_, paramName) => {
            paramNames.push(paramName); return '([^\\/]+)';
        }) + '$');
        return { originalPath: route, regex, paramNames };
    });

function findMatchingRoute(pathname) {
    if (allRoutes[pathname]) {
        return { handler: allRoutes[pathname], params: {} };
    }
    for (const route of dynamicRoutes) {
        const match = pathname.match(route.regex);
        if (match) {
            const params = {};
            route.paramNames.forEach((name, index) => {
                params[name] = match[index + 1];
            });
            return { handler: allRoutes[route.originalPath], params };
        }
    }
    return null;
}

function router(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const { pathname } = parsedUrl;
    const match = findMatchingRoute(pathname);

    if (!match || !match.handler[req.method]) {
        return res.writeHead(404, { 'Content-Type': 'application/json' })
                  .end(JSON.stringify({ message: `Endpoint not found.` }));
    }

    req.params = match.params;
    req.query = parsedUrl.query;

    const handlers = Array.isArray(match.handler[req.method])
        ? match.handler[req.method]
        : [match.handler[req.method]];

    let i = 0;
    function next() {
        if (i < handlers.length) {
            const handler = handlers[i];
            i++;
            if (typeof handler !== 'function') {
                // Adaugam o verificare suplimentara pentru a prinde eroarea mai devreme
                console.error(`EROARE CRITICA: Handler-ul pentru ruta ${req.method} ${pathname} nu este o functie. Valoare:`, handler);
                return res.writeHead(500).end('Internal Server Error: Invalid handler configuration.');
            }
            handler(req, res, next);
        }
    }
    next();
}

module.exports = router;