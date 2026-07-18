const { execSync } = require('child_process');

// Kill existing node processes
try { execSync('taskkill //F //IM node.exe', { timeout: 3000 }); } catch {}

// Wait a moment
const start = Date.now();
while (Date.now() - start < 2000) {}

// Start server
const server = require('child_process').spawn('npx', ['tsx', 'src/index.ts'], {
  cwd: 'C:/Users/xjm06/Documents/TEMCO/TEMCO_Product_Studio/server',
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true,
  detached: true
});

let output = '';
server.stdout.on('data', d => { output += d.toString(); });
server.stderr.on('data', d => { output += d.toString(); });

// Wait for startup
setTimeout(() => {
  const fs = require('fs');
  fs.writeFileSync('C:/Users/xjm06/Documents/TEMCO/TEMCO_Product_Studio/server/src/startup.log', output);

  // Test the scan endpoint
  const http = require('http');
  const req = http.request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/upload/scan-folder',
    method: 'POST'
  }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      fs.appendFileSync('C:/Users/xjm06/Documents/TEMCO/TEMCO_Product_Studio/server/src/startup.log', '\n\nSCAN RESPONSE: ' + data.substring(0, 500));
    });
  });
  req.on('error', e => {
    fs.appendFileSync('C:/Users/xjm06/Documents/TEMCO/TEMCO_Product_Studio/server/src/startup.log', '\n\nERROR: ' + e.message);
  });
  req.end();
}, 8000);
