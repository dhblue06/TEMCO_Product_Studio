const { execSync } = require('child_process');
try {
  const result = execSync('echo hello', { encoding: 'utf8', timeout: 5000 });
  console.log('STDOUT:', result);
} catch (e) {
  console.log('ERROR:', e.message);
}
