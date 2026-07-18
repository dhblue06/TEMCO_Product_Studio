const { execSync } = require('child_process');
try {
  const result = execSync('npx tsc --noEmit', {
    cwd: 'C:/Users/xjm06/Documents/TEMCO/TEMCO_Product_Studio/server',
    encoding: 'utf8',
    timeout: 30000
  });
  console.log('COMPILE OK');
  console.log(result);
} catch (e) {
  console.log('COMPILE ERROR:');
  console.log(e.stdout);
  console.log(e.stderr);
}
