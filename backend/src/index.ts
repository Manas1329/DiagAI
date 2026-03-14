import express from 'express';
import cors    from 'cors';

import parseRouter    from './routes/parse';
import diagramsRouter from './routes/diagrams';

const app  = express();
const PORT = process.env.PORT ?? 4000;

// ─── Middleware ───────────────────────────────────────────────────────────────

// CORS — tighten `origin` in production to your actual frontend domain
app.use(cors({ origin: process.env.ALLOWED_ORIGIN ?? 'http://localhost:3000' }));
app.use(express.json({ limit: '1mb' }));

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
app.use('/api/parse',    parseRouter);
app.use('/api/diagrams', diagramsRouter);

// 404 fallback
app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`DiagAI backend listening on http://localhost:${PORT}`);
});

export default app;
