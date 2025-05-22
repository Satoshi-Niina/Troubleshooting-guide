
import { Request } from 'express';

export const verifySession = async (req: Request) => {
  if (!req.session || !req.session.userId) {
    return null;
  }
  return req.session;
};
