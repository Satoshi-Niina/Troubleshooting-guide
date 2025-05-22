import { Router } from 'express';
import path from 'path';
import fs from 'fs';

const router = Router();

// Troubleshooting flow routes
router.get('/', (req, res) => {
  try {
    const troubleshootingDir = path.join(process.cwd(), 'knowledge-base', 'troubleshooting');
    if (!fs.existsSync(troubleshootingDir)) {
      return res.json([]);
    }

    const files = fs.readdirSync(troubleshootingDir);
    const troubleshootingFlows = files
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(troubleshootingDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
      });

    res.json(troubleshootingFlows);
  } catch (error) {
    console.error('トラブルシューティングフロー取得エラー:', error);
    res.status(500).json({ error: 'Failed to fetch troubleshooting flows' });
  }
});

export default router;