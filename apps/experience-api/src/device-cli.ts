import { openDefaultDeviceStore } from './devices.js';

const [action, id, ...extra] = process.argv.slice(2);
if (extra.length || (action === 'pair-code' && id) || (action === 'revoke' && !id) || !['pair-code', 'revoke'].includes(action)) {
  console.error('Usage: device pair-code | device revoke <device-id>');
  process.exitCode = 1;
} else {
  const store = openDefaultDeviceStore();
  try {
    if (action === 'pair-code') {
      process.stdout.write(`${store.createPairingCode()}\n`);
    } else if (id && store.revoke(id)) {
      process.stdout.write('Device revoked.\n');
    } else {
      console.error('Device not found or already revoked.');
      process.exitCode = 1;
    }
  } finally {
    store.close();
  }
}
