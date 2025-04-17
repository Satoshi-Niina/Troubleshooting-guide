import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import path from "path";
import { initializeKnowledgeBase } from "./lib/knowledge-base";
import fs from "fs";
import axios from "axios";

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

// 下位互換性のために/uploadsからのリクエストも/knowledge-baseに転送
app.use('/uploads/images', (req, res) => {
  res.redirect(req.baseUrl.replace('/uploads', '/knowledge-base') + req.path);
});
app.use('/uploads/media', (req, res) => {
  res.redirect(req.baseUrl.replace('/uploads', '/knowledge-base') + req.path);
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

(async () => {
  try {
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
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
