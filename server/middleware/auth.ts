import { Request, Response, NextFunction } from 'express';
import { verifySession } from '../utils/session';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // フローの生成APIは認証をスキップ
  if (req.path.includes('/generate-flow')) {
    return next();
  }

  try {
    const session = await verifySession(req);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'セッションが無効です。再度ログインしてください。',
        message: 'Not authenticated'
      });
    }
    next();
  } catch (error) {
    console.error('認証エラー:', error);
    res.status(401).json({
      success: false,
      error: '認証に失敗しました'
    });
  }
}; 