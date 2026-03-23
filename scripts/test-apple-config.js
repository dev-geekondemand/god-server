require('dotenv').config();

async function testAppleConfig() {
  console.log('\n=== Apple Sign In Config Test ===\n');

  // 1. Check env var is set
  const clientId = process.env.APPLE_CLIENT_ID;
  if (!clientId) {
    console.error('FAIL: APPLE_CLIENT_ID is not set in .env');
    process.exit(1);
  }
  console.log(`OK   APPLE_CLIENT_ID = "${clientId}"`);

  // 2. Warn if it looks like an Android package (common mistake)
  if (clientId.startsWith('com.') && clientId.split('.').length >= 3) {
    console.warn('WARN: APPLE_CLIENT_ID looks like an Android package ID (starts with "com.")');
    console.warn('      It should be your iOS Bundle Identifier from Apple Developer Portal.');
  } else {
    console.log('OK   APPLE_CLIENT_ID format looks correct (not an Android package)');
  }

  // 3. Fetch Apple's public JWKS to confirm network access
  console.log('\nFetching Apple public keys from https://appleid.apple.com/auth/keys ...');
  try {
    const res = await fetch('https://appleid.apple.com/auth/keys');
    if (!res.ok) {
      console.error(`FAIL: Apple JWKS fetch returned HTTP ${res.status}`);
      process.exit(1);
    }
    const { keys } = await res.json();
    console.log(`OK   Apple returned ${keys.length} public key(s)`);
    keys.forEach((k, i) => console.log(`     Key ${i + 1}: kid=${k.kid}, alg=${k.alg}`));
  } catch (err) {
    console.error('FAIL: Could not reach appleid.apple.com:', err.message);
    process.exit(1);
  }

  // 4. Confirm jwk-to-pem is installed
  try {
    require('jwk-to-pem');
    console.log('OK   jwk-to-pem package is installed');
  } catch {
    console.error('FAIL: jwk-to-pem is not installed. Run: npm install jwk-to-pem');
    process.exit(1);
  }

  console.log('\n=== All checks passed ===');
  console.log('\nNOTE: To confirm "Sign in with Apple" is enabled in Apple Developer Portal,');
  console.log('go to: https://developer.apple.com/account/resources/identifiers/list');
  console.log(`Find App ID: ${clientId}`);
  console.log('Scroll to "Sign In with Apple" — it must show "Enabled"\n');
}

testAppleConfig();
