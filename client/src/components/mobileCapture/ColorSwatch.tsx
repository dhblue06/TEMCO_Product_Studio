// 颜色色块公共组件：有纹理小图片且加载成功时显示图片，否则回退 hex 色块
import React, { useState } from 'react';

/** 默认色 hex 兜底（覆盖点货中文色 + 采集常用西语色，供 PhoneModelSelector / ColorSelector 共用） */
export const DEFAULT_COLOR_HEX: Record<string, string> = {
  // 中文（点货）
  红: '#ef4444', 橙: '#f97316', 黄: '#facc15', 绿: '#22c55e', 蓝: '#3b82f6',
  紫: '#a855f7', 粉: '#ec4899', 黑: '#1f2937', 白: '#ffffff', 灰: '#9ca3af',
  透明: '#f3f4f6', 其他: '#64748b',
  // 西语（采集常用色 COMMON_COLORS）
  Negro: '#1f2937', Blanco: '#ffffff', Azul: '#3b82f6', Rojo: '#ef4444',
  Rosa: '#ec4899', Verde: '#22c55e', Morado: '#a855f7', Naranja: '#f97316',
  Amarillo: '#facc15', Gris: '#9ca3af', Plata: '#c0c0c0', Dorado: '#d4af37',
  Transparente: '#f3f4f6', Multicolor: '#8b5cf6',
};

export function ColorSwatch({ hex, textureUrl, selected, size = 16 }: {
  hex?: string;
  textureUrl?: string;
  selected?: boolean;
  size?: number;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const border = {
    border: '1px solid rgba(0,0,0,.25)',
    boxShadow: selected ? '0 0 0 2px rgba(16,185,129,.35)' : 'none',
  };
  if (textureUrl && !imgFailed) {
    return (
      <img
        src={textureUrl}
        alt=""
        loading="lazy"
        onError={() => setImgFailed(true)}
        style={{
          width: size + 2, height: size + 2, borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
          background: '#fff', ...border,
        }}
      />
    );
  }
  return (
    <span
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: hex || 'transparent', ...border,
      }}
    />
  );
}

export default ColorSwatch;
