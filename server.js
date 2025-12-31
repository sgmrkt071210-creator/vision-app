import express from 'express';
import sqlite3 from 'sqlite3';
import pg from 'pg';
import dotenv from 'dotenv';
import cors from 'cors';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(join(__dirname, 'dist')));

// Database Interface
let db;

const initDb = async () => {
    if (process.env.DATABASE_URL) {
        // PostgreSQL (Cloud)
        console.log('Connecting to PostgreSQL...');
        const { Pool } = pg;
        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 10000
        });

        // Wrapper to mimic SQLite API for standardized usage
        db = {
            query: async (text, params) => pool.query(text, params),
            type: 'postgres'
        };

        // Initialize Table
        await db.query(`CREATE TABLE IF NOT EXISTS goals (
            id TEXT PRIMARY KEY,
            text TEXT,
            category TEXT,
            completed BOOLEAN,
            created_at TEXT, 
            data JSONB
        )`);
        console.log('PostgreSQL connected and initialized.');
    } else {
        // SQLite (Local)
        console.log('Connecting to SQLite...');
        const sqliteDb = new sqlite3.Database('./vision-app.db', (err) => {
            if (err) console.error('Database connection error:', err);
        });

        db = {
            query: (text, params) => {
                return new Promise((resolve, reject) => {
                    // Primitive conversion from Postgres syntax ($1, $2) to SQLite (?)
                    // NOTE: This is a simplified adapter. Complex queries would need a builder.
                    // For current usage, we only use INSERT and SELECT.
                    // However, conversion is tricky. Easier to separate logic in handlers.
                    reject(new Error("Use type-specific methods"));
                });
            },
            sqlite: sqliteDb,
            type: 'sqlite'
        };

        sqliteDb.run(`CREATE TABLE IF NOT EXISTS goals (
            id TEXT PRIMARY KEY,
            text TEXT,
            category TEXT,
            completed BOOLEAN,
            created_at TEXT,
            data JSON
        )`);
        console.log('SQLite connected.');
    }
};

initDb();

// Gemini API Proxy
app.post('/api/analyze', async (req, res) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("API Key not configured");

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Failed to fetch from Gemini API' });
    }
});

// Goals API
app.get('/api/goals', async (req, res) => {
    try {
        if (db.type === 'postgres') {
            const result = await db.query("SELECT * FROM goals ORDER BY created_at DESC");
            const goals = result.rows.map(row => ({
                id: row.id,
                text: row.text,
                category: row.category,
                completed: row.completed,
                createdAt: row.created_at,
                ...row.data
            }));
            res.json(goals);
        } else {
            db.sqlite.all("SELECT * FROM goals ORDER BY created_at DESC", [], (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                const goals = rows.map(row => ({
                    id: row.id,
                    text: row.text,
                    category: row.category,
                    completed: Boolean(row.completed),
                    createdAt: row.created_at,
                    ...JSON.parse(row.data || '{}')
                }));
                res.json(goals);
            });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/goals', async (req, res) => {
    const goals = req.body;
    const goalList = Array.isArray(goals) ? goals : [goals];

    try {
        if (db.type === 'postgres') {
            // PostgreSQL Transaction
            await db.query('BEGIN');
            await db.query('DELETE FROM goals');

            for (const g of goalList) {
                const { id, text, category, completed, createdAt, ...rest } = g;
                await db.query(
                    'INSERT INTO goals (id, text, category, completed, created_at, data) VALUES ($1, $2, $3, $4, $5, $6)',
                    [String(id), text, category, completed, createdAt, rest] // pg handles JSON automatically
                );
            }
            await db.query('COMMIT');
        } else {
            // SQLite Transaction
            db.sqlite.serialize(() => {
                db.sqlite.run("DELETE FROM goals");
                const stmt = db.sqlite.prepare("INSERT INTO goals (id, text, category, completed, created_at, data) VALUES (?, ?, ?, ?, ?, ?)");

                goalList.forEach(g => {
                    const { id, text, category, completed, createdAt, ...rest } = g;
                    stmt.run(String(id), text, category, completed, createdAt, JSON.stringify(rest));
                });

                stmt.finalize();
            });
        }
        res.json({ status: 'success' });
    } catch (e) {
        if (db.type === 'postgres') await db.query('ROLLBACK');
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Fallback for SPA
app.get(new RegExp('.*'), (req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
