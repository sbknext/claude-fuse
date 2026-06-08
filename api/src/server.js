/**
 * claude-fuse API server
 *
 * Express app that receives Claude Code session data (ingest), exposes session /
 * mistake / skill / alert / analytics endpoints, and serves a health check.
 *
 * Port: CLAUDE_FUSE_API_PORT env var (default 5457).
 * CORS is intentionally permissive — dashboard runs on a different local port.
 * Set CLAUDE_FUSE_NO_LISTEN=1 to suppress `listen()` during tests.
 */
import 'dotenv/config';
import express from 'express';
import ingestRouter from './routes/ingest.js';
import sessionsRouter from './routes/sessions.js';
import mistakesRouter from './routes/mistakes.js';
import skillsRouter from './routes/skills.js';
import adminRouter from './routes/admin.js';
import alertsRouter from './routes/alerts.js';
import analyticsRouter from './routes/analytics.js';

const app = express();
const PORT = parseInt(process.env.CLAUDE_FUSE_API_PORT || '5457', 10);

// Permissive CORS for local dev — dashboard runs on a different port
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/ingest', ingestRouter);
app.use('/sessions', sessionsRouter);
app.use('/mistakes', mistakesRouter);
app.use('/skills', skillsRouter);
app.use('/admin', adminRouter);
app.use('/alerts', alertsRouter);
app.use('/analytics', analyticsRouter);

// Health
app.get('/health', (_req, res) => res.json({ status: 'ok', port: PORT }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error('[server] unhandled error:', err);
  res.status(500).json({ error: err.message || 'internal error' });
});

// Only start listening when this file is run directly (not in tests)
if (process.env.CLAUDE_FUSE_NO_LISTEN !== '1') {
  app.listen(PORT, () => {
    console.log(`[claude-fuse api] listening on :${PORT}`);
  });
}

export default app;
