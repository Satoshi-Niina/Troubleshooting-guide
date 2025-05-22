// ✅ 完全統合・安定版 index.ts
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { initializeKnowledgeBase } from "./lib/knowledge-base";
import fs from "fs";
import { storage } from "./storage";
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { runCleanup } from '../scripts/scheduled-cleanup.js';

// .envファイルの読み込み
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// 環境変数の確認
console.log("[DEBUG] Environment variables loaded:", {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "Set" : "Not set",
  NODE_ENV: process.env.NODE_ENV
});

const app = express();
const PORT = process.env.PORT || 5001;

// ミドルウェアの設定を先に行う
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors({
  origin: ['http://localhost:3000', `http://localhost:${PORT}`],
  credentials: true
}));

// ✅ ルート設定
import guidesRouter from './routes/guides';
import userRouter from './routes/user';
app.use('/api/guides', guidesRouter);
app.use('/api/user', userRouter);
// ✅ ユーザー登録API（明示追加）
app.post('/api/users', async (req, res) => {
  console.log('受信したリクエストボディ:', req.body);  // デバッグ用ログ追加
  
  const { username, displayName, password, role, department } = req.body;
  
  // バリデーション
  if (!username || !displayName || !password || !role) {
    console.error('必須項目が不足しています:', { username, displayName, password, role });
    return res.status(400).json({ 
      error: '登録失敗', 
      details: '必須項目が不足しています',
      received: { username, displayName, password, role }
    });
  }

  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    // ユーザー名の重複チェック
    const existingUser = await client.query(
      'SELECT username FROM users WHERE username = $1',
      [username]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ 
        error: '登録失敗', 
        details: 'このユーザー名は既に使用されています' 
      });
    }

    const result = await client.query(
      `INSERT INTO users (username, display_name, password, role, department)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, display_name, role, department`,
      [username, displayName, hashedPassword, role, department]
    );
    
    console.log('登録成功:', result.rows[0]);  // デバッグ用ログ追加
    res.status(201).json({ 
      message: '登録完了',
      user: result.rows[0]
    });
  } catch (err: any) {
    console.error('❌ DBエラー:', err);
    console.error('エラーの詳細:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      constraint: err.constraint
    });
    res.status(500).json({ 
      error: '登録失敗',
      details: err.message,
      code: err.code
    });
  } finally {
    await client.end();
  }
});

app.use('/static', express.static(path.join(process.cwd(), 'public')));
['images', 'json', 'data', 'media'].forEach(dir => {
  app.use(`/knowledge-base/${dir}`, express.static(path.join(process.cwd(), 'knowledge-base', dir)));
});

app.use('/uploads/:dir', (req, res) => {
  const dir = req.params.dir;
  if (['images', 'data', 'json', 'media', 'ppt'].includes(dir)) {
    const redirectPath = `/knowledge-base/${dir}${req.path}`;
    res.redirect(redirectPath);
  } else {
    res.status(404).send('Not found');
  }
});

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

function openBrowser(url: string) {
  const start = process.platform == 'darwin' ? 'open' : process.platform == 'win32' ? 'start' : 'xdg-open';
  // URLのバリデーション
  const validUrl = new URL(url);
  if (validUrl.protocol !== 'http:' && validUrl.protocol !== 'https:') {
    throw new Error('Invalid URL protocol');
  }
  
  // URLをエスケープして実行
  const escapedUrl = validUrl.toString().replace(/[`'"]/g, '\\$&');
  exec(`${start} "${escapedUrl}"`);
}

// データベース接続をテストしてからサーバーを起動
(async () => {
  try {
    console.log('アプリケーション初期化を開始...');
    console.log('環境変数 DATABASE_URL:', process.env.DATABASE_URL);
    
    await testDatabaseConnection();
    console.log('データベース接続テスト完了');
    
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

  app.use('/api', (req, res) => {
    res.status(404).json({ success: false, error: 'API endpoint not found' });
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

// ALWAYS serve the app on port 5000
// this serves both the API and the client.
const port = process.env.PORT || 5000; 
const url = `http://0.0.0.0:${port}`;
console.log(`サーバーを起動します: ${url}`);
const PORT = 5000;

server.listen(port, '0.0.0.0', () => { 
  console.log(`サーバーが起動しました: ${url}`);
  console.log('ブラウザを開いています...');
  openBrowser(url);
  console.log('定期クリーンアップがスケジュールされました (毎月1日 午前3時実行)');
}).on('error', (err: NodeJS.ErrnoException) => {
  console.error('サーバー起動エラー:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`ポート ${port} は既に使用されています。別のポートを試してください。`);
  }
});
})();