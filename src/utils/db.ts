import postgres from 'postgres';
import logger from './logger';
import { config } from 'dotenv';
import process from 'process';
// Load environment variables
config();
const sql = postgres({
  host: 'localhost',
  port: process.env.POSTGRES_PORT,//5432,
  username: process.env.POSTGRES_USERNAME, //'admin',
  password:process.env.POSTGRES_PASSWORD, //'supersecretpassword',
  database: 'lookiy',
  onnotice: msg => logger.info('Database notice', { msg }),
  debug: (connection, query, params) => {
    logger.debug('Database query', {
      query,
      params,
      connectionPid: connection.pid
    });
  },
});

async function testConnection() {
  try {
    const result = await sql`SELECT NOW()`;
    logger.info('Database connection successful', { timestamp: result[0].now });
  } catch (error) {
    logger.error('Database connection failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

testConnection();

export default sql;