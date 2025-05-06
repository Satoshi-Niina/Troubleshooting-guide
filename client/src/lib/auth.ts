import { apiRequest } from './queryClient';
import { LoginCredentials } from '@shared/schema';

/**
 * Login a user with the provided credentials
 * @param credentials The login credentials
 * @returns User data if login successful
 */
export const login = async (credentials: LoginCredentials) => {
  try {
    const response = await apiRequest('POST', '/api/login', credentials);
    if (!response.ok) {
      throw new Error('認証に失敗しました');
    }
    return await response.json();
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

/**
 * Logout the current user
 */
export const logout = async () => {
  try {
    // チャット履歴をクリア
    const response = await apiRequest('POST', '/api/chats/clear-history');
    if (!response.ok) {
      console.error('Failed to clear chat history');
    }

    // ログアウト処理
    const logoutResponse = await apiRequest('POST', '/api/logout');
    if (!logoutResponse.ok) {
      throw new Error('ログアウトに失敗しました');
    }

    // ローカルストレージをクリア
    localStorage.clear();
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
};

/**
 * Get the current logged-in user
 * @returns User data or null if not logged in
 */
export const getCurrentUser = async () => {
  try {
    const response = await apiRequest('GET', '/api/user');
    if (!response.ok) {
      if (response.status === 401) {
        return null;
      }
      throw new Error('ユーザー情報の取得に失敗しました');
    }
    return await response.json();
  } catch (error) {
    console.error('Get current user error:', error);
    return null;
  }
};
