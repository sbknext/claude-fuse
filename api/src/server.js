import 'dotenv/config';
import express from 'express';
import ingestRouter from './routes/ingest.js';
import sessionsRouter from './routes/sessions.js';
import mistakesRouter from './routes/mistakes.js';
import skillsRouter from './routes/skills.js';

const app = express();
const PORT = parseInt(process.env.CLAUDE_FUSE_API_PORT || '5457', 10);

app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/ingest', ingestRouter);
app.use('/sessions', sessionsRouter);
app.use('/mistakes', mistakesRouter);
app.use('/skills', skillsRouter);

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
