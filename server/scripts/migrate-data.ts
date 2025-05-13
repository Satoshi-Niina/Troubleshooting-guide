import fs from 'fs';
import path from 'path';

const migrateData = async () => {
  const oldBaseDir = path.join(process.cwd(), 'knowledge-base');
  const newBaseDir = path.join(process.cwd(), 'knowledge-base', 'processed');

  // 新しいディレクトリ構造を作成
  const dirs = [
    path.join(newBaseDir, 'text'),
    path.join(newBaseDir, 'images'),
    path.join(newBaseDir, 'metadata'),
    path.join(newBaseDir, 'emergency-guides'),
    path.join(newBaseDir, 'temp')
  ];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // 既存のJSONファイルを移行
  const oldJsonDir = path.join(oldBaseDir, 'json');
  const newJsonDir = path.join(newBaseDir, 'emergency-guides');

  if (fs.existsSync(oldJsonDir)) {
    const files = fs.readdirSync(oldJsonDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const oldPath = path.join(oldJsonDir, file);
        const newPath = path.join(newJsonDir, file);
        fs.copyFileSync(oldPath, newPath);
      }
    }
  }

  // 既存の画像ファイルを移行
  const oldImageDir = path.join(oldBaseDir, 'images');
  const newImageDir = path.join(newBaseDir, 'images');

  if (fs.existsSync(oldImageDir)) {
    const files = fs.readdirSync(oldImageDir);
    for (const file of files) {
      const oldPath = path.join(oldImageDir, file);
      const newPath = path.join(newImageDir, file);
      fs.copyFileSync(oldPath, newPath);
    }
  }

  // トラブルシューティングデータを移行
  const oldTroubleshootingDir = path.join(oldBaseDir, 'troubleshooting');
  if (fs.existsSync(oldTroubleshootingDir)) {
    const files = fs.readdirSync(oldTroubleshootingDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const oldPath = path.join(oldTroubleshootingDir, file);
        const newPath = path.join(newJsonDir, `ts_${file}`);
        fs.copyFileSync(oldPath, newPath);
      }
    }
  }

  console.log('データの移行が完了しました');
};

migrateData().catch(console.error); 