import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const EndNode = ({ data }: NodeProps) => {
  return (
    <div className="px-4 py-2 shadow-md rounded-full bg-red-500 text-white min-w-[100px] text-center">
      <div className="font-bold">{data.label || '終了'}</div>
      
      {/* 入力ハンドルのみ */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#555' }}
        isConnectable={true}
      />
    </div>
  );
};

export default memo(EndNode);