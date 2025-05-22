import { Request, Response, NextFunction } from 'express';

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      success: false,
      error: 'セッションが無効です。再度ログインしてください。',
      message: 'Not authenticated'
    });
  }
  next();
};