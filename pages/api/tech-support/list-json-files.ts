import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // knowledge-base/data/metadata/images ディレクトリのパスを設定
    const metadataDir = path.join(process.cwd(), 'public', 'knowledge-base', 'data', 'metadata', 'images');
    
    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(metadataDir)) {
      fs.mkdirSync(metadataDir, { recursive: true });
    }

    // JSONファイルの一覧を取得
    const files = fs.readdirSync(metadataDir)
      .filter(file => file.endsWith('.json'))
      .sort((a, b) => {
        // 最新のファイルを先頭に
        const statA = fs.statSync(path.join(metadataDir, a));
        const statB = fs.statSync(path.join(metadataDir, b));
        return statB.mtime.getTime() - statA.mtime.getTime();
      });

    res.status(200).json(files);
  } catch (error) {
    console.error('Error listing JSON files:', error);
    res.status(500).json({ error: 'Failed to list JSON files' });
  }
} 