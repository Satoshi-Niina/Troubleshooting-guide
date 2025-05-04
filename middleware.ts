import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  // 認証が必要なパスかどうかを確認
  const isAuthRequired = request.nextUrl.pathname.startsWith('/api/') ||
                        request.nextUrl.pathname.startsWith('/emergency-guide');

  // knowledge-baseへのアクセスは認証をスキップ
  if (request.nextUrl.pathname.startsWith('/knowledge-base/')) {
    return NextResponse.next();
  }

  // 認証が必要なパスの場合
  if (isAuthRequired) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

    // トークンがない場合はログインページにリダイレクト
    if (!token) {
      const signInUrl = new URL('/auth/signin', request.url);
      signInUrl.searchParams.set('callbackUrl', request.nextUrl.pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  return NextResponse.next();
} 