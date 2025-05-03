import 'dotenv/config';
import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.DATABASE_URL;
console.log('Connection string:', connectionString);

const client = new Client({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function testConnection() {
  try {
    await client.connect();
    console.log('Database connection successful');
    const result = await client.query('SELECT version()');
    console.log('PostgreSQL version:', result.rows[0].version);
  } catch (error) {
    console.error('Database connection error:', error);
  } finally {
    await client.end();
  }
}

testConnection(); 