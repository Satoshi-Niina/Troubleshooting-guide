import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import path from "path";
import { initializeKnowledgeBase } from "./lib/knowledge-base";
import fs from "fs";
import axios from "axios";
import { storage } from "./storage";
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { runCleanup } from '../scripts/scheduled-cleanup.js';
import { fileURLToPath } from 'url';
import open from 'open';

// __dirnameの代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .envファイルの読み込み
dotenv.config({ path: path.resolve(__dirname, '.env') });

// 環境変数の確認
console.log("[DEBUG] Environment variables loaded:", {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "Set" : "Not set",
  NODE_ENV: process.env.NODE_ENV
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static files from public directory
app.use('/static', express.static(path.join(process.cwd(), 'public')));

// 知識ベースディレクトリへのアクセスを一元化
app.use('/knowledge-base/images', express.static(path.join(process.cwd(), 'knowledge-base', 'images')));
app.use('/knowledge-base/data', express.static(path.join(process.cwd(), 'knowledge-base', 'data')));
app.use('/knowledge-base/json', express.static(path.join(process.cwd(), 'knowledge-base', 'json')));
app.use('/knowledge-base/media', express.static(path.join(process.cwd(), 'knowledge-base', 'media')));

// 完全に/knowledge-baseに一元化、/uploadsへのリクエストを全て/knowledge-baseに転送
app.use('/uploads/:dir', (req, res) => {
  const dir = req.params.dir;
  // 許可されたディレクトリのみリダイレクト
  if (['images', 'data', 'json', 'media', 'ppt'].includes(dir)) {
    const redirectPath = `/knowledge-base/${dir}${req.path}`;
    console.log(`リダイレクト: ${req.path} -> ${redirectPath}`);
    res.redirect(redirectPath);
  } else {
    res.status(404).send('Not found');
  }
});

// Add a test route to serve our HTML test page
app.get('/test', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'api-test.html'));
});

// Log all requests for debugging
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  console.log(`[DEBUG] Request received: ${req.method} ${path}`);

  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

    if (capturedJsonResponse) {
      logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
    }

    if (logLine.length > 80) {
      logLine = logLine.slice(0, 79) + "…";
    }

    log(logLine);
  });

  next();
});

// ブラウザを開く関数
async function openBrowser(url: string) {
  try {
    await open(url);
  } catch (e) {
    console.log('ブラウザを自動で開けませんでした:', e);
  }
}

(async () => {
  try {
    // ストレージをアプリケーションのローカル変数として保存
    app.locals.storage = storage;
    console.log('ストレージをアプリケーション変数として設定しました');

    // サーバー起動時に知識ベースを初期化
    console.log('知識ベースの初期化を開始...');
    initializeKnowledgeBase();
    console.log('知識ベースの初期化が完了しました');

    // ディレクトリの確認と作成 - uploads不要
    const dirs = [
      'knowledge-base/images',
      'knowledge-base/json',
      'knowledge-base/data',
      'knowledge-base/media',
      'knowledge-base/ppt'
    ];

    for (const dir of dirs) {
      const dirPath = path.join(process.cwd(), dir);
      if (!fs.existsSync(dirPath)) {
        console.log(`ディレクトリを作成: ${dir}`);
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }

    // サーバー起動時にuploadsのデータをknowledge-baseにコピー
    console.log('uploads -> knowledge-base への同期を開始...');
    try {
      // APIが起動した後に実行するために少し待機
      setTimeout(async () => {
        try {
          const syncResult = await axios.post('http://localhost:5000/api/tech-support/sync-knowledge-base?direction=uploads-to-kb');
          console.log('アップロードデータの同期結果:', syncResult.data);
        } catch (syncErr: any) {
          console.error('同期API呼び出しエラー:', syncErr?.message || '不明なエラー');
        }
      }, 3000);
    } catch (syncErr) {
      console.error('同期処理中にエラーが発生しました:', syncErr);
    }
  } catch (err) {
    console.error('知識ベースの初期化中にエラーが発生しました:', err);
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  const port = 5000;
  const url = `http://localhost:${port}`;
  console.log(`サーバーを起動します: ${url}`);

  // 現在のポートが使用中かどうかをチェックして、使用可能なポートで起動する
  const startServer = (portToUse: number) => {
    server.listen(portToUse, 'localhost', async () => {
      const serverUrl = `http://localhost:${portToUse}`;
      console.log(`サーバーが起動しました: ${serverUrl}`);
      console.log('ブラウザを開いています...');
      try {
        await openBrowser(serverUrl);
      } catch (e) {
        console.log('ブラウザを自動で開けませんでした');
      }
      console.log('定期クリーンアップがスケジュールされました (毎月1日 午前3時実行)');
    }).on('error', (err: NodeJS.ErrnoException) => {
      console.error('サーバー起動エラー:', err);
      if (err.code === 'EADDRINUSE') {
        console.error(`ポート ${portToUse} は既に使用されています。別のポートを試します。`);
        // 次のポートを試す
        startServer(portToUse + 1);
      }
    });
  };

  // 5000番ポートから試行開始
  startServer(port);
})();