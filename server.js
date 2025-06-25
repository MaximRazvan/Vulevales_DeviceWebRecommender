// server-no-express.js
const http = require('http'); // cite: 1
const fs = require('fs'); // cite: 1
const path = require('path'); // cite: 1
const url = require('url'); // cite: 1
const { Pool } = require('pg'); // cite: 1
const bcrypt = require('bcryptjs'); // cite: 1
const jwt = require('jsonwebtoken'); // cite: 1
const RSS = require('rss'); // cite: 1
const fetch = require('node-fetch'); // Adaugă import pentru node-fetch // cite: 1
const cheerio = require('cheerio'); // Adaugă import pentru cheerio // cite: 1
const nodemailer = require('nodemailer'); // NOU: Adaugă nodemailer

const PORT = 3000; // cite: 1
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_12345'; // cite: 1

// --- AWS RDS PostgreSQL Database Configuration ---
const pool = new Pool({
  user: 'postgres', // <--- PRELUAT DIN IMAGINE // cite: 1
  host: 'postgres123.ctck2644kzwq.eu-north-1.rds.amazonaws.com', // <--- PRELUAT DIN IMAGINE // cite: 1
  database: 'postgres', // <--- PRELUAT DIN IMAGINE // cite: 1
  password: 'Postgres123.', // <--- !!! ÎNLOCUIEȘTE AICI CU PAROLA TA REALĂ DE LA AWS RDS !!! // cite: 1
  port: 5432, // <--- PRELUAT DIN IMAGINE // cite: 1

  ssl: {
      rejectUnauthorized: false // Setează true în producție dacă ai certificat, false pentru dezvoltare/simplitate // cite: 1
  }
});


// Test database connection
pool.connect((err, client, done) => {
  if (err) {
    console.error('Database connection failed:', err.stack); // cite: 1
  } else {
    console.log('Successfully connected to the AWS RDS PostgreSQL database.'); // cite: 1
    client.release(); // cite: 1
  }
});

// --- NOU: Nodemailer Transporter Configuration ---
// Configurează transporterul Nodemailer.
// Exemplu pentru Gmail. Pentru alte servicii, vezi documentația Nodemailer.
const transporter = nodemailer.createTransport({
    service: 'gmail', // Poți folosi 'outlook', 'yahoo', sau un host SMTP personalizat
    auth: {
        user: process.env.EMAIL_USER || 'razvanmaxim3@gmail.com', // Adresa ta de email
        pass: process.env.EMAIL_PASS || 'pquq zost lruw aoly' // Parola ta de email (sau App Password pentru Gmail)
    }
});

// --- Helper to send JSON responses ---
function sendJSON(res, data, status = 200) {
  if (res.headersSent) {
    console.warn('Attempted to send headers twice!'); // cite: 1
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }); // cite: 1
  res.end(JSON.stringify(data)); // cite: 1
}

// --- Helper to parse request body for POST/PUT requests ---
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''; // cite: 1
    req.on('data', chunk => body += chunk); // cite: 1
    req.on('end', () => {
      try {
        if (body) {
             resolve(JSON.parse(body)); // cite: 1
        } else {
             resolve({}); // cite: 1
        }
      } catch (e) {
          console.error("Failed to parse JSON body:", e); // cite: 1
          reject(new Error('Invalid JSON body')); // cite: 1
      }
    });
  });
}

// --- Helper to serve static files from 'public' directory ---
function serveStatic(res, pathname) {
   if (res.headersSent) {
        console.warn('Attempted to serve static file after headers sent!'); // cite: 1
        return;
    }

  let filePath; // cite: 1
  if (pathname === '/') {
      filePath = path.join(__dirname, 'index.html'); // cite: 1
  } else if (pathname === '/product-details.html') {
      filePath = path.join(__dirname, 'product-details.html'); // cite: 1
  } else if (pathname === '/favorites.html') {
      filePath = path.join(__dirname, 'favorites.html'); // cite: 1
  } else {
       filePath = path.join(__dirname, 'public', pathname);
       const rootFallbackPath = path.join(__dirname, pathname);
        if (!fs.existsSync(filePath) && fs.existsSync(rootFallbackPath)) {
             filePath = rootFallbackPath;
        }
  }

    const finalPath = filePath;

  fs.readFile(finalPath, (err, data) => {
    if (err) {
        console.error(`Error reading file ${finalPath}:`, err.message); // cite: 1
         if (!res.headersSent) {
            res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
            res.end('Not found');
         }
    } else {
         if (!res.headersSent) {
            const ext = path.extname(finalPath); // cite: 1
            const contentType = {
                '.html': 'text/html', // cite: 1
                '.css': 'text/css', // cite: 1
                '.js': 'application/javascript', // cite: 1
                '.json': 'application/json', // cite: 1
                '.ico': 'image/x-icon', // cite: 1
                '.png': 'image/png', // cite: 1
                '.jpg': 'image/jpeg', // cite: 1
                '.gif': 'image/gif', // cite: 1
                '.svg': 'image/svg+xml', // cite: 1
            }[ext] || 'text/plain';
            res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
            res.end(data);
         }
    }
  });
}

// --- Middleware for authenticating JWT tokens ---
function authenticateToken(req, res, callback) {
  const authHeader = req.headers['authorization']; // cite: 1
  const token = authHeader && authHeader.split(' ')[1]; // cite: 1

  if (!token) {
    return sendJSON(res, { message: 'Acces refuzat. Niciun token furnizat.' }, 401); // cite: 1
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('Verificarea tokenului a eșuat:', err.message); // cite: 1
      return sendJSON(res, { message: 'Token invalid sau expirat.' }, 403); // cite: 1
    }
    req.user = user; // cite: 1
    callback(); // cite: 1
  });
}

http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true); // cite: 1
  let pathname = parsedUrl.pathname; // cite: 1

  res.setHeader('Access-Control-Allow-Origin', '*'); // cite: 1
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS'); // cite: 1
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // cite: 1
  if (req.method === 'OPTIONS') {
    res.writeHead(204); // cite: 1
    return res.end(); // cite: 1
  }

  if (req.method === 'GET' && !pathname.startsWith('/api') && pathname !== '/rss') {
      if (pathname === '/' || pathname === '/index.html') {
          return serveStatic(res, 'index.html'); // cite: 1
      } else if (pathname === '/product-details.html') {
          return serveStatic(res, 'product-details.html'); // cite: 1
      } else if (pathname === '/favorites.html') {
          return serveStatic(res, 'favorites.html'); // cite: 1
      }
      return serveStatic(res, pathname); // cite: 1
  }

  if (req.method === 'GET' && pathname === '/api/recommendations') {
    const { q = '', minPrice, maxPrice, batteryLife, deviceType } = parsedUrl.query; // cite: 1

    let queryText = 'SELECT id, name, price, batterylife, type, features, link, image FROM products WHERE 1=1'; // cite: 1
    const queryParams = []; // cite: 1
    let paramIndex = 1; // cite: 1

    if (minPrice && parseFloat(minPrice) >= 0) {
        queryText += ` AND price >= $${paramIndex++}`; // cite: 1
        queryParams.push(parseFloat(minPrice)); // cite: 1
    }
    if (maxPrice && parseFloat(maxPrice) >= 0) {
        queryText += ` AND price <= $${paramIndex++}`; // cite: 1
        queryParams.push(parseFloat(maxPrice)); // cite: 1
    }
    if (batteryLife && parseInt(batteryLife, 10) >= 0) {
         queryText += ` AND batterylife >= $${paramIndex++}`; // cite: 1
         queryParams.push(parseInt(batteryLife, 10)); // cite: 1
    }
    if (deviceType) {
        queryText += ` AND type = $${paramIndex++}`; // cite: 1
        queryParams.push(deviceType.toLowerCase()); // cite: 1
    }

    if (q) {
        const searchTerm = `%${q.toLowerCase()}%`; // cite: 1
        queryText += ` AND (name ILIKE $${paramIndex++} OR EXISTS (SELECT 1 FROM UNNEST(features) AS feature WHERE feature ILIKE $${paramIndex++}) OR type ILIKE $${paramIndex++})`; // cite: 1
        queryParams.push(searchTerm, searchTerm, searchTerm); // cite: 1
    }

    queryText += ' ORDER BY id ASC'; // cite: 1

    try {
        const { rows } = await pool.query(queryText, queryParams); // cite: 1
         const formattedRows = rows.map(row => ({
             ...row,
             features: Array.isArray(row.features) ? row.features : (typeof row.features === 'string' ? row.features.split(',').map(f => f.trim()).filter(f => f.length > 0) : []) // cite: 1
         }));
        return sendJSON(res, formattedRows); // cite: 1
    } catch (error) {
        console.error('Error fetching recommendations from DB:', error); // cite: 1
        return sendJSON(res, { message: 'Eroare la preluarea recomandărilor.' }, 500); // cite: 1
    }
  }

  const productMatch = pathname.match(/^\/api\/products\/(\d+)$/); // cite: 1
  if (req.method === 'GET' && productMatch) {
    const productId = parseInt(productMatch[1], 10); // cite: 1
    if (isNaN(productId)) {
        return sendJSON(res, { message: 'ID produs invalid.' }, 400); // cite: 1
    }
    try {
        const queryText = `
            SELECT id, name, price, batterylife, type, features, link, image, 
                   COALESCE(likes_count, 0) as likes_count, 
                   COALESCE(views_count, 0) as views_count 
            FROM products WHERE id = $1
        `; // cite: 1
        const { rows } = await pool.query(queryText, [productId]); // cite: 1
      
        if (rows.length > 0) {
            pool.query('UPDATE products SET views_count = COALESCE(views_count, 0) + 1 WHERE id = $1', [productId])
                .catch(err => console.error(`Failed to increment views_count for product ${productId}:`, err)); // cite: 1

            const product = rows[0]; // cite: 1
            product.features = Array.isArray(product.features) ? product.features : (typeof product.features === 'string' ? product.features.split(',').map(f => f.trim()).filter(f => f.length > 0) : []); // cite: 1
            return sendJSON(res, product); // cite: 1
        } else {
            return sendJSON(res, { message: 'Produsul nu a fost găsit.' }, 404); // cite: 1
        }
    } catch (error) {
        console.error(`Error fetching product with ID ${productId} from DB:`, error); // cite: 1
        return sendJSON(res, { message: 'Eroare la preluarea produsului.' }, 500); // cite: 1
    }
  }

  if (req.method === 'POST' && pathname === '/api/products') {
    return authenticateToken(req, res, async () => {
      if (req.user.role !== 'admin') {
        return sendJSON(res, { message: 'Acces interzis. Doar administratorii pot adăuga produse.' }, 403); // cite: 1
      }

      try {
        const { name, price, batteryLife, type, features, link, image } = await parseBody(req); // cite: 1

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return sendJSON(res, { message: 'Numele produsului este obligatoriu.' }, 400); // cite: 1
        }
         const parsedPrice = parseFloat(price); // cite: 1
         if (isNaN(parsedPrice) || parsedPrice <= 0) {
             return sendJSON(res, { message: 'Prețul produsului trebuie să fie un număr pozitiv valid.' }, 400); // cite: 1
         }
         if (!type || typeof type !== 'string' || type.trim() === '') {
             return sendJSON(res, { message: 'Tipul produsului este obligatoriu.' }, 400); // cite: 1
         }
         const featuresArray = Array.isArray(features)
            ? features.map(f => String(f).trim()).filter(f => f.length > 0)
            : (typeof features === 'string' ? features.split(',').map(f => f.trim()).filter(f => f.length > 0) : []); // cite: 1
         if (featuresArray.length === 0) {
             return sendJSON(res, { message: 'Caracteristicile produsului sunt obligatorii (cel puțin una).' }, 400); // cite: 1
         }
        const parsedBatteryLife = batteryLife ? parseInt(batteryLife, 10) : null; // cite: 1
        const parsedLink = link && typeof link === 'string' && link.trim() !== '' ? link.trim() : null; // cite: 1
        const parsedImage = image && typeof image === 'string' && image.trim() !== '' ? image.trim() : null; // cite: 1

        const result = await pool.query(
          'INSERT INTO products (name, price, batterylife, type, features, link, image) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name', // cite: 1
          [name.trim(), parsedPrice, parsedBatteryLife, type.trim().toLowerCase(), featuresArray, parsedLink, parsedImage] // cite: 1
        );
        return sendJSON(res, { message: 'Produs adăugat cu succes!', product: result.rows[0] }, 201); // cite: 1
      } catch (error) {
        console.error('SERVER ERROR adding product:', error.message, error.stack); // cite: 1
        return sendJSON(res, { message: 'Eroare de server la adăugarea produsului.', error: error.message }, 500); // cite: 1
      }
    });
  }

  const updateProductMatch = pathname.match(/^\/api\/products\/(\d+)$/); // cite: 1
  if (req.method === 'PUT' && updateProductMatch) {
    return authenticateToken(req, res, async () => {
      if (req.user.role !== 'admin') {
        return sendJSON(res, { message: 'Acces interzis. Doar administratorii pot edita produse.' }, 403); // cite: 1
      }

      const productId = parseInt(updateProductMatch[1], 10); // cite: 1
      if (isNaN(productId)) {
        return sendJSON(res, { message: 'ID produs invalid.' }, 400); // cite: 1
      }

      try {
        const { name, price, batteryLife, type, features, link, image } = await parseBody(req); // cite: 1

         if (!name || typeof name !== 'string' || name.trim() === '') {
             return sendJSON(res, { message: 'Numele produsului este obligatoriu.' }, 400); // cite: 1
         }
          const parsedPrice = parseFloat(price); // cite: 1
          if (isNaN(parsedPrice) || parsedPrice <= 0) {
              return sendJSON(res, { message: 'Prețul produsului trebuie să fie un număr pozitiv valid.' }, 400); // cite: 1
          }
          if (!type || typeof type !== 'string' || type.trim() === '') {
              return sendJSON(res, { message: 'Tipul produsului este obligatoriu.' }, 400); // cite: 1
          }
          const featuresArray = Array.isArray(features)
             ? features.map(f => String(f).trim()).filter(f => f.length > 0)
             : (typeof features === 'string' ? features.split(',').map(f => f.trim()).filter(f => f.length > 0) : []); // cite: 1
          if (featuresArray.length === 0) {
              return sendJSON(res, { message: 'Caracteristicile produsului sunt obligatorii (cel puțin una).' }, 400); // cite: 1
          }
         const parsedBatteryLife = batteryLife ? parseInt(batteryLife, 10) : null; // cite: 1
         const parsedLink = link && typeof link === 'string' && link.trim() !== '' ? link.trim() : null; // cite: 1
         const parsedImage = image && typeof image === 'string' && image.trim() !== '' ? image.trim() : null; // cite: 1

        const result = await pool.query(
          'UPDATE products SET name = $1, price = $2, batterylife = $3, type = $4, features = $5, link = $6, image = $7 WHERE id = $8 RETURNING id, name', // cite: 1
          [name.trim(), parsedPrice, parsedBatteryLife, type.trim().toLowerCase(), featuresArray, parsedLink, parsedImage, productId] // cite: 1
        );

        if (result.rows.length > 0) {
          return sendJSON(res, { message: 'Produs actualizat cu succes!', product: result.rows[0] }); // cite: 1
        } else {
          return sendJSON(res, { message: 'Produsul nu a fost găsit pentru actualizare.' }, 404); // cite: 1
        }
      } catch (error) {
        console.error('SERVER ERROR updating product:', error.message, error.stack); // cite: 1
         return sendJSON(res, { message: 'Eroare de server la actualizarea produsului.', error: error.message }, 500); // cite: 1
      }
    });
  }

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

          let client;
          try {
              client = await pool.connect();
              await client.query('BEGIN');

              await client.query('DELETE FROM user_favorites WHERE product_id = $1', [productId]);
              console.log(`Deleted favorite entries for product ID: ${productId}`);

              const result = await client.query('DELETE FROM products WHERE id = $1 RETURNING id', [productId]);

              if (result.rowCount > 0) {
                  await client.query('COMMIT');
                  console.log(`Product ID: ${productId} successfully deleted.`);
                  return sendJSON(res, { message: 'Produs șters cu succes!' });
              } else {
                  await client.query('ROLLBACK');
                  return sendJSON(res, { message: 'Produsul nu a fost găsit pentru ștertere.' }, 404);
              }
          } catch (error) {
              if (client) {
                  await client.query('ROLLBACK');
              }
              console.error(`SERVER ERROR deleting product ID ${productId}:`, error.message, error.stack);
              return sendJSON(res, { message: `Eroare de server la ștergerea produsului: ${error.message}.`, error: error.message }, 500);
          } finally {
              if (client) {
                  client.release();
              }
          }
      });
  }

  if (req.method === 'GET' && pathname === '/api/popular') {
      try {
           const { rows } = await pool.query('SELECT id, name FROM products ORDER BY RANDOM() LIMIT 5'); // cite: 1
           const popularItems = rows.map(row => ({ name: row.name, views: Math.floor(Math.random() * 100) + 50 })); // cite: 1
          return sendJSON(res, popularItems); // cite: 1
      } catch (error) {
          console.error('Error fetching popular stats:', error); // cite: 1
          return sendJSON(res, [], 500); // cite: 1
      }
  }

  if (req.method === 'GET' && pathname === '/rss') {
    try {
        const { limit } = parsedUrl.query; // cite: 1
        const queryLimit = (limit && parseInt(limit, 10) > 0) ? parseInt(limit, 10) : 100; // cite: 1

        let queryText = 'SELECT id, name, price, batterylife, type, features, link, created_at, image FROM products ORDER BY created_at DESC'; // cite: 1
        const queryParams = []; // cite: 1

        if (queryLimit > 0) {
            queryText += ` LIMIT $1`; // cite: 1
            queryParams.push(queryLimit); // cite: 1
        }

        const { rows } = await pool.query(queryText, queryParams); // cite: 1

        const feed = new RSS({
          title: 'Ultimele Recomandări de Dispozitive Electronice', // cite: 1
          description: 'Cele mai recent adăugate dispozitive electronice', // cite: 1
          feed_url: `http://localhost:${PORT}/rss`, // cite: 1
          site_url: `http://localhost:${PORT}`, // cite: 1
          language: 'ro' // cite: 1
        });

        rows.forEach(d => {
          feed.item({
            title: d.name, // cite: 1
            description: `Preț: ${d.price} Lei, Autonomie: ${d.batterylife ? d.batterylife + ' ore' : 'N/A'}, Tip: ${d.type}, Caracteristici: ${Array.isArray(d.features) ? d.features.join(', ') : 'N/A'}`, // cite: 1
            url: d.link && d.link !== 'null' && d.link.trim() !== '' ? d.link : `http://localhost:${PORT}/product-details.html?product_id=${d.id}`, // cite: 1
            date: d.created_at || new Date(), // cite: 1
            guid: d.id, // cite: 1
            enclosure: d.image ? { url: d.image, type: 'image/jpeg' } : undefined // cite: 1
          });
        });

        res.writeHead(200, { 'Content-Type': 'application/rss+xml', 'Access-Control-Allow-Origin': '*' }); // cite: 1
        return res.end(feed.xml({ indent: true })); // cite: 1
    } catch (error) {
        console.error('Error generating RSS feed from DB:', error); // cite: 1
        return sendJSON(res, { message: 'Eroare la generarea feed-ului RSS.' }, 500); // cite: 1
    }
  }

  // --- API Endpoint: User Registration ---
  if (req.method === 'POST' && pathname === '/api/register') {
    try {
      const { username, password, email, role } = await parseBody(req); // Modificat: adăugat email

      if (!username || !password || !email) { // Modificat: email obligatoriu
        return sendJSON(res, { message: 'Numele de utilizator, parola și emailul sunt obligatorii.' }, 400);
      }
      if (!/\S+@\S+\.\S+/.test(email)) { // NOU: Validare format email
        return sendJSON(res, { message: 'Format email invalid.' }, 400);
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

      const userCheck = await pool.query('SELECT * FROM users WHERE username = $1 OR email = $2', [username, email]); // Modificat: verifică și email
      if (userCheck.rows.length > 0) {
        if (userCheck.rows[0].username === username) {
            return sendJSON(res, { message: 'Numele de utilizator există deja.' }, 409);
        }
        if (userCheck.rows[0].email === email) {
            return sendJSON(res, { message: 'Emailul există deja.' }, 409);
        }
      }

      let finalRole = 'user';
      if (role === 'admin') {
          const adminCheck = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'admin'"); // cite: 1
          const adminCount = parseInt(adminCheck.rows[0].count, 10); // cite: 1
          if (adminCount === 0) {
              finalRole = 'admin'; // cite: 1
              console.log(`Permitting first user "${username}" to register as admin.`); // cite: 1
          } else {
              console.warn(`Attempted admin registration for "${username}" but admin already exists.`); // cite: 1
              finalRole = 'user'; // cite: 1
          }
      } else {
          finalRole = 'user'; // cite: 1
      }

      const salt = await bcrypt.genSalt(10); // cite: 1
      const passwordHash = await bcrypt.hash(password, salt); // cite: 1

      // Modificat: Adaugă email în query
      const result = await pool.query(
        'INSERT INTO users (username, password_hash, email, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
        [username, passwordHash, email.toLowerCase(), finalRole]
      );

      const newUser = result.rows[0];
      const message = finalRole === 'admin'
        ? 'Utilizator admin înregistrat cu succes! (Sunteți primul admin)'
        : 'Utilizator înregistrat cu succes!';

      // NOU: Trimite email de confirmare
      const mailOptions = {
          from: process.env.EMAIL_USER || 'razvanmaxim3@gmail.com', // Adresa de email a expeditorului
          to: newUser.email, // Adresa de email a noului utilizator
          subject: 'Contul tau a fost creat cu succes!',
          html: `<p>Salut, ${newUser.username}!</p>
                 <p>Contul tău a fost creat cu succes pe platforma de Recomandări Dispozitive Electronice.</p>
                 <p>Te poți conecta acum cu numele de utilizator: <strong>${newUser.username}</strong></p>
                 <p>Începe să explorezi recomandările noastre de produse electronice!</p>
                 <p>Cu respect,<br>Echipa Recomandări Dispozitive Electronice</p>`
      };

      try {
          await transporter.sendMail(mailOptions);
          console.log(`Confirmation email sent to ${newUser.email}`);
      } catch (mailError) {
          console.error(`Failed to send confirmation email to ${newUser.email}:`, mailError.message);
          // Nu blocăm înregistrarea dacă trimiterea emailului eșuează
      }

      return sendJSON(res, { message: message, user: { id: newUser.id, username: newUser.username, email: newUser.email, role: newUser.role } }, 201);

    } catch (error) {
      console.error('Eroare la înregistrarea utilizatorului:', error.message, error.stack);
      return sendJSON(res, { message: 'Eroare de server la înregistrare.', error: error.message }, 500);
    }
  }

  // --- API Endpoint: User Login ---
  if (req.method === 'POST' && pathname === '/api/login') {
    try {
      const { username, password } = await parseBody(req); // cite: 1

      if (!username || !password) {
        return sendJSON(res, { message: 'Numele de utilizator și parola sunt obligatorii.' }, 400); // cite: 1
      }

      const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]); // cite: 1
      const user = result.rows[0]; // cite: 1

      if (!user) {
        return sendJSON(res, { message: 'Nume de utilizator sau parolă incorecte.' }, 400); // cite: 1
      }

      const isMatch = await bcrypt.compare(password, user.password_hash); // cite: 1

      if (!isMatch) {
        return sendJSON(res, { message: 'Nume de utilizator sau parolă incorecte.' }, 400); // cite: 1
      }

      const token = jwt.sign(
        { userId: user.id, role: user.role },
        JWT_SECRET,
        { expiresIn: '15m' } // cite: 1
      );

      return sendJSON(res, { message: 'Conectat cu succes!', token, role: user.role, username: user.username }); // cite: 1

    } catch (error) {
      console.error('Eroare la conectarea utilizatorului:', error.message, error.stack); // cite: 1
      return sendJSON(res, { message: 'Eroare de server la conectare.', error: error.message }, 500); // cite: 1
    }
  }

  if (req.method === 'GET' && pathname === '/api/protected-info') {
    return authenticateToken(req, res, async () => { // cite: 1
      if (req.user.role === 'admin') {
        return sendJSON(res, { message: `Bine ai venit, ${req.user.role}! Ai accesat informații protejate (admin). ID-ul tău: ${req.user.userId}.` }); // cite: 1
      } else {
        return sendJSON(res, { message: `Bine ai venit, ${req.user.role}! Ai accesat informații protejate (user). ID-ul tău: ${req.user.userId}.` }); // cite: 1
      }
    });
  }

  if (req.method === 'POST' && pathname === '/api/favorites') {
    return authenticateToken(req, res, async () => {
      const { productId } = await parseBody(req); // cite: 1
      const userId = req.user.userId; // cite: 1

      if (!productId) {
        return sendJSON(res, { message: 'ID-ul produsului este obligatoriu.' }, 400); // cite: 1
      }

      try {
        const result = await pool.query(
          'INSERT INTO user_favorites (user_id, product_id) VALUES ($1, $2) ON CONFLICT (user_id, product_id) DO NOTHING RETURNING *',
          [userId, productId] // cite: 1
        );

        if (result.rowCount > 0) {
          await pool.query('UPDATE products SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = $1', [productId]); // cite: 1
          return sendJSON(res, { message: 'Produs adăugat la favorite!', productId }); // cite: 1
        } else {
          return sendJSON(res, { message: 'Produsul este deja în favorite.' }, 409); // cite: 1
        }
      } catch (error) {
        console.error('Eroare la adăugarea la favorite:', error); // cite: 1
        return sendJSON(res, { message: 'Eroare de server la adăugarea la favorite.', error: error.message }, 500); // cite: 1
      }
    });
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/favorites/')) {
    const productIdMatch = pathname.match(/\/api\/favorites\/(\d+)$/); // cite: 1
    if (!productIdMatch) {
      return sendJSON(res, { message: 'ID produs favorit invalid.' }, 400); // cite: 1
    }
    const productId = parseInt(productIdMatch[1], 10); // cite: 1

    return authenticateToken(req, res, async () => {
      const userId = req.user.userId; // cite: 1

      try {
        const result = await pool.query(
          'DELETE FROM user_favorites WHERE user_id = $1 AND product_id = $2 RETURNING *',
          [userId, productId] // cite: 1
        );

        if (result.rowCount > 0) {
           await pool.query('UPDATE products SET likes_count = GREATEST(0, COALESCE(likes_count, 0) - 1) WHERE id = $1', [productId]); // cite: 1
          return sendJSON(res, { message: 'Produs eliminat din favorite!', productId }); // cite: 1
        } else {
          return sendJSON(res, { message: 'Produsul nu a fost găsit în favorite.' }, 404); // cite: 1
        }
      } catch (error) {
        console.error('Eroare la eliminarea din favorite:', error); // cite: 1
        return sendJSON(res, { message: 'Eroare de server la eliminarea din favorite.', error: error.message }, 500); // cite: 1
      }
    });
  }

  if (req.method === 'GET' && pathname === '/api/favorites') {
    return authenticateToken(req, res, async () => {
      const userId = req.user.userId; // cite: 1

      try {
        const { rows } = await pool.query(
          `SELECT p.id, p.name, p.price, p.batterylife, p.type, p.features, p.link, p.image
           FROM products p
           JOIN user_favorites uf ON p.id = uf.product_id
           WHERE uf.user_id = $1
           ORDER BY uf.favorited_at DESC`, // cite: 1
          [userId]
        );
        const formattedRows = rows.map(row => ({
             ...row,
             features: Array.isArray(row.features) ? row.features : (typeof row.features === 'string' ? row.features.split(',').map(f => f.trim()).filter(f => f.length > 0) : []) // cite: 1
        }));
        return sendJSON(res, formattedRows); // cite: 1
      } catch (error) {
        console.error('Eroare la preluarea listei de favorite:', error); // cite: 1
        return sendJSON(res, { message: 'Eroare de server la preluarea favoritelor.', error: error.message }, 500); // cite: 1
      }
    });
  }

  if (req.method === 'GET' && pathname.startsWith('/api/favorites/check/')) {
    const productIdMatch = pathname.match(/\/api\/favorites\/check\/(\d+)$/); // cite: 1
    if (!productIdMatch) {
      return sendJSON(res, { message: 'ID produs invalid pentru verificare favorite.' }, 400); // cite: 1
    }
    const productId = parseInt(productIdMatch[1], 10); // cite: 1

    return authenticateToken(req, res, async () => {
      const userId = req.user.userId; // cite: 1

      try {
        const { rows } = await pool.query(
          'SELECT 1 FROM user_favorites WHERE user_id = $1 AND product_id = $2',
          [userId, productId] // cite: 1
        );
        return sendJSON(res, { isFavorited: rows.length > 0 }); // cite: 1
      } catch (error) {
        console.error('Eroare la verificarea favoritelor:', error); // cite: 1
        return sendJSON(res, { message: 'Eroare de server la verificarea favoritelor.', error: error.message }, 500); // cite: 1
      }
    });
  }


  res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }); // cite: 1
  res.end('Not found'); // cite: 1

}).listen(PORT, () => console.log(`Server fără Express pornit pe http://localhost:${PORT}`)); // cite: 1