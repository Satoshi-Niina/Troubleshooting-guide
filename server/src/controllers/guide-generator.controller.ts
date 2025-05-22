import { Request, Response } from 'express';
import { guideGeneratorService } from '../services/guide-generator.service';

export const generateFromKeywords = async (req: Request, res: Response) => {
  try {
    const { keywords } = req.body;
    
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'キーワードが指定されていません'
      });
    }
    
    const guide = await guideGeneratorService.generateFromKeywords(keywords);
    
    res.json({
      success: true,
      guide
    });
  } catch (error) {
    console.error('Guide generation from keywords error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'ガイドの生成に失敗しました'
    });
  }
};

export const generateFromFile = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'ファイルがアップロードされていません'
      });
    }
    
    const guide = await guideGeneratorService.generateFromFile(req.file);
    
    res.json({
      success: true,
      guide
    });
  } catch (error) {
    console.error('Guide generation from file error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'ガイドの生成に失敗しました'
    });
  }
}; 