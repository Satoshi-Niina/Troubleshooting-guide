export interface EmergencyGuide {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  steps: string[];
  keywords: string[];
  category: string;
  severity: 'low' | 'medium' | 'high';
  lastUpdated: string;
}

export interface EmergencyGuideSearchResult {
  title: string;
  description: string;
  imageUrl: string;
  steps: string[];
  score?: number;
} 