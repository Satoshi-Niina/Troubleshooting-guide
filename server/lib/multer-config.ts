import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ESM環境で__dirnameを再現
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// アップロードディレクトリの設定
const uploadDir = path.join(__dirname, '../../uploads');

// アップロードディレクトリが存在しない場合は作成
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ストレージ設定
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // オリジナルのファイル名を維持しつつ、タイムスタンプを追加して一意性を確保
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExt = path.extname(file.originalname);
    const fileName = path.basename(file.originalname, fileExt);
    cb(null, `${fileName}-${uniqueSuffix}${fileExt}`);
  }
});

// ファイルフィルター設定
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // 許可するファイル形式
  const allowedExtensions = ['.pdf', '.docx', '.xlsx', '.pptx', '.txt'];
  const fileExt = path.extname(file.originalname).toLowerCase();
  
  if (allowedExtensions.includes(fileExt)) {
    cb(null, true);
  } else {
    cb(new Error('許可されていないファイル形式です。PDF, DOCX, XLSX, PPTX, TXTのみ許可されています。'));
  }
};

// multerの設定
export const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  }
});