import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const DecisionNode = ({ data }: NodeProps) => {
  return (
    <div className="px-4 py-2 shadow-md rounded-md bg-yellow-100 border-2 border-yellow-500 min-w-[150px]" style={{ 
      transform: 'rotate(45deg)',
      transformOrigin: 'center',
      width: '140px',
      height: '140px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <div style={{ transform: 'rotate(-45deg)' }} className="text-center">
        <div className="font-bold text-yellow-800">{data.label || '判断'}</div>
        {data.message && (
          <div className="mt-2 text-sm text-gray-700">{data.message}</div>
        )}
      </div>
      
      {/* 入力と複数の出力ハンドル - 角に配置 */}
      {/* 上部の角（入力） */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ 
          background: '#555',
          width: '12px',
          height: '12px',
          border: '2px solid #333',
          transform: 'rotate(-45deg) translateY(-41px)' 
        }}
        isConnectable={true}
      />
      
      {/* 右側の角（Yes出力） */}
      <Handle
        type="source"
        position={Position.Right}
        style={{ 
          background: '#6c0',
          width: '12px',
          height: '12px',
          border: '2px solid #360',
          transform: 'rotate(-45deg) translateX(41px)' 
        }}
        id="yes"
        isConnectable={true}
      />
      
      {/* 下側の角（No出力） */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ 
          background: '#f00',
          width: '12px',
          height: '12px',
          border: '2px solid #900',
          transform: 'rotate(-45deg) translateY(41px)' 
        }}
        id="no"
        isConnectable={true}
      />
      
      {/* 左側の角（別の出力） */}
      <Handle
        type="source"
        position={Position.Left}
        style={{ 
          background: '#09f',
          width: '12px',
          height: '12px',
          border: '2px solid #06c',
          transform: 'rotate(-45deg) translateX(-41px)' 
        }}
        id="other"
        isConnectable={true}
      />
    </div>
  );
};

export default memo(DecisionNode);