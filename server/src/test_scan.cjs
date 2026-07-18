const http = require('http');

// Test server health
http.get('http://localhost:3001/api/health', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    require('fs').writeFileSync('C:/Users/xjm06/Documents/TEMCO/TEMCO_Product_Studio/server/src/health_result.txt', 'Health: ' + data);
    
    // Now test scan-folder endpoint
    const req = http.request('http://localhost:3001/api/upload/scan-folder', { method: 'POST' }, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        require('fs').appendFileSync('C:/Users/xjm06/Documents/TEMCO/TEMCO_Product_Studio/server/src/health_result.txt', '\nScan: ' + d.substring(0, 300));
      });
    });
    req.on('error', e => {
      require('fs').appendFileSync('C:/Users/xjm06/Documents/TEMCO/TEMCO_Product_Studio/server/src/health_result.txt', '\nScan Error: ' + e.message);
    });
    req.end();
  });
}).on('error', (e) => {
  require('fs').writeFileSync('C:/Users/xjm06/Documents/TEMCO/TEMCO_Product_Studio/server/src/health_result.txt', 'Error: ' + e.message);
});
