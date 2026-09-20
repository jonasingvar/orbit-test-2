import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { db, DB_PATH } from './db.js';
import { metaRouter } from './routes/meta.js';
import { sessionsRouter } from './routes/sessions.js';
import { speakersRouter } from './routes/speakers.js';
import { usersRouter } from './routes/users.js';

const PORT = process.env.PORT ?? 3001;

if (!existsSync(DB_PATH)) {
  console.error('✗ No database found. Run `npm run db:seed` first.');
  process.exit(1);
}

export const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', metaRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/speakers', speakersRouter);
app.use('/api/users', usersRouter);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, sessions: db.prepare('SELECT COUNT(*) n FROM sessions').get().n });
});

app.use('/api', (req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` }));

app.use((err, req, res, next) => {
  console.error('✗', err);
  res.status(err.status ?? 500).json({ error: err.message });
});

// Started directly (`node server/index.js`) it listens; imported — by a test
// that wants the app on an ephemeral port — it does not.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`▸ ORBIT API on http://localhost:${PORT}/api`);
  });
}
