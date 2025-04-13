import { apiRequest } from './queryClient';
import { LoginCredentials } from '@shared/schema';

/**
 * Login a user with the provided credentials
 * @param credentials The login credentials
 * @returns User data if login successful
 */
export const login = async (credentials: LoginCredentials) => {
  try {
    // ハードコードされた認証情報 - テスト用
    if (credentials.username === 'niina') {
      // サーバーに送信
      const response = await apiRequest('POST', '/api/auth/login', credentials);
      if (!response.ok) {
        throw new Error('認証サーバーからのレスポンスエラー');
      }
      return await response.json();
    } else {
      throw new Error('ユーザー名が不正です');
    }
  } catch (error) {
    console.error('Login error:', error);
    throw new Error('ログインに失敗しました');
  }
};

/**
 * Logout the current user
 */
export const logout = async () => {
  try {
    await apiRequest('POST', '/api/auth/logout');
  } catch (error) {
    console.error('Logout error:', error);
    throw new Error('ログアウトに失敗しました');
  }
};

/**
 * Get the current logged-in user
 * @returns User data or null if not logged in
 */
export const getCurrentUser = async () => {
  try {
    const response = await fetch('/api/auth/me', {
      credentials: 'include'
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        return null;
      }
      throw new Error('Failed to get current user');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Get current user error:', error);
    return null;
  }
};
