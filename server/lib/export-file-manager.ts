import fs from 'fs';
import path from 'path';
import { readFileSync } from 'fs';

/**
 * エクスポートデータをファイルシステムに保存するための管理クラス
 * 将来的にAzureなどのクラウドストレージに切り替える際の抽象化レイヤー
 */
export class ExportFileManager {
  private baseDir: string;

  constructor(baseDir: string = 'knowledge-base/exports') {
    this.baseDir = baseDir;
    this.ensureDirectoryExists();
  }

  /**
   * エクスポートディレクトリが存在することを確認
   */
  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
      console.log(`エクスポートディレクトリを作成しました: ${this.baseDir}`);
    }
  }

  /**
   * チャットIDに基づくサブディレクトリを作成
   * @param chatId チャットID
   */
  private ensureChatDirectoryExists(chatId: number): string {
    const chatDir = path.join(this.baseDir, `chat_${chatId}`);
    if (!fs.existsSync(chatDir)) {
      fs.mkdirSync(chatDir, { recursive: true });
    }
    return chatDir;
  }

  /**
   * フォーマット済みデータをJSONファイルとして保存
   * @param chatId チャットID
   * @param data 保存するデータ
   * @returns 保存したファイルのパス
   */
  saveFormattedExport(chatId: number, data: any): string {
    const chatDir = this.ensureChatDirectoryExists(chatId);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `export_${timestamp}.json`;
    const filePath = path.join(chatDir, fileName);

    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`エクスポートデータを保存しました: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error(`エクスポートデータの保存に失敗しました: ${error}`);
      throw error;
    }
  }

  /**
   * 指定したチャットIDの最新のエクスポートデータを取得
   * @param chatId チャットID
   * @returns 最新のエクスポートデータ、存在しない場合はnull
   */
  getLatestExport(chatId: number): any | null {
    const chatDir = path.join(this.baseDir, `chat_${chatId}`);
    if (!fs.existsSync(chatDir)) {
      return null;
    }

    try {
      // エクスポートファイルを日付順にソート
      const files = fs.readdirSync(chatDir)
        .filter(file => file.startsWith('export_') && file.endsWith('.json'))
        .sort()
        .reverse();

      if (files.length === 0) {
        return null;
      }

      const latestFile = path.join(chatDir, files[0]);
      const data = fs.readFileSync(latestFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`最新のエクスポートデータの読み込みに失敗しました: ${error}`);
      return null;
    }
  }

  /**
   * 指定したチャットIDのすべてのエクスポートファイルを一覧表示
   * @param chatId チャットID
   * @returns ファイルパスの配列
   */
  listExportFiles(chatId: number): string[] {
    const chatDir = path.join(this.baseDir, `chat_${chatId}`);
    if (!fs.existsSync(chatDir)) {
      return [];
    }

    try {
      return fs.readdirSync(chatDir)
        .filter(file => file.startsWith('export_') && file.endsWith('.json'))
        .map(file => path.join(chatDir, file));
    } catch (error) {
      console.error(`エクスポートファイルの一覧取得に失敗しました: ${error}`);
      return [];
    }
  }
}

// シングルトンインスタンスをエクスポート
export const exportFileManager = new ExportFileManager();