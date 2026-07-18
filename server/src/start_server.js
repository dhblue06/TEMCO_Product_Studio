const fs = require('fs');
const cp = require('child_process');

// Start the server
const server = cp.spawn('npx', ['tsx', 'src/index.ts'], {
  cwd: 'C:/Users/xjm06/Documents/TEMCO/TEMCO_Product_Studio/server',
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true,
  detached: true
});

let output = '';
server.stdout.on('data', (d) => { output += d.toString(); });
server.stderr.on('data', (d) => { output += d.toString(); });

setTimeout(() => {
  fs.writeFileSync('C:/Users/xjm06/Documents/TEMCO/TEMCO_Product_Studio/server/src/server_debug.log', output);
  
  // Check if server started
  const http = require('http');
  http.get('http://localhost:3001/api/health', (res) => {
    let data = '';
    res.on('data', (c) => data += c);
    res.on('end', () => {
      fs.appendFileSync('C:/Users/xjm06/Documents/TEMCO/TEMCO_Product_Studio/server/src/server_debug.log', '\nHEALTH: ' + data);
      console.log('Server running:', data);
    });
  }).on('error', (e) => {
    fs.appendFileSync('C:/Users/xjm06/Documents/TEMCO/TEMCO_Product_Studio/server/src/server_debug.log', '\nHEALTH ERROR: ' + e.message);
    console.log('Server NOT running');
  });
}, 5000);
