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
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_12345'; // Secret JWT

// --- PostgreSQL Database Configuration ---
const pool = new Pool({
  user: 'postgres', // IMPORTANT: Change this to your PostgreSQL username
  host: 'localhost',
  database: 'DeW',
  password: 'postgres', // IMPORTANT: Change this to your PostgreSQL password
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
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' });
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
  // If the path is just '/', serve index.html, otherwise serve the requested file
  const filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
  
  // Add support for files directly in the root if they exist (like index.html)
  const rootFilePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);


  fs.readFile(rootFilePath, (err, data) => {
    if (err) {
        // If not in root, try 'public' directory
        fs.readFile(filePath, (err2, data2) => {
            if (err2) {
                // If file not found in both, try to serve index.html for SPA fallback
                if (err2.code === 'ENOENT' && pathname !== '/index.html') {
                    return serveStatic(res, '/index.html'); // Fallback to index.html
                }
                res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
                res.end('Not found');
            } else {
                const ext = path.extname(filePath);
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
                }[ext] || 'text/plain'; // Default to plain text
                res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
                res.end(data2);
            }
        });
    } else {
        const ext = path.extname(rootFilePath);
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
        }[ext] || 'text/plain'; // Default to plain text
        res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
        res.end(data);
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
      return sendJSON(res, { message: 'Token invalid sau expirat.' }, 403); // Changed 403 message
    }
    // Attach user information (from token payload) to the request object
    req.user = user;
    callback(); // Call the next function (the actual route handler)
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
  // Serve index.html for the root path or if the path doesn't look like an API call
  if (req.method === 'GET' && !pathname.startsWith('/api') && pathname !== '/rss') {
      // Prioritize serving the root index.html if it exists
      if (pathname === '/') {
          return serveStatic(res, '/index.html');
      }
      // Otherwise, try serving the file from root or public directory (with index.html fallback)
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
        // Handle cases where batterylife might be 0 or null in DB, only filter if input is provided
        if (batteryLife > 0) {
             queryText += ` AND batterylife >= $${paramIndex++}`; 
             queryParams.push(parseFloat(batteryLife)); // Use float just in case input allows decimals
        } else if (batteryLife === '0') {
             // If user explicitly searches for 0, include products with 0 battery life
             queryText += ` AND batterylife = 0`; // No param needed here
        }
       
    }
    if (deviceType) {
        queryText += ` AND type = $${paramIndex++}`;
        queryParams.push(deviceType);
    }

    // For 'q' parameter, search in name or features (case-insensitive)
    if (q) {
        const searchTerm = `%${q.toLowerCase()}%`;
        // Use ILIKE for case-insensitive comparison in PostgreSQL
        // Use ANY for searching in the features array
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
    // Use authenticateToken middleware before handling the request
    authenticateToken(req, res, async () => {
      // Check if the authenticated user has the 'admin' role
      if (req.user.role !== 'admin') {
        return sendJSON(res, { message: 'Acces interzis. Doar administratorii pot adăuga produse.' }, 403);
      }

      try {
        const { name, price, batteryLife, type, features, link } = await parseBody(req);
        console.log('Parsed product data for insertion:', { name, price, batteryLife, type, features, link });

        // More robust server-side validation
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
        // Handle specific database errors if needed, e.g., constraint violations
        return sendJSON(res, { message: 'Eroare de server la adăugarea produsului.', error: error.message }, 500);
      }
    });
  }

  // --- API Endpoint: Update Product (Admin only) ---
  // Matches paths like PUT /api/products/123
  const updateProductMatch = pathname.match(/^\/api\/products\/(\d+)$/);
  if (req.method === 'PUT' && updateProductMatch) {
    authenticateToken(req, res, async () => {
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

        // More robust server-side validation for update
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
  // Matches paths like DELETE /api/products/123
  const deleteProductMatch = pathname.match(/^\/api\/products\/(\d+)$/);
  if (req.method === 'DELETE' && deleteProductMatch) {
    authenticateToken(req, res, async () => {
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
        // Fetch the latest 5 products, including created_at
        const { rows } = await pool.query('SELECT id, name, price, batterylife, type, features, link, created_at FROM products ORDER BY created_at DESC LIMIT 5');

        const feed = new RSS({
          title: 'Ultimele Recomandări de Dispozitive Electronice', // Changed title
          description: 'Cele mai recent adăugate dispozitive electronice', // Changed description
          feed_url: `http://localhost:${PORT}/rss`,
          site_url: `http://localhost:${PORT}`, // Use PORT variable
          language: 'ro'
        });

        rows.forEach(d => {
          feed.item({
            title: d.name,
            description: `Preț: ${d.price} Lei, Autonomie: ${d.batterylife ? d.batterylife + ' ore' : 'N/A'}, Tip: ${d.type}, Caracteristici: ${d.features.join(', ')}`,
            url: d.link && d.link !== 'null' && d.link.trim() !== '' ? d.link : `http://localhost:${PORT}/?product_id=${d.id}`, // Link to product details page if no external link
            date: d.created_at || new Date(), // Use created_at or current date
            guid: d.id // Use product ID as GUID
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
      // Allow user to specify role 'admin' ONLY if no admin exists yet.
      // Otherwise, new users are always 'user'.
      const { username, password, role } = await parseBody(req); // Get role from body

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

      // Security check: Prevent casual users from registering as admin
      let finalRole = 'user';
      if (role === 'admin') {
          const adminCheck = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'admin'");
          const adminCount = parseInt(adminCheck.rows[0].count, 10);
          if (adminCount === 0) {
              // Allow the first user to register as admin if requested
              finalRole = 'admin';
              console.log(`Permitting first user "${username}" to register as admin.`);
          } else {
              console.warn(`Attempted admin registration for "${username}" but admin already exists.`);
              // Ignore the requested 'admin' role, register as 'user'
              finalRole = 'user'; 
          }
      } else {
          finalRole = 'user'; // Ensure any other role input defaults to user
      }


      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const result = await pool.query(
        'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role',
        [username, passwordHash, finalRole] // Use finalRole here
      );

      const newUser = result.rows[0];
      // If the registered user was the first admin, return a specific message
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
        { expiresIn: '1m' } // Token expires in 1 minute for demo purposes
      );

      return sendJSON(res, { message: 'Conectat cu succes!', token, role: user.role, username: user.username });

    } catch (error) {
      console.error('Eroare la conectarea utilizatorului:', error.message, error.stack);
      return sendJSON(res, { message: 'Eroare de server la conectare.', error: error.message }, 500);
    }
  }

  // --- Protected API Endpoint (Example) ---
  if (req.method === 'GET' && pathname === '/api/protected-info') {
    authenticateToken(req, res, () => {
      // This endpoint is accessible by any authenticated user
      if (req.user.role === 'admin') {
        return sendJSON(res, { message: `Bine ai venit, ${req.user.role}! Ai accesat informații protejate (admin). ID-ul tău: ${req.user.userId}.` });
      } else {
        return sendJSON(res, { message: `Bine ai venit, ${req.user.role}! Ai accesat informații protejate. ID-ul tău: ${req.user.userId}.` });
      }
    });
    return; // Return here to prevent falling through to 404
  }


  // If no route matches
  res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
  res.end('Not found');
}).listen(PORT, () => console.log(`Server fără Express pornit pe http://localhost:${PORT}`));
