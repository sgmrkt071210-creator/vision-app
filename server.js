import express from 'express';
import sqlite3 from 'sqlite3';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import cors from 'cors';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const scryptAsync = promisify(scrypt);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(join(__dirname, 'dist')));

// Database Interface
let db;

const initDb = async () => {
    // Check for Supabase Vars (Cloud)
    if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
        console.log('Connecting to Supabase (HTTP)...');
        try {
            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
            db = { type: 'supabase', client: supabase };
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

        const run = (sql) => new Promise((resolve, reject) => {
            sqliteDb.run(sql, (err) => err ? reject(err) : resolve());
        });

        try {
            await run(`CREATE TABLE IF NOT EXISTS goals (
                id TEXT PRIMARY KEY,
                username TEXT,
                text TEXT,
                category TEXT,
                completed BOOLEAN,
                created_at TEXT,
                data JSON
            )`);
            await run(`CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE,
                password_hash TEXT,
                salt TEXT,
                created_at TEXT
            )`);
        } catch (e) {
            console.error("SQLite Init Error:", e);
        }

        db = { type: 'sqlite', client: sqliteDb };
        console.log('SQLite connected.');
    }
};

initDb();

// --- Auth Utilities ---
const hashPassword = async (password) => {
    const salt = randomBytes(16).toString('hex');
    const buf = await scryptAsync(password, salt, 64);
    return { salt, hash: buf.toString('hex') };
};

const verifyPassword = async (password, hash, salt) => {
    const buf = await scryptAsync(password, salt, 64);
    return timingSafeEqual(Buffer.from(hash, 'hex'), buf);
};

// --- API Endpoints ---

// Auth: Register
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password required" });

    try {
        const { salt, hash } = await hashPassword(password);
        const id = randomBytes(8).toString('hex');
        const now = new Date().toISOString();

        if (db.type === 'supabase') {
            const { error } = await db.client.from('users').insert([{
                id, username, password_hash: hash, salt, created_at: now
            }]);
            if (error) throw error;
        } else {
            await new Promise((resolve, reject) => {
                db.client.run(
                    "INSERT INTO users (id, username, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)",
                    [id, username, hash, salt, now],
                    (err) => err ? reject(err) : resolve()
                );
            });
        }
        res.json({ success: true, username });
    } catch (e) {
        console.error("Register Error:", e);
        res.status(500).json({ error: "Registration failed or username exists" });
    }
});

// Auth: Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password required" });

    try {
        let user;
        if (db.type === 'supabase') {
            const { data, error } = await db.client.from('users').select('*').eq('username', username).single();
            if (error || !data) return res.status(401).json({ error: "Invalid credentials" });
            user = data;
        } else {
            user = await new Promise((resolve, reject) => {
                db.client.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        }

        if (!user) return res.status(401).json({ error: "Invalid credentials" });

        const isValid = await verifyPassword(password, user.password_hash, user.salt);
        if (!isValid) return res.status(401).json({ error: "Invalid credentials" });

        res.json({ success: true, username: user.username });
    } catch (e) {
        console.error("Login Error:", e);
        res.status(500).json({ error: "Login failed" });
    }
});

// Gemini API Proxy (Analysis) - Using stable model
app.post('/api/analyze', async (req, res) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("API Key not configured");

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
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

// Gemini API Proxy (Chat) - Using stable model and systemInstruction
app.post('/api/chat', async (req, res) => {
    const { message, context, goal } = req.body;

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const systemPrompt = `
            あなたは目標達成コーチです。ユーザーの目標「${goal.text}」について相談を受けています。
            現状の目標詳細: ${JSON.stringify(goal)}
            
            ユーザーの問いかけに対して、具体的かつ励ましのあるアドバイスをしてください。
            必要であれば目標の修正案（下方修正や上方修正）も提案してください。
            返答は短く簡潔なテキストで返してください。
        `;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: [
                    ...(context || []), // Previous chat history
                    { role: "user", parts: [{ text: message }] }
                ]
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error('Gemini API Error details:', JSON.stringify(data.error, null, 2));
            throw new Error(data.error.message);
        }

        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!reply) {
            console.error('No content in response:', JSON.stringify(data, null, 2));
            throw new Error('No response from AI');
        }

        // Return the clean reply
        res.json({ candidates: [{ content: { parts: [{ text: reply }] } }] });

    } catch (error) {
        console.error('Chat API Error:', error);
        res.status(500).json({ error: 'Chat failed' });
    }
});

// Goals API (GET)
app.get('/api/goals', async (req, res) => {
    const { username } = req.query;
    if (!username) return res.json([]);

    try {
        if (!db) throw new Error("Database not initialized");

        if (db.type === 'supabase') {
            const { data, error } = await db.client
                .from('goals')
                .select('*')
                .eq('username', username)
                .order('created_at', { ascending: false });

            if (error) throw error;

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

// Goals API (POST)
app.post('/api/goals', async (req, res) => {
    const { username, goals } = req.body;
    if (!username) return res.status(400).json({ error: "Username is required" });

    const goalList = Array.isArray(goals) ? goals : [];

    try {
        if (!db) throw new Error("Database not initialized");

        if (db.type === 'supabase') {
            const { error: delError } = await db.client.from('goals').delete().eq('username', username);
            if (delError) throw delError;

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

            if (rowsToInsert.length > 0) {
                const { error: insError } = await db.client.from('goals').insert(rowsToInsert);
                if (insError) throw insError;
            }
        } else {
            db.client.serialize(() => {
                db.client.run("DELETE FROM goals WHERE username = ?", [username]);
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
