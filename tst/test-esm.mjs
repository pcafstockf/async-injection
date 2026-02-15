// This verifies that the ESM build works correctly .
// Run this script with: node tst/test-esm.mjs
import {Inject, Container} from 'async-injection';

console.log('ESM import test...');
console.log('Container:', typeof Container);
console.log('Inject:', typeof Inject);

if (typeof Container === 'function' &&
	typeof Inject === 'function') {
	console.log('✓ ESM imports working correctly');
} else {
	console.error('✗ ESM imports failed');
	process.exit(1);
}
