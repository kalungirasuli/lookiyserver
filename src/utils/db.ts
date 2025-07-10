import postgres from 'postgres';
import logger from './logger';

const sql = postgres({
  host: 'localhost',
  port: 5432,
  username: 'admin',
  password: 'supersecretpassword',
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