import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || 'postgres://localhost:5432/lookiy');

export default sql;