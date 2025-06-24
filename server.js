// server-no-express.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const RSS = require('rss');

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_12345'; // Secret JWT - SCHIMBĂ ASTA ÎNTR-O CHEIE UNICĂ ȘI SIGURĂ ÎN PRODUCȚIE!

// --- PostgreSQL Database Configuration ---
const pool = new Pool({
  user: 'postgres', // IMPORTANT: Change this to your PostgreSQL username
  host: 'localhost',
  database: 'DeW',
  password: 'admin', // IMPORTANT: Change this to your PostgreSQL password
  port: 5432,
});

// Test database connection
pool.connect((err, client, done) => {
  if (err) {
    console.error('Database connection failed:', err.stack);
  } else {
    console.log('Successfully connected to the PostgreSQL database.');
    client.release(); // Release the client back to the pool
  }
});

// --- Helper to send JSON responses ---
function sendJSON(res, data, status = 200) {
  // Adăugăm o verificare pentru a preveni trimiterea headers-urilor dacă au fost deja trimise
  if (res.headersSent) {
    console.warn('Attempted to send headers twice!');
    return; // Oprește execuția funcției dacă headers-urile au fost trimise
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
        if (body) { // Check if body is not empty
             resolve(JSON.parse(body));
        } else {
             resolve({}); // Resolve with empty object if no body
        }
      } catch (e) {
          console.error("Failed to parse JSON body:", e);
          reject(new Error('Invalid JSON body'));
      }
    });
  });
}

// --- Helper to serve static files from 'public' directory ---
function serveStatic(res, pathname) {
  // Dacă headers-urile au fost deja trimise, nu continua
   if (res.headersSent) {
        console.warn('Attempted to serve static file after headers sent!');
        return;
    }

  // Determine the file to serve based on the pathname
  let filePath;
  if (pathname === '/') {
      filePath = path.join(__dirname, 'index.html'); // Serve index.html for the root
  } else if (pathname === '/product-details.html') {
      filePath = path.join(__dirname, 'product-details.html'); // Serve product-details.html
  } else if (pathname === '/favorites.html') { // NOU: Ruta pentru pagina de favorite
      filePath = path.join(__dirname, 'favorites.html');
  } else {
       // For other paths, try serving from 'public' directory
       filePath = path.join(__dirname, 'public', pathname);
       // Check if the file exists in the root directory as a fallback for some assets
       const rootFallbackPath = path.join(__dirname, pathname);
        if (!fs.existsSync(filePath) && fs.existsSync(rootFallbackPath)) {
             filePath = rootFallbackPath;
        }
  }

    const finalPath = filePath;

  fs.readFile(finalPath, (err, data) => {
    if (err) {
        console.error(`Error reading file ${finalPath}:`, err.message);
         if (!res.headersSent) {
            res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
            res.end('Not found');
         }
    } else {
         if (!res.headersSent) { 
            const ext = path.extname(finalPath);
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
            }[ext] || 'text/plain';
            res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
            res.end(data);
         }
    }
  });
}


// --- Middleware for authenticating JWT tokens ---
function authenticateToken(req, res, callback) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

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

// Create the HTTP server
http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;

  // Handle CORS preflight requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.writeHead(204); // No content
    return res.end();
  }

  // --- Static File Serving ---
  if (req.method === 'GET' && !pathname.startsWith('/api') && pathname !== '/rss') {
      // NOU: Includem si favorites.html aici
      if (pathname === '/' || pathname === '/index.html' || pathname === '/product-details.html' || pathname === '/favorites.html') {
          return serveStatic(res, pathname);
      }
      return serveStatic(res, pathname);
  }


  // --- API Endpoint: Device Recommendations (now fetches from DB) ---
  if (req.method === 'GET' && pathname === '/api/recommendations') {
    const { q = '', minPrice, maxPrice, batteryLife, deviceType } = parsedUrl.query;

    let queryText = 'SELECT id, name, price, batterylife, type, features, link FROM products WHERE 1=1';
    const queryParams = [];
    let paramIndex = 1;

    if (minPrice) {
        queryText += ` AND price >= $${paramIndex++}`;
        queryParams.push(parseFloat(minPrice));
    }
    if (maxPrice) {
        queryText += ` AND price <= $${paramIndex++}`;
        queryParams.push(parseFloat(maxPrice));
    }
    if (batteryLife) {
        if (batteryLife > 0) {
             queryText += ` AND batterylife >= $${paramIndex++}`; 
             queryParams.push(parseFloat(batteryLife)); 
        } else if (batteryLife === '0') {
             queryText += ` AND batterylife = 0`; 
        }
    }
    if (deviceType) {
        queryText += ` AND type = $${paramIndex++}`;
        queryParams.push(deviceType);
    }

    if (q) {
        const searchTerm = `%${q.toLowerCase()}%`;
        queryText += ` AND (name ILIKE $${paramIndex++} OR EXISTS (SELECT 1 FROM UNNEST(features) AS feature WHERE feature ILIKE $${paramIndex++}))`;
        queryParams.push(searchTerm, searchTerm);
    }

    queryText += ' ORDER BY id ASC'; 

    try {
        const { rows } = await pool.query(queryText, queryParams);
        return sendJSON(res, rows);
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
        const { rows } = await pool.query('SELECT id, name, price, batterylife, type, features, link FROM products WHERE id = $1', [productId]);
        if (rows.length > 0) {
            return sendJSON(res, rows[0]);
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
        const { name, price, batteryLife, type, features, link } = await parseBody(req);
        console.log('Parsed product data for insertion:', { name, price, batteryLife, type, features, link });

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


        const result = await pool.query(
          'INSERT INTO products (name, price, batterylife, type, features, link) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name',
          [name.trim(), parsedPrice, parsedBatteryLife, type.trim(), featuresArray, parsedLink]
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
        const { name, price, batteryLife, type, features, link } = await parseBody(req);
        console.log('Parsed product data for update:', { productId, name, price, batteryLife, type, features, link });

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


        const result = await pool.query(
          'UPDATE products SET name = $1, price = $2, batterylife = $3, type = $4, features = $5, link = $6 WHERE id = $7 RETURNING id, name',
          [name.trim(), parsedPrice, parsedBatteryLife, type.trim(), featuresArray, parsedLink, productId]
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


  // --- API Endpoint: RSS Feed (now fetches from DB) ---
  if (req.method === 'GET' && pathname === '/rss') {
    try {
        const { limit } = parsedUrl.query;
        // Setează o limită implicită de 100 dacă 'limit' nu este furnizat sau este invalid/negativ
        const queryLimit = (limit && parseInt(limit, 10) > 0) ? parseInt(limit, 10) : 100;

        let queryText = 'SELECT id, name, price, batterylife, type, features, link, created_at FROM products ORDER BY created_at DESC';
        const queryParams = [];

        if (queryLimit > 0) {
            queryText += ` LIMIT $1`;
            queryParams.push(queryLimit);
        }

        const { rows } = await pool.query(queryText, queryParams);

        const feed = new RSS({
          title: 'Ultimele Recomandări de Dispozitive Electronice', 
          description: 'Cele mai recent adăugate dispozitive electronice', 
          feed_url: `http://localhost:${PORT}/rss`,
          site_url: `http://localhost:${PORT}`, 
          language: 'ro'
        });

        rows.forEach(d => {
          feed.item({
            title: d.name,
            description: `Preț: ${d.price} Lei, Autonomie: ${d.batterylife ? d.batterylife + ' ore' : 'N/A'}, Tip: ${d.type}, Caracteristici: ${d.features.join(', ')}`,
            url: d.link && d.link !== 'null' && d.link.trim() !== '' ? d.link : `http://localhost:${PORT}/?product_id=${d.id}`, 
            date: d.created_at || new Date(), 
            guid: d.id 
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
        return sendJSON(res, { message: 'Numele de utilizator și parola sunt obligatorii.' }, 400);
      }

      const minLength = 6;
      const hasUppercase = /[A-Z]/.test(password);
      const hasDigit = /\d/.test(password);

      if (password.length < minLength) {
        return sendJSON(res, { message: `Parola trebuie să aibă minim ${minLength} caractere.` }, 400);
      }
      if (!hasUppercase) {
        return sendJSON(res, { message: 'Parola trebuie să conțină cel puțin o literă mare.' }, 400);
      }
      if (!hasDigit) {
        return sendJSON(res, { message: 'Parola trebuie să conțină cel puțin o cifră.' }, 400);
      }

      const userCheck = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
      if (userCheck.rows.length > 0) {
        return sendJSON(res, { message: 'Numele de utilizator există deja.' }, 409);
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
        
      return sendJSON(res, { message: message, user: { id: newUser.id, username: newUser.username, role: newUser.role } }, 201);

    } catch (error) {
      console.error('Eroare la înregistrarea utilizatorului:', error.message, error.stack);
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
        return sendJSON(res, { message: 'Credențiale invalide.' }, 400);
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);

      if (!isMatch) {
        return sendJSON(res, { message: 'Credențiale invalide.' }, 400);
      }

      const token = jwt.sign(
        { userId: user.id, role: user.role },
        JWT_SECRET,
        { expiresIn: '1m' } 
      );

      return sendJSON(res, { message: 'Conectat cu succes!', token, role: user.role, username: user.username });

    } catch (error) {
      console.error('Eroare la conectarea utilizatorului:', error.message, error.stack);
      return sendJSON(res, { message: 'Eroare de server la conectare.', error: error.message }, 500);
    }
  }

  // --- Protected API Endpoint (Example) ---
  if (req.method === 'GET' && pathname === '/api/protected-info') {
    return authenticateToken(req, res, () => { 
      if (req.user.role === 'admin') {
        return sendJSON(res, { message: `Bine ai venit, ${req.user.role}! Ai accesat informații protejate (admin). ID-ul tău: ${req.user.userId}.` });
      } else {
        return sendJSON(res, { message: `Bine ai venit, ${req.user.role}! Ai accesat informații protejate. ID-ul tău: ${req.user.userId}.` });
      }
    });
  }

  // NOU: API Endpoint pentru a adăuga un produs la favorite
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
          return sendJSON(res, { message: 'Produsul este deja în favorite sau nu a putut fi adăugat.' }, 409);
        }
      } catch (error) {
        console.error('Eroare la adăugarea la favorite:', error);
        return sendJSON(res, { message: 'Eroare de server la adăugarea la favorite.', error: error.message }, 500);
      }
    });
  }

  // NOU: API Endpoint pentru a elimina un produs din favorite
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
          return sendJSON(res, { message: 'Produsul nu a fost găsit în favorite sau nu a putut fi eliminat.' }, 404);
        }
      } catch (error) {
        console.error('Eroare la eliminarea din favorite:', error);
        return sendJSON(res, { message: 'Eroare de server la eliminarea din favorite.', error: error.message }, 500);
      }
    });
  }

  // NOU: API Endpoint pentru a prelua lista de favorite a utilizatorului
  if (req.method === 'GET' && pathname === '/api/favorites') {
    return authenticateToken(req, res, async () => {
      const userId = req.user.userId;

      try {
        const { rows } = await pool.query(
          `SELECT p.id, p.name, p.price, p.batterylife, p.type, p.features, p.link
           FROM products p
           JOIN user_favorites uf ON p.id = uf.product_id
           WHERE uf.user_id = $1
           ORDER BY uf.favorited_at DESC`,
          [userId]
        );
        return sendJSON(res, rows);
      } catch (error) {
        console.error('Eroare la preluarea listei de favorite:', error);
        return sendJSON(res, { message: 'Eroare de server la preluarea favoritelor.', error: error.message }, 500);
      }
    });
  }

  // NOU: API Endpoint pentru a verifica dacă un produs este în favoritele utilizatorului
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
        // Trimite { isFavorited: true } dacă există o înregistrare, altfel { isFavorited: false }
        return sendJSON(res, { isFavorited: rows.length > 0 });
      } catch (error) {
        console.error('Eroare la verificarea favoritelor:', error);
        return sendJSON(res, { message: 'Eroare de server la verificarea favoritelor.', error: error.message }, 500);
      }
    });
  }


  // If no route matches
  res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
  res.end('Not found');

}).listen(PORT, () => console.log(`Server fără Express pornit pe http://localhost:${PORT}`));