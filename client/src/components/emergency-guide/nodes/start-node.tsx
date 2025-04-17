import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const StartNode = ({ data }: NodeProps) => {
  return (
    <div className="px-4 py-2 shadow-md rounded-full bg-green-500 text-white min-w-[100px] text-center">
      <div className="font-bold">{data.label || '開始'}</div>
      
      {/* 出力ハンドルのみ */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#555' }}
        isConnectable={true}
      />
    </div>
  );
};

export default memo(StartNode);