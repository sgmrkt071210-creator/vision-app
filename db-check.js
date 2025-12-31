import pg from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error("❌ DATABASE_URL is not set!");
    process.exit(1);
}

console.log(`Checking connection to: ${connectionString.replace(/:[^:/@]+@/, ':****@')}`);

const { Pool } = pg;
const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

pool.connect()
    .then(client => {
        console.log("✅ Connection Successful!");
        return client.query('SELECT NOW()')
            .then(res => {
                console.log("✅ Query Successful! Server time:", res.rows[0].now);
                client.release();
                process.exit(0);
            });
    })
    .catch(err => {
        console.error("❌ Connection Failed:");
        console.error(err);
        process.exit(1);
    });
