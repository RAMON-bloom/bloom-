import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

// Vite only injects `VITE_`-prefixed vars into the client bundle (import.meta.env); server-side
// handlers here read process.env directly, same as they do as Vercel serverless functions in
// production (which get env vars natively), so .env.local needs to be loaded explicitly here.
dotenv.config({ path: '.env.local' });
import parseResume from './api/parse-resume';
import driveListLogs from './api/drive/list-logs';
import driveSummarizeLog from './api/drive/summarize-log';
import driveBackup from './api/drive/backup';
import driveRestore from './api/drive/restore';
import driveUploadResume from './api/drive/upload-resume';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '15mb' }));

  // These handlers are written as plain (req, res) functions so the same
  // implementation is used both here (local dev via Express) and as
  // Vercel serverless functions in production (see /api).
  app.post('/api/parse-resume', parseResume);
  app.post('/api/drive/list-logs', driveListLogs);
  app.post('/api/drive/summarize-log', driveSummarizeLog);
  app.post('/api/drive/backup', driveBackup);
  app.post('/api/drive/restore', driveRestore);
  app.post('/api/drive/upload-resume', driveUploadResume);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
