const { Pool } = require('pg');

// Este o practica foarte buna sa tii datele sensibile in variabile de mediu
// si sa nu le scrii direct in cod. Poti folosi pachetul 'dotenv' pentru asta.
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'postgres123.ctck2644kzwq.eu-north-1.rds.amazonaws.com',
  database: process.env.DB_DATABASE || 'postgres',
  password: process.env.DB_PASSWORD || 'Postgres123.',
  port: process.env.DB_PORT || 5432,
  ssl: {
      rejectUnauthorized: false
  }
});

// Testam conexiunea la pornirea aplicatiei
pool.connect((err, client, done) => {
  if (err) {
    console.error('❌ Database connection failed:', err.stack);
  } else {
    console.log('✅ Successfully connected to the AWS RDS PostgreSQL database.');
    client.release(); // Elibereaza clientul inapoi in pool
  }
});

module.exports = pool;