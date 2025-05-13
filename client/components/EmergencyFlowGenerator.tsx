import React, { useState } from 'react';

interface EmergencyFlow {
  title: string;
  steps: {
    description: string;
    imageUrl?: string;
  }[];
}

export function EmergencyFlowGenerator() {
  const [keyword, setKeyword] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedFlow, setGeneratedFlow] = useState<EmergencyFlow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateFlow = async () => {
    if (!keyword.trim()) {
      setError('キーワードを入力してください');
      return;
    }

    setIsGenerating(true);
    setError(null);
    
    try {
      const response = await fetch('/api/generate-emergency-flow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ keyword }),
      });

      if (!response.ok) {
        throw new Error('フローの生成に失敗しました');
      }

      const data = await response.json();
      setGeneratedFlow(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : '予期せぬエラーが発生しました');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      {/* タブメニュー */}
      <div style={{ marginBottom: '24px', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <button style={{ padding: '8px 16px', fontWeight: 'bold' }}>新規作成（アップロード）</button>
          <button style={{ padding: '8px 16px' }}>テキスト編集</button>
          <button style={{ padding: '8px 16px' }}>キャラクター編集</button>
        </div>
      </div>

      {/* 入力セクション */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ 
          fontSize: '1.25rem', 
          fontWeight: 'bold', 
          marginBottom: '8px' 
        }}>
          事象入力
        </h2>
        <div style={{ 
          backgroundColor: '#f9fafb', 
          padding: '16px', 
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          <textarea
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="具体的な発生事象と状況を入力してください！これをキーワードとしてフローを生成します。"
            style={{
              width: '100%',
              minHeight: '120px',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #e5e7eb'
            }}
          />
        </div>
        <button
          onClick={generateFlow}
          disabled={isGenerating}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: '#2563eb',
            color: 'white',
            borderRadius: '4px',
            fontWeight: 'bold',
            cursor: isGenerating ? 'not-allowed' : 'pointer',
            opacity: isGenerating ? 0.7 : 1
          }}
        >
          {isGenerating ? '生成中...' : 'フローを生成'}
        </button>
        {error && (
          <div style={{ color: 'red', marginTop: '8px' }}>{error}</div>
        )}
      </div>

      {/* 生成されたフロー */}
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '16px' }}>
        応急処置フロー生成
      </h1>

      {generatedFlow && (
        <div style={{ 
          border: '1px solid #e5e7eb', 
          borderRadius: '8px', 
          padding: '16px' 
        }}>
          <h2 style={{ 
            fontSize: '1.25rem', 
            fontWeight: 'bold', 
            marginBottom: '16px' 
          }}>
            {generatedFlow.title}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {generatedFlow.steps.map((step, index) => (
              <div 
                key={index} 
                style={{ 
                  borderLeft: '4px solid #2563eb',
                  paddingLeft: '16px'
                }}
              >
                <p style={{ marginBottom: '8px' }}>{step.description}</p>
                {step.imageUrl && (
                  <img
                    src={step.imageUrl}
                    alt={`Step ${index + 1}`}
                    style={{ 
                      maxWidth: '100%', 
                      borderRadius: '8px' 
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 