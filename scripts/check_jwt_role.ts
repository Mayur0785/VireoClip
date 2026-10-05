import { config } from '../server/src/config/index.js';

const key = config.supabaseSecretKey;
console.log('Key length:', key.length);
console.log('Prefix:', key.slice(0, 12));
console.log('Contains dots:', key.includes('.'));
if (key.includes('.')) {
  console.log('Dot count:', key.split('.').length - 1);
  console.log('Part 1 length:', key.split('.')[0].length);
  console.log('Part 2 length:', key.split('.')[1].length);
}
