import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const DecisionNode = ({ data }: NodeProps) => {
  return (
    <div className="px-4 py-2 shadow-md rounded-md bg-yellow-100 border border-yellow-500 min-w-[150px]" style={{ 
      transform: 'rotate(45deg)',
      transformOrigin: 'center',
      width: '120px',
      height: '120px',
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
      
      {/* 入力と複数の出力ハンドル */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#555', transform: 'rotate(-45deg)' }}
        isConnectable={true}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#555', transform: 'rotate(-45deg)' }}
        id="yes"
        isConnectable={true}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#555', transform: 'rotate(-45deg)' }}
        id="no"
        isConnectable={true}
      />
    </div>
  );
};

export default memo(DecisionNode);