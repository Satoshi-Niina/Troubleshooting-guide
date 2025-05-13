import axios from 'axios';

const API_BASE_URL = '/api/knowledge';

export interface ImageMetadata {
  id: string;
  file: string;
  title: string;
  category: string;
  keywords: string[];
  description: string;
}

export interface FlowStep {
  id: string;
  description: string;
  imageId?: string;
  nextStepId?: string;
}

export interface Flow {
  id: string;
  title: string;
  steps: FlowStep[];
}

export const knowledgeBaseApi = {
  // GPTデータの取得
  getGptData: async () => {
    const response = await axios.get(`${API_BASE_URL}/gpt/data`);
    return response.data;
  },

  // Fuse画像メタデータの取得
  getFuseImages: async () => {
    const response = await axios.get(`${API_BASE_URL}/fuse/images`);
    return response.data as ImageMetadata[];
  },

  // トラブルシューティングフローの取得
  getTroubleshootingFlows: async () => {
    const response = await axios.get(`${API_BASE_URL}/troubleshooting/flows`);
    return response.data as Flow[];
  },

  // 共有データの取得
  getSharedData: async (type: string) => {
    const response = await axios.get(`${API_BASE_URL}/shared/${type}`);
    return response.data;
  },

  // 画像ファイルの取得
  getImage: (category: string, filename: string) => {
    return `${API_BASE_URL}/images/${category}/${filename}`;
  },

  // 新しいフローの作成
  createFlow: async (flow: Flow) => {
    const response = await axios.post(`${API_BASE_URL}/troubleshooting/flows`, flow);
    return response.data;
  },

  // 画像メタデータの更新
  updateImageMetadata: async (metadata: ImageMetadata) => {
    const response = await axios.post(`${API_BASE_URL}/fuse/metadata`, metadata);
    return response.data;
  }
}; 