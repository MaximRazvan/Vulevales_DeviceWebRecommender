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
const nodemailer = require('nodemailer');

const PORT = 3000;  
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_12345';  

//   AWS RDS PostgreSQL Database Configuration  
const pool = new Pool({
  user: 'postgres',  
  host: 'postgres123.ctck2644kzwq.eu-north-1.rds.amazonaws.com',  
  database: 'postgres',  
  password: 'Postgres123.',
  port: 5432,  

  ssl: {
      rejectUnauthorized: false
  }
});


// Test database connection
pool.connect((err, client, done) => {
  if (err) {
    console.error('Database connection failed:', err.stack);  
  } else {
    console.log('Successfully connected to the AWS RDS PostgreSQL database.');  
    client.release();  
  }
});

const transporter = nodemailer.createTransport({
    service: 'gmail', 
    auth: {
        user: process.env.EMAIL_USER || 'razvanmaxim3@gmail.com', // Adresa de email
        pass: process.env.EMAIL_PASS || 'pquq zost lruw aoly' // Parola de email 
    }
});

function sendJSON(res, data, status = 200) {
  if (res.headersSent) {
    console.warn('Attempted to send headers twice!');  
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' });  
  res.end(JSON.stringify(data));  
}

//   Helper to parse request body for POST/PUT requests  
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

//   Helper to serve static files from 'public' directory  
function serveStatic(res, pathname) {
   if (res.headersSent) {
        console.warn('Attempted to serve static file after headers sent!');  
        return;
    }

  let filePath;  
  if (pathname === '/') {
      filePath = path.join(__dirname, 'index.html');  
  } else if (pathname === '/product-details.html') {
      filePath = path.join(__dirname, 'product-details.html');  
  } else if (pathname === '/favorites.html') {
      filePath = path.join(__dirname, 'favorites.html');  
  } else if (pathname === '/stats.html') { 
      filePath = path.join(__dirname, 'stats.html');
  } else if (pathname === '/documentation.html') { // MODIFICARE ADĂUGATĂ
      filePath = path.join(__dirname, 'documentation.html');
  }
  else {
       filePath = path.join(__dirname, 'public', pathname);
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

//  authenticating JWT tokens  
function authenticateToken(req, res, callback) {
  const authHeader = req.headers['authorization'];  
  const token = authHeader && authHeader.split(' ')[1];  

  if (!token) {
    return sendJSON(res, { message: 'Acces refuzat. Niciun token furnizat.' }, 401);  
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('Verificarea tokenului a esuat:', err.message);  
      return sendJSON(res, { message: 'Token invalid sau expirat.' }, 403);  
    }
    req.user = user;  
    callback();  
  });
}

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

  if (req.method === 'GET' && !pathname.startsWith('/api') && pathname !== '/rss') {
      if (pathname === '/' || pathname === '/index.html') {
          return serveStatic(res, 'index.html');  
      } else if (pathname === '/product-details.html') {
          return serveStatic(res, 'product-details.html');  
      } else if (pathname === '/favorites.html') {
          return serveStatic(res, 'favorites.html');  
      } else if (pathname === '/stats.html') { 
          return serveStatic(res, 'stats.html');
      } else if (pathname === '/documentation.html') { // MODIFICARE ADĂUGATĂ
          return serveStatic(res, 'documentation.html');
      }
      return serveStatic(res, pathname);  
  }

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
        return sendJSON(res, { message: 'Eroare la preluarea Recomandărilor.' }, 500);  
    }
  }

  const productMatch = pathname.match(/^\/api\/products\/(\d+)$/);  
  if (req.method === 'GET' && productMatch) {
    const productId = parseInt(productMatch[1], 10);  
    if (isNaN(productId)) {
        return sendJSON(res, { message: 'ID produs invalid.' }, 400);  
    }
    try {
        const queryText = `
            SELECT id, name, price, batterylife, type, features, link, image, 
                   COALESCE(likes_count, 0) as likes_count, 
                   COALESCE(views_count, 0) as views_count 
            FROM products WHERE id = $1
        `;  
        const { rows } = await pool.query(queryText, [productId]);  
      
        if (rows.length > 0) {
            pool.query('UPDATE products SET views_count = COALESCE(views_count, 0) + 1 WHERE id = $1', [productId])
                .catch(err => console.error(`Failed to increment views_count for product ${productId}:`, err));  

            const product = rows[0];  
            product.features = Array.isArray(product.features) ? product.features : (typeof product.features === 'string' ? product.features.split(',').map(f => f.trim()).filter(f => f.length > 0) : []);  
            return sendJSON(res, product);  
        } else {
            return sendJSON(res, { message: 'Produsul nu a fost gasit.' }, 404);  
        }
    } catch (error) {
        console.error(`Error fetching product with ID ${productId} from DB:`, error);  
        return sendJSON(res, { message: 'Eroare la preluarea produsului.' }, 500);  
    }
  }

  if (req.method === 'POST' && pathname === '/api/products') {
    return authenticateToken(req, res, async () => {
      if (req.user.role !== 'admin') {
        return sendJSON(res, { message: 'Acces interzis. Doar administratorii pot adauga produse.' }, 403);  
      }

      try {
        const { name, price, batteryLife, type, features, link, image } = await parseBody(req);  

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return sendJSON(res, { message: 'Numele produsului este obligatoriu.' }, 400);  
        }
         const parsedPrice = parseFloat(price);  
         if (isNaN(parsedPrice) || parsedPrice <= 0) {
             return sendJSON(res, { message: 'Pretul produsului trebuie sa fie un numar pozitiv valid.' }, 400);  
         }
         if (!type || typeof type !== 'string' || type.trim() === '') {
             return sendJSON(res, { message: 'Tipul produsului este obligatoriu.' }, 400);  
         }
         const featuresArray = Array.isArray(features)
            ? features.map(f => String(f).trim()).filter(f => f.length > 0)
            : (typeof features === 'string' ? features.split(',').map(f => f.trim()).filter(f => f.length > 0) : []);  
         if (featuresArray.length === 0) {
             return sendJSON(res, { message: 'Caracteristicile produsului sunt obligatorii (cel putin una).' }, 400);  
         }
        const parsedBatteryLife = batteryLife ? parseInt(batteryLife, 10) : null;  
        const parsedLink = link && typeof link === 'string' && link.trim() !== '' ? link.trim() : null;  
        const parsedImage = image && typeof image === 'string' && image.trim() !== '' ? image.trim() : null;  

        const result = await pool.query(
          'INSERT INTO products (name, price, batterylife, type, features, link, image) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name',  
          [name.trim(), parsedPrice, parsedBatteryLife, type.trim().toLowerCase(), featuresArray, parsedLink, parsedImage]  
        );
        return sendJSON(res, { message: 'Produs adaugat cu succes!', product: result.rows[0] }, 201);  
      } catch (error) {
        console.error('SERVER ERROR adding product:', error.message, error.stack);  
        return sendJSON(res, { message: 'Eroare de server la adaugarea produsului.', error: error.message }, 500);  
      }
    });
  }

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
              return sendJSON(res, { message: 'Pretul produsului trebuie sa fie un numar pozitiv valid.' }, 400);  
          }
          if (!type || typeof type !== 'string' || type.trim() === '') {
              return sendJSON(res, { message: 'Tipul produsului este obligatoriu.' }, 400);  
          }
          const featuresArray = Array.isArray(features)
             ? features.map(f => String(f).trim()).filter(f => f.length > 0)
             : (typeof features === 'string' ? features.split(',').map(f => f.trim()).filter(f => f.length > 0) : []);  
          if (featuresArray.length === 0) {
              return sendJSON(res, { message: 'Caracteristicile produsului sunt obligatorii (cel putin una).' }, 400);  
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
          return sendJSON(res, { message: 'Produsul nu a fost gasit pentru actualizare.' }, 404);  
        }
      } catch (error) {
        console.error('SERVER ERROR updating product:', error.message, error.stack);  
         return sendJSON(res, { message: 'Eroare de server la actualizarea produsului.', error: error.message }, 500);  
      }
    });
  }

  const deleteProductMatch = pathname.match(/^\/api\/products\/(\d+)$/);
  if (req.method === 'DELETE' && deleteProductMatch) {
      return authenticateToken(req, res, async () => {
          if (req.user.role !== 'admin') {
              return sendJSON(res, { message: 'Acces interzis. Doar administratorii pot sterge produse.' }, 403);
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
                  return sendJSON(res, { message: 'Produs sters cu succes!' });
              } else {
                  await client.query('ROLLBACK');
                  return sendJSON(res, { message: 'Produsul nu a fost gasit pentru stertere.' }, 404);
              }
          } catch (error) {
              if (client) {
                  await client.query('ROLLBACK');
              }
              console.error(`SERVER ERROR deleting product ID ${productId}:`, error.message, error.stack);
              return sendJSON(res, { message: `Eroare de server la stergerea produsului: ${error.message}.`, error: error.message }, 500);
          } finally {
              if (client) {
                  client.release();
              }
          }
      });
  }

  if (req.method === 'GET' && pathname === '/api/popular') {
      try {
           const { rows } = await pool.query('SELECT name, COALESCE(likes_count, 0) as likes_count, COALESCE(views_count, 0) as views_count FROM products ORDER BY likes_count DESC, views_count DESC LIMIT 10'); 
           return sendJSON(res, rows);
      } catch (error) {
          console.error('Error fetching popular stats:', error);
          return sendJSON(res, [], 500);
      }
  }

  if (req.method === 'GET' && pathname === '/rss') {
    try {
        const queryText = 'SELECT id, name, price, batterylife, type, features, link, created_at, image, COALESCE(views_count, 0) as views_count FROM products ORDER BY views_count DESC NULLS LAST LIMIT 5';
        const { rows } = await pool.query(queryText);

        const feed = new RSS({
          title: 'Top 5 Cele Mai Vizionate Produse',
          description: 'O listă cu cele mai populare 5 produse de pe platformă, ordonate după numărul de vizualizări.',
          feed_url: `http://localhost:${PORT}/rss`,
          site_url: `http://localhost:${PORT}`,
          language: 'ro'
        });

        rows.forEach(d => {
          feed.item({
            title: `${d.name} (${d.views_count} vizualizări)`,
            description: `Pret: ${d.price} Lei, Autonomie: ${d.batterylife ? d.batterylife + ' ore' : 'N/A'}, Tip: ${d.type}, Caracteristici: ${Array.isArray(d.features) ? d.features.join(', ') : 'N/A'}. Vizualizări: ${d.views_count}.`,
            url: d.link && d.link !== 'null' && d.link.trim() !== '' ? d.link : `http://localhost:${PORT}/product-details.html?product_id=${d.id}`,
            date: d.created_at || new Date(),
            guid: d.id,
            enclosure: d.image ? { url: d.image, type: 'image/jpeg' } : undefined
          });
        });

        res.writeHead(200, { 'Content-Type': 'application/rss+xml', 'Access-Control-Allow-Origin': '*' });
        return res.end(feed.xml({ indent: true }));
    } catch (error) {
        console.error('Eroare la generarea feed-ului RSS din DB:', error);
        return sendJSON(res, { message: 'Eroare la generarea feed-ului RSS.' }, 500);
    }
  }

  //   API Endpoint: User Registration  
  if (req.method === 'POST' && pathname === '/api/register') {
    try {
      const { username, password, email, role } = await parseBody(req); 

      if (!username || !password || !email) { 
        return sendJSON(res, { message: 'Numele de utilizator, parola si emailul sunt obligatorii.' }, 400);
      }
      if (!/\S+@\S+\.\S+/.test(email)) {
        return sendJSON(res, { message: 'Format email invalid.' }, 400);
      }

      const minLength = 6;
      const hasUppercase = /[A-Z]/.test(password);
      const hasDigit = /\d/.test(password);

      if (password.length < minLength) {
        return sendJSON(res, { message: `Parola trebuie sa aiba minim ${minLength} caractere.` }, 400);
      }
      if (!hasUppercase) {
        return sendJSON(res, { message: 'Parola trebuie sa contina cel putin o litera mare.' }, 400);
      }
      if (!hasDigit) {
        return sendJSON(res, { message: 'Parola trebuie sa contina cel putin o cifra.' }, 400);
      }

      const userCheck = await pool.query('SELECT * FROM users WHERE username = $1 OR email = $2', [username, email]); // Modificat: verifica si email
      if (userCheck.rows.length > 0) {
        if (userCheck.rows[0].username === username) {
            return sendJSON(res, { message: 'Numele de utilizator exista deja.' }, 409);
        }
        if (userCheck.rows[0].email === email) {
            return sendJSON(res, { message: 'Emailul exista deja.' }, 409);
        }
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
        'INSERT INTO users (username, password_hash, email, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
        [username, passwordHash, email.toLowerCase(), finalRole]
      );

      const newUser = result.rows[0];
      const message = finalRole === 'admin'
        ? 'Utilizator admin înregistrat cu succes! (Sunteti primul admin)'
        : 'Utilizator înregistrat cu succes!';

      const mailOptions = {
          from: process.env.EMAIL_USER || 'razvanmaxim3@gmail.com', // Adresa de email a expeditorului
          to: newUser.email, // Adresa de email a noului utilizator
          subject: 'Contul tau a fost creat cu succes!',
          html: `<p>Salut, ${newUser.username}!</p>
                 <p>Contul tau a fost creat cu succes pe platforma de Recomandări Dispozitive Electronice.</p>
                 <p>Te poti conecta acum cu numele de utilizator: <strong>${newUser.username}</strong></p>
                 <p>Începe sa explorezi Recomandările noastre de produse electronice!</p>
                 <p>Cu respect,<br>Echipa Recomandări Dispozitive Electronice</p>`
      };

      try {
          await transporter.sendMail(mailOptions);
          console.log(`Confirmation email sent to ${newUser.email}`);
      } catch (mailError) {
          console.error(`Failed to send confirmation email to ${newUser.email}:`, mailError.message);
          // Nu blocam înregistrarea daca trimiterea emailului esueaza
      }

      return sendJSON(res, { message: message, user: { id: newUser.id, username: newUser.username, email: newUser.email, role: newUser.role } }, 201);

    } catch (error) {
      console.error('Eroare la înregistrarea utilizatorului:', error.message, error.stack);
      return sendJSON(res, { message: 'Eroare de server la înregistrare.', error: error.message }, 500);
    }
  }

  //   API Endpoint: User Login  
  if (req.method === 'POST' && pathname === '/api/login') {
    try {
      const { username, password } = await parseBody(req);  

      if (!username || !password) {
        return sendJSON(res, { message: 'Numele de utilizator si parola sunt obligatorii.' }, 400);  
      }

      const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);  
      const user = result.rows[0];  

      if (!user) {
        return sendJSON(res, { message: 'Nume de utilizator sau parola incorecte.' }, 400);  
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);  

      if (!isMatch) {
        return sendJSON(res, { message: 'Nume de utilizator sau parola incorecte.' }, 400);  
      }

      const token = jwt.sign(
        { userId: user.id, role: user.role },
        JWT_SECRET,
        { expiresIn: '15m' }  
      );

      return sendJSON(res, { message: 'Conectat cu succes!', token, role: user.role, username: user.username });  

    } catch (error) {
      console.error('Eroare la conectarea utilizatorului:', error.message, error.stack);  
      return sendJSON(res, { message: 'Eroare de server la conectare.', error: error.message }, 500);  
    }
  }

  if (req.method === 'GET' && pathname === '/api/protected-info') {
    return authenticateToken(req, res, async () => {  
      if (req.user.role === 'admin') {
        return sendJSON(res, { message: `Bine ai venit, ${req.user.role}! Ai accesat informatii protejate (admin). ID-ul tau: ${req.user.userId}.` });  
      } else {
        return sendJSON(res, { message: `Bine ai venit, ${req.user.role}! Ai accesat informatii protejate (user). ID-ul tau: ${req.user.userId}.` });  
      }
    });
  }

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
          await pool.query('UPDATE products SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = $1', [productId]);  
          return sendJSON(res, { message: 'Produs adaugat la favorite!', productId });  
        } else {
          return sendJSON(res, { message: 'Produsul este deja în favorite.' }, 409);  
        }
      } catch (error) {
        console.error('Eroare la adaugarea la favorite:', error);  
        return sendJSON(res, { message: 'Eroare de server la adaugarea la favorite.', error: error.message }, 500);  
      }
    });
  }

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
           await pool.query('UPDATE products SET likes_count = GREATEST(0, COALESCE(likes_count, 0) - 1) WHERE id = $1', [productId]);  
          return sendJSON(res, { message: 'Produs eliminat din favorite!', productId });  
        } else {
          return sendJSON(res, { message: 'Produsul nu a fost gasit în favorite.' }, 404);  
        }
      } catch (error) {
        console.error('Eroare la eliminarea din favorite:', error);  
        return sendJSON(res, { message: 'Eroare de server la eliminarea din favorite.', error: error.message }, 500);  
      }
    });
  }

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


  res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });  
  res.end('Not found');  

}).listen(PORT, () => console.log(`Server fara Express pornit pe http://localhost:${PORT}`));
