const fs = require('fs');
let c = fs.readFileSync('ProductTable.tsx', 'utf8');
// Add an action column after the image column
// Find the image column's td closing tag and add an actions column after it
c = c.replace(
  '              </span>\n                </td>\n                <td>\n                  <div className=\"table-actions\">',
  '              </span>\n                </td>\n                <td style={{ textAlign: "center" }}>\n                  <a href={"/api/upload/files/product/" + encodeURIComponent(p.reference)} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ fontSize: 11, padding: "3px 8px", textDecoration: "none" }}>📂</a>\n                </td>\n                <td>\n                  <div className="table-actions\">'
);
fs.writeFileSync('ProductTable.tsx', c, 'utf8');
console.log('OK');
