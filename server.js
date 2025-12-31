import express from 'express';
import sqlite3 from 'sqlite3';
import { createClient } from '@supabase/supabase-js';
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
    // Check for Supabase Vars (Cloud)
    // We strictly use Supabase if variables are present, otherwise fallback to local SQLite
    if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
        console.log('Connecting to Supabase (HTTP)...');
        try {
            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

            db = {
                type: 'supabase',
                client: supabase
            };
            console.log('Supabase client initialized via HTTP.');
        } catch (err) {
            console.error('Failed to initialize Supabase client:', err);
        }
    } else {
        // SQLite (Local Fallback)
        console.log('Connecting to SQLite (Local)...');
        const sqliteDb = new sqlite3.Database('./vision-app.db', (err) => {
            if (err) console.error('Database connection error:', err);
        });

        sqliteDb.run(`CREATE TABLE IF NOT EXISTS goals (
            id TEXT PRIMARY KEY,
            username TEXT,
            text TEXT,
            category TEXT,
            completed BOOLEAN,
            created_at TEXT,
            data JSON
        )`);

        db = {
            type: 'sqlite',
            client: sqliteDb
        };
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
    const { username } = req.query;
    if (!username) return res.json([]); // Return empty if no user specified

    try {
        if (!db) throw new Error("Database not initialized");

        if (db.type === 'supabase') {
            const { data, error } = await db.client
                .from('goals')
                .select('*')
                .eq('username', username)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Supabase Select Error:', error);
                throw error;
            }

            // Map snake_case to CamelCase standard
            const goals = data.map(row => ({
                id: row.id,
                text: row.text,
                category: row.category,
                completed: row.completed,
                createdAt: row.created_at,
                ...(row.data || {})
            }));
            res.json(goals);
        } else {
            db.client.all("SELECT * FROM goals WHERE username = ? ORDER BY created_at DESC", [username], (err, rows) => {
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
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/goals', async (req, res) => {
    // Expect body: { username: "...", goals: [...] }
    const { username, goals } = req.body;

    if (!username) {
        return res.status(400).json({ error: "Username is required" });
    }

    const goalList = Array.isArray(goals) ? goals : [];

    try {
        if (!db) throw new Error("Database not initialized");

        if (db.type === 'supabase') {
            // "Sync" strategy: Delete all for THIS USER and insert

            // 1. Delete rows for this user
            const { error: delError } = await db.client.from('goals').delete().eq('username', username);

            if (delError) {
                console.error('Supabase Delete Error:', delError);
                throw delError;
            }

            // 2. Prepare data for insert (snake_case)
            const rowsToInsert = goalList.map(g => {
                const { id, text, category, completed, createdAt, ...rest } = g;
                return {
                    id: String(id),
                    username: username,
                    text,
                    category,
                    completed,
                    created_at: createdAt,
                    data: rest
                };
            });

            // 3. Bulk Insert
            if (rowsToInsert.length > 0) {
                const { error: insError } = await db.client.from('goals').insert(rowsToInsert);
                if (insError) {
                    console.error('Supabase Insert Error:', insError);
                    throw insError;
                }
            }
        } else {
            // SQLite Transaction
            db.client.serialize(() => {
                db.client.run("DELETE FROM goals WHERE username = ?", [username]); // Only delete this user's goals
                const stmt = db.client.prepare("INSERT INTO goals (id, username, text, category, completed, created_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)");

                goalList.forEach(g => {
                    const { id, text, category, completed, createdAt, ...rest } = g;
                    stmt.run(String(id), username, text, category, completed, createdAt, JSON.stringify(rest));
                });

                stmt.finalize();
            });
        }
        res.json({ status: 'success' });
    } catch (e) {
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
