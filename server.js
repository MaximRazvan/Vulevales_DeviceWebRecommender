// server-no-express.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const RSS = require('rss');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

// Glitch folosește un fișier .env și expune portul prin process.env.PORT
// Asigură-te că ai un fișier .env pe Glitch cu chei ca DB_HOST, DB_PASSWORD etc.
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_12345'; // Folosește o variabilă de mediu pentru securitate

// --- Supabase PostgreSQL Database Configuration (using Environment Variables from .env) ---
const pool = new Pool({
  // !!! IMPORTANT PENTRU GLITCH !!!
  // Creează un fișier numit .env în directorul rădăcină al proiectului tău pe Glitch.
  // Adaugă liniile de mai jos în fișierul .env (înlocuind valorile placeholder):
  // DB_USER=postgres
  // DB_HOST=db.wpbeibnkbpwbnvuaqssj.supabase.co  (SAU ADRESA IPv4 DACĂ IPV6 DĂ ERORI pe Glitch)
  // DB_NAME=postgres
  // DB_PASSWORD=PAROLA_TA_REALA_DE_LA_BazaDeDate_SUPABASE  <--- PAROLA REALĂ!
  // DB_PORT=5432
  // JWT_SECRET=o_cheie_secreta_complexa_si_unica
  // Glitch va încărca automat aceste valori în process.env

  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST,            // Citit din .env (Hostname-ul care se poate rezolva și la IPv6)
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD,        // Citit din .env (NU PUNE PAROLA REALĂ AICI DIRECT ÎN COD!)
  port: process.env.DB_PORT || 5432,

  // Supabase necesită conexiune SSL
  ssl: {
      // Pe Glitch, s-ar putea să fie necesar rejectUnauthorized: false, dar încearcă întâi true sau elimină-l
      // Render cerea false, Glitch ar putea fi diferit. Începe cu false dacă ai probleme.
      rejectUnauthorized: false // Poți încerca true dacă false dă erori legate de certificat
  }

  // LINIA family: 4 A FOST ELIMINATĂ CONFORM CERINȚEI.
  // Librăria pg va încerca acum să folosească IPv6 dacă DNS-ul îl returnează și dacă sistemul de operare permite.
});

// Test database connection
pool.connect((err, client, done) => {
  if (err) {
    console.error('Database connection failed:', err.stack);
    console.error('DB Config used (without password):', {
        user: pool.options.user,
        host: pool.options.host,
        database: pool.options.database,
        port: pool.options.port,
        ssl_rejectUnauthorized: pool.options.ssl.rejectUnauthorized,
        // family: pool.options.family, // Nu va apărea dacă linia e comentată
    });
    console.error('Environment Variables check (password status):', {
        DB_USER_IS_SET: !!process.env.DB_USER,
        DB_HOST_IS_SET: !!process.env.DB_HOST,
        DB_NAME_IS_SET: !!process.env.DB_NAME,
        DB_PASSWORD_IS_SET: !!process.env.DB_PASSWORD, // TRUE if set, FALSE if not
        DB_PORT_IS_SET: !!process.env.DB_PORT,
        JWT_SECRET_IS_SET: !!process.env.JWT_SECRET,
        NODE_ENV: process.env.NODE_ENV,
    });

  } else {
    console.log('Successfully connected to the Supabase PostgreSQL database.');
    client.release();
  }
});

// --- Helper to send JSON responses ---
function sendJSON(res, data, status = 200) {
  if (res.headersSent) {
    console.warn('Attempted to send headers twice!');
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' });
  res.end(JSON.stringify(data));
}

// --- Helper to parse request body for POST/PUT requests ---
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        if (body) {
             resolve(JSON.parse(body));
        } else {
             resolve({});
        }
      } catch (e) {
          console.error("Failed to parse JSON body:", e);
          reject(new Error('Invalid JSON body'));
      }
    });
  });
}

// --- Helper to serve static files ---
function serveStatic(res, filePathRelative) {
   if (res.headersSent) {
        console.warn('Attempted to serve static file after headers sent!');
        return;
    }

   const baseDir = __dirname;
   let fullPath = path.join(baseDir, filePathRelative);

   if (filePathRelative === '/' || filePathRelative === 'index.html') {
        fullPath = path.join(baseDir, 'index.html');
   } else if (filePathRelative === 'product-details.html') {
        fullPath = path.join(baseDir, 'product-details.html');
   } else if (filePathRelative === 'favorites.html') {
        fullPath = path.join(baseDir, 'favorites.html');
   } else {
        fullPath = path.join(baseDir, filePathRelative);
   }


  fs.readFile(fullPath, (err, data) => {
    if (err) {
        console.error(`Error reading file ${fullPath}:`, err.message);
         if (!res.headersSent) {
            res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
            res.end('Not found');
         }
    } else {
         if (!res.headersSent) {
            const ext = path.extname(fullPath);
            const contentType = {
                '.html': 'text/html',
                '.css': 'text/css',
                '.js': 'application/javascript',
                '.json': 'application/json',
                '.ico': 'image/x-icon',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.gif': 'image/gif',
                '.svg': 'image/svg+xml',
                '.webmanifest': 'application/manifest+json'
            }[ext.toLowerCase()] || 'text/plain';
            res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
            res.end(data);
         }
    }
  });
}


// --- Middleware for authenticating JWT tokens ---
function authenticateToken(req, res, callback) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return sendJSON(res, { message: 'Acces refuzat. Niciun token furnizat.' }, 401);
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('Verificarea tokenului a eșuat:', err.message);
      return sendJSON(res, { message: 'Token invalid sau expirat.' }, 403);
    }
    req.user = user;
    callback();
  });
}

// --- NOU: Funcție de scraping exemplu ---
async function scrapeProductPage(productUrl) {
    try {
        const response = await fetch(productUrl);
        const html = await response.text();
        const $ = cheerio.load(html);

        // ACESTA ESTE EXEMPLUL DE SELECTORI.
        // VEI TREBUI SĂ-I MODIFICI ÎN FUNCȚIE DE STRUCTURA HTML A SITE-URILOR PE CARE VREI SĂ LE SCRAPEZI.

        let name = $('h1.page-title').text().trim();
        // Compatibilitate extinsă pentru Optional Chaining
        if (!name) {
             const ogTitleMeta = $('meta[property="og:title"]');
             if (ogTitleMeta.length > 0) {
                 const ogTitleContent = ogTitleMeta.attr('content');
                 if (ogTitleContent) {
                     name = ogTitleContent.trim();
                 }
             }
        }


        let priceText = $('.product-price-now, .product-price span, .price').first().text().trim();
        if (!priceText) { // Fallback if common price selectors fail
            const dataPriceAttrElement = $('[data-price]').first();
            if (dataPriceAttrElement.length > 0) {
                 const dataPriceAttr = dataPriceAttrElement.attr('data-price');
                 if (dataPriceAttr) priceText = dataPriceAttr.trim();
            }
        }

        let price = null;
        if (priceText) {
            const cleanedPriceText = priceText.replace(/[^0-9.,]/g, '').replace(',', '.');
            price = parseFloat(cleanedPriceText);
        }
        price = isNaN(price) ? 0 : price;


        let batteryLife = null;
        $('p, li, span, div, td').each((i, el) => {
            const text = $(el).text().toLowerCase();
            const matchHours = text.match(/(\d+)\s*(ore|h)\b/);
            if (matchHours && matchHours[1]) {
                batteryLife = parseInt(matchHours[1], 10);
                return false;
            }
        });


        const features = [];
        $('.specs-list li, .features-list li, .description-content p, .product-attributes li, .details-section li').each((i, el) => {
            const featureText = $(el).text().trim();
            if (featureText.length > 5 && features.length < 15 && !features.includes(featureText) && !featureText.toLowerCase().includes('specificații generale')) {
                features.push(featureText);
            }
        });
         if (features.length < 5) {
             const pageText = $('body').text().toLowerCase();
             const keywords = ['5g', 'android', 'ios', 'bluetooth', 'wifi', 'gps', 'oled', 'amoled', 'lcd', 'rezistent la apă', 'dual sim', 'camera', 'procesor', 'gb ram', 'gb stocare', 'usb-c', 'nfc', 'jack 3.5mm', 'incarcare wireless'];
             keywords.forEach(keyword => {
                 if (pageText.includes(keyword) && features.length < 15) {
                     const displayKeyword = keyword.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                     if (!features.includes(displayKeyword)) {
                          features.push(displayKeyword);
                     }
                 }
             });
         }


        let type = null;
        const lowerUrl = productUrl.toLowerCase();
        if (lowerUrl.includes('telefon') || lowerUrl.includes('smartphone')) type = 'telefon';
        else if (lowerUrl.includes('tableta') || lowerUrl.includes('tablet')) type = 'tableta';
        else if (lowerUrl.includes('ceas') || lowerUrl.includes('smartwatch') || lowerUrl.includes('watch')) type = 'ceas';
        else if (lowerUrl.includes('drona') || lowerUrl.includes('drone')) type = 'drona';
        else if (lowerUrl.includes('laptop') || lowerUrl.includes('notebook')) type = 'laptop';
        else if (lowerUrl.includes('casti') || lowerUrl.includes('headphones') || lowerUrl.includes('earbuds')) type = 'casti';
        else {
             const lowerName = name ? name.toLowerCase() : '';
             if (lowerName.includes('telefon') || lowerName.includes('smartphone')) type = 'telefon';
             else if (lowerName.includes('tableta') || lowerName.includes('tablet')) type = 'tableta';
             else if (lowerName.includes('ceas') || lowerName.includes('smartwatch') || lowerName.includes('watch')) type = 'ceas';
             else if (lowerName.includes('drona') || lowerName.includes('drone')) type = 'drona';
             else if (lowerName.includes('laptop') || lowerName.includes('notebook')) type = 'laptop';
             else if (lowerName.includes('casti') || lowerName.includes('headphones') || lowerName.includes('earbuds')) type = 'casti';
        }
        type = type || 'necunoscut';

        let imageUrl = $('meta[property="og:image"]').attr('content');
        if (!imageUrl) imageUrl = $('img.product-main-image').attr('src');
        if (!imageUrl) imageUrl = $('img[itemprop="image"]').attr('src');
        if (!imageUrl) imageUrl = $('a.thumbnail img').attr('src');
        if (!imageUrl) imageUrl = $('img[alt*="' + (name || '').substring(0, 15) + '"]').attr('src');

        if (imageUrl && !imageUrl.startsWith('http')) {
            try {
                imageUrl = new URL(imageUrl, productUrl).href;
            } catch (e) {
                console.warn(`Could not resolve relative image URL: ${imageUrl}`);
                imageUrl = null;
            }
        } else if (imageUrl && imageUrl.startsWith('//')) {
             imageUrl = 'http:' + imageUrl;
        }
        if (imageUrl && (imageUrl.length < 15 || imageUrl.includes('data:image'))) {
            imageUrl = null;
        }


        return {
            name: name || 'Produs necunoscut',
            price: price,
            batterylife: batteryLife,
            type: type,
            features: features.length > 0 ? features : ['Caracteristici N/A'],
            link: productUrl,
            image: imageUrl || null
        };

    } catch (error) {
        console.error(`Eroare la scraping URL: ${productUrl}`, error.message);
        return { error: `Scraping failed for ${productUrl}: ${error.message}` };
    }
}


// Create the HTTP server
http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // --- Static File Serving ---
   if (req.method === 'GET' && pathname !== '/rss' && !pathname.startsWith('/api/')) {
      return serveStatic(res, pathname === '/' ? 'index.html' : pathname);
   }


  // --- API Endpoint: Device Recommendations ---
  if (req.method === 'GET' && pathname === '/api/recommendations') {
    const { q = '', minPrice, maxPrice, batteryLife, deviceType } = parsedUrl.query;

    let queryText = 'SELECT id, name, price, batterylife, type, features, link, image FROM products WHERE 1=1';
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
             features: Array.isArray(row.features) ? row.features : (typeof row.features === 'string' ? row.features.split(',').map(f => f.trim()).filter(f => f.length > 0) : [])
         }));
        return sendJSON(res, formattedRows);
    } catch (error) {
        console.error('Error fetching recommendations from DB:', error);
        return sendJSON(res, { message: 'Eroare la preluarea recomandărilor.' }, 500);
    }
  }

  // --- API Endpoint: Get Single Product by ID ---
  const productMatch = pathname.match(/^\/api\/products\/(\d+)$/);
  if (req.method === 'GET' && productMatch) {
    const productId = parseInt(productMatch[1], 10);
    if (isNaN(productId)) {
        return sendJSON(res, { message: 'ID produs invalid.' }, 400);
    }
    try {
        const { rows } = await pool.query('SELECT id, name, price, batterylife, type, features, link, image FROM products WHERE id = $1', [productId]);
        if (rows.length > 0) {
            const product = rows[0];
             product.features = Array.isArray(product.features) ? product.features : (typeof product.features === 'string' ? product.features.split(',').map(f => f.trim()).filter(f => f.length > 0) : []);
            return sendJSON(res, product);
        } else {
            return sendJSON(res, { message: 'Produsul nu a fost găsit.' }, 404);
        }
    } catch (error) {
        console.error(`Error fetching product with ID ${productId} from DB:`, error);
        return sendJSON(res, { message: 'Eroare la preluarea produsului.' }, 500);
    }
  }

  // --- API Endpoint: Add New Product (Admin only) ---
  if (req.method === 'POST' && pathname === '/api/products') {
    return authenticateToken(req, res, async () => {
      if (req.user.role !== 'admin') {
        return sendJSON(res, { message: 'Acces interzis. Doar administratorii pot adăuga produse.' }, 403);
      }

      try {
        const { name, price, batteryLife, type, features, link, image } = await parseBody(req);

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return sendJSON(res, { message: 'Numele produsului este obligatoriu.' }, 400);
        }
         const parsedPrice = parseFloat(price);
         if (isNaN(parsedPrice) || parsedPrice <= 0) {
              return sendJSON(res, { message: 'Prețul produsului trebuie să fie un număr pozitiv valid.' }, 400);
         }
         if (!type || typeof type !== 'string' || type.trim() === '') {
             return sendJSON(res, { message: 'Tipul produsului este obligatoriu.' }, 400);
         }
         const featuresArray = Array.isArray(features)
            ? features.map(f => String(f).trim()).filter(f => f.length > 0)
            : (typeof features === 'string' ? features.split(',').map(f => f.trim()).filter(f => f.length > 0) : []);
         if (featuresArray.length === 0) {
             return sendJSON(res, { message: 'Caracteristicile produsului sunt obligatorii (cel puțin una).' }, 400);
         }
        const parsedBatteryLife = batteryLife ? parseInt(batteryLife, 10) : null;
        const parsedLink = link && typeof link === 'string' && link.trim() !== '' ? link.trim() : null;
        const parsedImage = image && typeof image === 'string' && image.trim() !== '' ? image.trim() : null;

        const result = await pool.query(
          'INSERT INTO products (name, price, batterylife, type, features, link, image) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name',
          [name.trim(), parsedPrice, parsedBatteryLife, type.trim().toLowerCase(), featuresArray, parsedLink, parsedImage]
        );
        return sendJSON(res, { message: 'Produs adăugat cu succes!', product: result.rows[0] }, 201);
      } catch (error) {
        console.error('SERVER ERROR adding product:', error.message, error.stack);
        return sendJSON(res, { message: 'Eroare de server la adăugarea produsului.', error: error.message }, 500);
      }
    });
  }

  // --- API Endpoint: Update Product (Admin only) ---
  const updateProductMatch = pathname.match(/^\/api\/products\/(\d+)$/);
  if (req.method === 'PUT' && updateProductMatch) {
    return authenticateToken(req, res, async () => {
      if (req.user.role !== 'admin') {
        return sendJSON(res, { message: 'Acces interzis. Doar administratorii pot edita produse.' }, 403);
      }

      const productId = parseInt(updateProductMatch[1], 10);
      if (isNaN(productId)) {
        return sendJSON(res, { message: 'ID produs invalid.' }, 400);
      }

      try {
        const { name, price, batteryLife, type, features, link, image } = await parseBody(req);

         if (!name || typeof name !== 'string' || name.trim() === '') {
             return sendJSON(res, { message: 'Numele produsului este obligatoriu.' }, 400);
         }
          const parsedPrice = parseFloat(price);
          if (isNaN(parsedPrice) || parsedPrice <= 0) {
              return sendJSON(res, { message: 'Prețul produsului trebuie să fie un număr pozitiv valid.' }, 400);
          }
          if (!type || typeof type !== 'string' || type.trim() === '') {
              return sendJSON(res, { message: 'Tipul produsului este obligatoriu.' }, 400);
          }
          const featuresArray = Array.isArray(features)
             ? features.map(f => String(f).trim()).filter(f => f.length > 0)
             : (typeof features === 'string' ? features.split(',').map(f => f.trim()).filter(f => f.length > 0) : []);
          if (featuresArray.length === 0) {
              return sendJSON(res, { message: 'Caracteristicile produsului sunt obligatorii (cel puțin una).' }, 400);
          }
         const parsedBatteryLife = batteryLife ? parseInt(batteryLife, 10) : null;
         const parsedLink = link && typeof link === 'string' && link.trim() !== '' ? link.trim() : null;
         const parsedImage = image && typeof image === 'string' && image.trim() !== '' ? image.trim() : null;

        const result = await pool.query(
          'UPDATE products SET name = $1, price = $2, batterylife = $3, type = $4, features = $5, link = $6, image = $7 WHERE id = $8 RETURNING id, name',
          [name.trim(), parsedPrice, parsedBatteryLife, type.trim().toLowerCase(), featuresArray, parsedLink, parsedImage, productId]
        );

        if (result.rows.length > 0) {
          return sendJSON(res, { message: 'Produs actualizat cu succes!', product: result.rows[0] });
        } else {
          return sendJSON(res, { message: 'Produsul nu a fost găsit pentru actualizare.' }, 404);
        }
      } catch (error) {
        console.error('SERVER ERROR updating product:', error.message, error.stack);
         return sendJSON(res, { message: 'Eroare de server la actualizarea produsului.', error: error.message }, 500);
      }
    });
  }

  // --- API Endpoint: Delete Product (Admin only) ---
  const deleteProductMatch = pathname.match(/^\/api\/products\/(\d+)$/);
  if (req.method === 'DELETE' && deleteProductMatch) {
    return authenticateToken(req, res, async () => {
      if (req.user.role !== 'admin') {
        return sendJSON(res, { message: 'Acces interzis. Doar administratorii pot șterge produse.' }, 403);
      }

      const productId = parseInt(deleteProductMatch[1], 10);
      if (isNaN(productId)) {
        return sendJSON(res, { message: 'ID produs invalid.' }, 400);
      }

      try {
        const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING id', [productId]);
        if (result.rows.length > 0) {
          return sendJSON(res, { message: 'Produs șters cu succes!', id: result.rows[0].id });
        } else {
          return sendJSON(res, { message: 'Produsul nu a fost găsit pentru ștergere.' }, 404);
        }
      } catch (error) {
        console.error('SERVER ERROR deleting product:', error.message, error.stack);
        return sendJSON(res, { message: 'Eroare de server la ștergerea produsului.', error: error.message }, 500);
      }
    });
  }

  // --- API Endpoint: Popular Statistics (Placeholder) ---
  if (req.method === 'GET' && pathname === '/api/popular') {
      try {
           const { rows } = await pool.query('SELECT id, name FROM products ORDER BY RANDOM() LIMIT 5');
           const popularItems = rows.map(row => ({ name: row.name, views: Math.floor(Math.random() * 100) + 50 }));

          return sendJSON(res, popularItems);
      } catch (error) {
          console.error('Error fetching popular stats:', error);
          return sendJSON(res, [], 500);
      }
  }


  // --- API Endpoint: RSS Feed ---
  if (req.method === 'GET' && pathname === '/rss') {
    try {
        const { limit } = parsedUrl.query;
        const queryLimit = (limit && parseInt(limit, 10) > 0) ? parseInt(limit, 10) : 100;

        let queryText = 'SELECT id, name, price, batterylife, type, features, link, created_at, image FROM products ORDER BY created_at DESC';
        const queryParams = [];

        if (queryLimit > 0) {
            queryText += ` LIMIT $1`;
            queryParams.push(queryLimit);
        }

        const { rows } = await pool.query(queryText, queryParams);

        const feed = new RSS({
          title: 'Ultimele Recomandări de Dispozitive Electronice',
          description: 'Cele mai recent adăugate dispozitive electronice',
          feed_url: process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL}/rss` : `http://localhost:${PORT}/rss`,
          site_url: process.env.APP_BASE_URL || `http://localhost:${PORT}`,
          language: 'ro'
        });

        rows.forEach(d => {
          const productDetailUrl = process.env.APP_BASE_URL
            ? `${process.env.APP_BASE_URL}/product-details.html?product_id=${d.id}`
            : `http://localhost:${PORT}/product-details.html?product_id=${d.id}`;

          feed.item({
            title: d.name,
            description: `Preț: ${d.price} Lei, Autonomie: ${d.batterylife ? d.batterylife + ' ore' : 'N/A'}, Tip: ${d.type}, Caracteristici: ${Array.isArray(d.features) ? d.features.join(', ') : 'N/A'}`,
            url: d.link && d.link !== 'null' && d.link.trim() !== '' ? d.link : productDetailUrl,
            date: d.created_at || new Date(),
            guid: d.id,
            enclosure: d.image ? { url: d.image, type: 'image/jpeg' } : undefined
          });
        });

        res.writeHead(200, { 'Content-Type': 'application/rss+xml', 'Access-Control-Allow-Origin': '*' });
        return res.end(feed.xml({ indent: true }));
    } catch (error) {
        console.error('Error generating RSS feed from DB:', error);
        return sendJSON(res, { message: 'Eroare la generarea feed-ului RSS.' }, 500);
    }
  }

  // --- API Endpoint: User Registration ---
  if (req.method === 'POST' && pathname === '/api/register') {
    try {
      const { username, password, role } = await parseBody(req);

      if (!username || !password) {
        return sendJSON(res, { message: 'Numele de utilizator și parola sunt obligatorii.', field: 'username' }, 400);
      }

      const minLength = 6;
      const hasUppercase = /[A-Z]/.test(password);
      const hasDigit = /\d/.test(password);

      if (password.length < minLength) {
        return sendJSON(res, { message: `Parola trebuie să aibă minim ${minLength} caractere.`, field: 'password' }, 400);
      }
      if (!hasUppercase) {
        return sendJSON(res, { message: 'Parola trebuie să conțină cel puțin o literă mare.', field: 'password' }, 400);
      }
      if (!hasDigit) {
        return sendJSON(res, { message: 'Parola trebuie să conțină cel puțin o cifră.', field: 'password' }, 400);
      }

      const userCheck = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
      if (userCheck.rows.length > 0) {
        return sendJSON(res, { message: 'Numele de utilizator există deja.', field: 'username' }, 409);
      }

      let finalRole = 'user';
      if (role === 'admin') {
          const adminCheck = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'admin'");
          const adminCount = parseInt(adminCheck.rows[0].count, 10);
          if (adminCount === 0) {
              finalRole = 'admin';
              console.log(`Permitting first user "${username}" to register as admin.`);
          } else {
              console.warn(`Attempted admin registration for "${username}" but admin already exists.`);
              finalRole = 'user';
          }
      } else {
          finalRole = 'user';
      }


      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const result = await pool.query(
        'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role',
        [username, passwordHash, finalRole]
      );

      const newUser = result.rows[0];
      const message = finalRole === 'admin'
        ? 'Utilizator admin înregistrat cu succes! (Sunteți primul admin)'
        : 'Utilizator înregistrat cu succes!';

      return sendJSON(res, { message: message }, 201);


    } catch (error) {
      console.error('Eroare la înregistrarea utilizatorului:', error.message, error.stack);
      if (error.code === '23505') {
          return sendJSON(res, { message: 'Numele de utilizator există deja.', field: 'username' }, 409);
      }
      return sendJSON(res, { message: 'Eroare de server la înregistrare.', error: error.message }, 500);
    }
  }

  // --- API Endpoint: User Login ---
  if (req.method === 'POST' && pathname === '/api/login') {
    try {
      const { username, password } = await parseBody(req);

      if (!username || !password) {
        return sendJSON(res, { message: 'Numele de utilizator și parola sunt obligatorii.' }, 400);
      }

      const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
      const user = result.rows[0];

      if (!user) {
        return sendJSON(res, { message: 'Nume de utilizator sau parolă incorecte.' }, 400);
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);

      if (!isMatch) {
        return sendJSON(res, { message: 'Nume de utilizator sau parolă incorecte.' }, 400);
      }

      const token = jwt.sign(
        { userId: user.id, role: user.role, username: user.username },
        JWT_SECRET,
        { expiresIn: '15m' }
      );

      return sendJSON(res, { message: 'Conectat cu succes!', token, role: user.role, username: user.username });

    } catch (error) {
      console.error('Eroare la conectarea utilizatorului:', error.message, error.stack);
      return sendJSON(res, { message: 'Eroare de server la conectare.', error: error.message }, 500);
    }
  }

  // --- Protected API Endpoint (Example) ---
  if (req.method === 'GET' && pathname === '/api/protected-info') {
    return authenticateToken(req, res, async () => {
      return sendJSON(res, { message: `Bine ai venit, ${req.user.username} (${req.user.role})! Ai accesat informații protejate. ID-ul tău: ${req.user.userId}.` });
    });
  }

  // --- API Endpoint pentru a adăuga un produs la favorite ---
  if (req.method === 'POST' && pathname === '/api/favorites') {
    return authenticateToken(req, res, async () => {
      const { productId } = await parseBody(req);
      const userId = req.user.userId;

      if (!productId) {
        return sendJSON(res, { message: 'ID-ul produsului este obligatoriu.' }, 400);
      }

      try {
        const result = await pool.query(
          'INSERT INTO user_favorites (user_id, product_id) VALUES ($1, $2) ON CONFLICT (user_id, product_id) DO NOTHING RETURNING *',
          [userId, productId]
        );

        if (result.rowCount > 0) {
          return sendJSON(res, { message: 'Produs adăugat la favorite!', productId });
        } else {
          return sendJSON(res, { message: 'Produsul este deja în favorite.' }, 409);
        }
      } catch (error) {
        console.error('Eroare la adăugarea la favorite:', error);
        return sendJSON(res, { message: 'Eroare de server la adăugarea la favorite.', error: error.message }, 500);
      }
    });
  }

  // --- API Endpoint pentru a elimina un produs din favorite ---
  if (req.method === 'DELETE' && pathname.startsWith('/api/favorites/')) {
    const productIdMatch = pathname.match(/\/api\/favorites\/(\d+)$/);
    if (!productIdMatch) {
      return sendJSON(res, { message: 'ID produs favorit invalid.' }, 400);
    }
    const productId = parseInt(productIdMatch[1], 10);

    return authenticateToken(req, res, async () => {
      const userId = req.user.userId;

      try {
        const result = await pool.query(
          'DELETE FROM user_favorites WHERE user_id = $1 AND product_id = $2 RETURNING *',
          [userId, productId]
        );

        if (result.rowCount > 0) {
          return sendJSON(res, { message: 'Produs eliminat din favorite!', productId });
        } else {
          return sendJSON(res, { message: 'Produsul nu a fost găsit în favorite.' }, 404);
        }
      } catch (error) {
        console.error('Eroare la eliminarea din favorite:', error);
        return sendJSON(res, { message: 'Eroare de server la eliminarea din favorite.', error: error.message }, 500);
      }
    });
  }

  // --- API Endpoint pentru a prelua lista de favorite a utilizatorului ---
  if (req.method === 'GET' && pathname === '/api/favorites') {
    return authenticateToken(req, res, async () => {
      const userId = req.user.userId;

      try {
        const { rows } = await pool.query(
          `SELECT p.id, p.name, p.price, p.batterylife, p.type, p.features, p.link, p.image
           FROM products p
           JOIN user_favorites uf ON p.id = uf.product_id
           WHERE uf.user_id = $1
           ORDER BY uf.favorited_at DESC`,
          [userId]
        );
        const formattedRows = rows.map(row => ({
             ...row,
             features: Array.isArray(row.features) ? row.features : (typeof row.features === 'string' ? row.features.split(',').map(f => f.trim()).filter(f => f.length > 0) : [])
        }));
        return sendJSON(res, formattedRows);
      } catch (error) {
        console.error('Eroare la preluarea listei de favorite:', error);
        return sendJSON(res, { message: 'Eroare de server la preluarea favoritelor.', error: error.message }, 500);
      }
    });
  }

  // --- API Endpoint pentru a verifica dacă un produs este în favoritele utilizatorului ---
  if (req.method === 'GET' && pathname.startsWith('/api/favorites/check/')) {
    const productIdMatch = pathname.match(/\/api\/favorites\/check\/(\d+)$/);
    if (!productIdMatch) {
      return sendJSON(res, { message: 'ID produs invalid pentru verificare favorite.' }, 400);
    }
    const productId = parseInt(productIdMatch[1], 10);

    return authenticateToken(req, res, async () => {
      const userId = req.user.userId;

      try {
        const { rows } = await pool.query(
          'SELECT 1 FROM user_favorites WHERE user_id = $1 AND product_id = $2',
          [userId, productId]
        );
        return sendJSON(res, { isFavorited: rows.length > 0 });
      } catch (error) {
        console.error('Eroare la verificarea favoritelor:', error);
        return sendJSON(res, { message: 'Eroare de server la verificarea favoritelor.', error: error.message }, 500);
      }
    });
  }


  // --- NOU: API Endpoint pentru a declanșa scraping-ul (Admin only) ---
  if (req.method === 'POST' && pathname === '/api/scrape-product') {
      return authenticateToken(req, res, async () => {
          if (req.user.role !== 'admin') {
              return sendJSON(res, { message: 'Acces interzis. Doar administratorii pot declanșa scraping-ul.' }, 403);
          }

          const { url: productUrl } = await parseBody(req);

          if (!productUrl || !productUrl.startsWith('http')) {
              return sendJSON(res, { message: 'URL-ul produsului este invalid sau lipsește.' }, 400);
          }

          try {
              const scrapedData = await scrapeProductPage(productUrl);

              if (!scrapedData || scrapedData.error) {
                  return sendJSON(res, { message: scrapedData.error || 'Nu s-au putut extrage suficiente date de pe URL-ul furnizat. Verificați selectorii de scraping sau URL-ul.', details: scrapedData }, 400);
              }

              if (!scrapedData.name || scrapedData.price === null || scrapedData.price <= 0 || !scrapedData.type || scrapedData.features.length === 0) {
                   console.warn('Scraping returned incomplete or invalid data:', scrapedData);
                   return sendJSON(res, { message: 'Datele extrase din URL sunt incomplete (lipsesc nume, preț, tip sau caracteristici) sau invalide.', details: scrapedData }, 400);
              }

              const existingProduct = await pool.query('SELECT id FROM products WHERE link = $1', [productUrl]);
              if (existingProduct.rows.length > 0) {
                  return sendJSON(res, { message: 'Acest produs (cu acest link) există deja în baza de date.', product: existingProduct.rows[0] }, 409);
              }

              const result = await pool.query(
                  'INSERT INTO products (name, price, batterylife, type, features, link, image) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name',
                  [scrapedData.name, scrapedData.price, scrapedData.batterylife, scrapedData.type.toLowerCase(), scrapedData.features, scrapedData.link, scrapedData.image]
              );

              return sendJSON(res, { message: 'Produs scrapuit și adăugat cu succes!', product: result.rows[0] }, 201);

          } catch (error) {
              console.error('SERVER ERROR during scraping/adding product:', error.message, error.stack);
              return sendJSON(res, { message: 'Eroare de server la procesarea cererii de scraping.', error: error.message }, 500);
          }
      });
  }


  // If no route matches
  res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
  res.end('Not found');

}).listen(PORT, () => console.log(`Server fără Express pornit pe http://localhost:${PORT}`));
