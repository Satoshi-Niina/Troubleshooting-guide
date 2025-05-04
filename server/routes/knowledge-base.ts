import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';

const knowledgeBasePath = path.join(process.cwd(), 'knowledge-base');

// スキーマ定義
const imageMetadataSchema = z.object({
  id: z.string(),
  filename: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  category: z.string()
});

const flowSchema = z.object({
  id: z.string(),
  title: z.string(),
  steps: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    imageId: z.string().optional()
  }))
});

// ルート登録関数
export function registerKnowledgeBaseRoutes(app: express.Express) {
  // GPTデータの取得
  app.get('/api/knowledge/gpt/data', (req: Request, res: Response) => {
    try {
      const dataPath = path.join(knowledgeBasePath, 'gpt', 'data');
      const files = fs.readdirSync(dataPath);
      const data = files.map(file => {
        const content = fs.readFileSync(path.join(dataPath, file), 'utf-8');
        return JSON.parse(content);
      });
      res.json(data);
    } catch (error) {
      console.error('Error reading GPT data:', error);
      res.status(500).json({ error: 'Failed to read GPT data' });
    }
  });

  // 画像メタデータの取得
  app.get('/api/knowledge/fuse/images', (req: Request, res: Response) => {
    try {
      const metadataPath = path.join(knowledgeBasePath, 'fuse', 'data', 'image_search_data.json');
      if (fs.existsSync(metadataPath)) {
        const data = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        res.json(data);
      } else {
        res.json([]);
      }
    } catch (error) {
      console.error('Error reading image metadata:', error);
      res.status(500).json({ error: 'Failed to read image metadata' });
    }
  });

  // トラブルシューティングフローの取得
  app.get('/api/knowledge/troubleshooting/flows', (req: Request, res: Response) => {
    try {
      const flowsPath = path.join(knowledgeBasePath, 'troubleshooting', 'flows');
      const files = fs.readdirSync(flowsPath);
      const flows = files.map(file => {
        const content = fs.readFileSync(path.join(flowsPath, file), 'utf-8');
        return JSON.parse(content);
      });
      res.json(flows);
    } catch (error) {
      console.error('Error reading flows:', error);
      res.status(500).json({ error: 'Failed to read flows' });
    }
  });

  // 共有データの取得
  app.get('/api/knowledge/shared/:type', (req: Request, res: Response) => {
    try {
      const { type } = req.params;
      const dataPath = path.join(knowledgeBasePath, 'shared', type);
      if (fs.existsSync(dataPath)) {
        const files = fs.readdirSync(dataPath);
        const data = files.map(file => {
          const content = fs.readFileSync(path.join(dataPath, file), 'utf-8');
          return JSON.parse(content);
        });
        res.json(data);
      } else {
        res.json([]);
      }
    } catch (error) {
      console.error(`Error reading shared ${req.params.type} data:`, error);
      res.status(500).json({ error: `Failed to read shared ${req.params.type} data` });
    }
  });

  // 画像ファイルの提供
  app.get('/api/knowledge/images/:category/:filename', (req: Request, res: Response) => {
    try {
      const { category, filename } = req.params;
      const imagePath = path.join(knowledgeBasePath, category, 'images', filename);
      if (fs.existsSync(imagePath)) {
        res.sendFile(imagePath);
      } else {
        res.status(404).json({ error: 'Image not found' });
      }
    } catch (error) {
      console.error('Error serving image:', error);
      res.status(500).json({ error: 'Failed to serve image' });
    }
  });

  // 新しいトラブルシューティングフローの作成
  app.post('/api/knowledge/troubleshooting/flows', (req: Request, res: Response) => {
    try {
      const flow = flowSchema.parse(req.body);
      const flowsPath = path.join(knowledgeBasePath, 'troubleshooting', 'flows');
      const filePath = path.join(flowsPath, `${flow.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(flow, null, 2));
      res.status(201).json(flow);
    } catch (error) {
      console.error('Error creating flow:', error);
      res.status(500).json({ error: 'Failed to create flow' });
    }
  });

  // 画像メタデータの更新
  app.post('/api/knowledge/fuse/metadata', (req: Request, res: Response) => {
    try {
      const metadata = imageMetadataSchema.parse(req.body);
      const metadataPath = path.join(knowledgeBasePath, 'fuse', 'data', 'image_search_data.json');
      let existingData = [];
      if (fs.existsSync(metadataPath)) {
        existingData = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      }
      const updatedData = [...existingData, metadata];
      fs.writeFileSync(metadataPath, JSON.stringify(updatedData, null, 2));
      res.status(201).json(metadata);
    } catch (error) {
      console.error('Error updating image metadata:', error);
      res.status(500).json({ error: 'Failed to update image metadata' });
    }
  });
} 