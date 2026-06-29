const fs = require('fs');
let c = fs.readFileSync('ProductTable.tsx', 'utf8');
c = c.replace(
  '<span style={{ color: (p as any).main_image_count > 0 || p.mainImageCount > 0 ? "var(--success)" : "var(--warning)" }}>\n                  {(p as any).main_image_count > 0 || p.mainImageCount > 0 ? `🖼 ${(p as any).image_count || p.imageCount}` : "⚠ 无主图"}\n                </span>',
  '<span style={{ color: (p as any).main_image_count > 0 || p.mainImageCount > 0 ? "var(--success)" : "var(--warning)" }}>\n                  {(p as any).main_image_count > 0 || p.mainImageCount > 0 ? `🖼 ${(p as any).image_count || p.imageCount}` : "⚠ 无图"}\n                </span>'
);
fs.writeFileSync('ProductTable.tsx', c, 'utf8');
console.log('OK');
