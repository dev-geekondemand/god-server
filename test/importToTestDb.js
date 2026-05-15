require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { MongoClient, BSON: { EJSON } } = require('mongodb');
const fs = require('fs');
const path = require('path');

const TEST_DB_URL = process.env.MONGODB_TEST_URL;
const PROD_DB_URL = process.env.MONGODB_URL;
const DB_NAME = 'geekOnDemand';
const TEST_DIR = __dirname;

if (!TEST_DB_URL) {
  console.error('❌ MONGODB_TEST_URL is not set in .env');
  process.exit(1);
}

if (!PROD_DB_URL) {
  console.error('❌ MONGODB_URL is not set in .env — cannot verify safety');
  process.exit(1);
}

// Hard stop: never run against production
const normalise = url => url.trim().replace(/\/$/, '').toLowerCase();
if (normalise(TEST_DB_URL) === normalise(PROD_DB_URL)) {
  console.error('❌ MONGODB_TEST_URL and MONGODB_URL point to the same database. Aborting to protect production data.');
  process.exit(1);
}

// Extra guard: reject known production host fragments
const PROD_HOST_FRAGMENTS = ['cosmos.azure.com', 'god-database'];
const testUrlLower = TEST_DB_URL.toLowerCase();
for (const fragment of PROD_HOST_FRAGMENTS) {
  if (testUrlLower.includes(fragment)) {
    console.error(`❌ MONGODB_TEST_URL contains a production host pattern ("${fragment}"). Aborting.`);
    process.exit(1);
  }
}

console.log('🛡️  Safety check passed — target is the test database only');

async function run() {
  const client = new MongoClient(TEST_DB_URL);

  try {
    await client.connect();
    console.log('✅ Connected to test DB');

    const db = client.db(DB_NAME);

    const files = fs.readdirSync(TEST_DIR).filter(f => f.endsWith('.json'));

    if (files.length === 0) {
      console.log('⚠️  No JSON files found in test/ folder');
      return;
    }

    for (const file of files) {
      // filename format: geekOnDemand.<collectionName>.json
      const parts = file.replace('.json', '').split('.');
      const collectionName = parts.slice(1).join('.');

      const filePath = path.join(TEST_DIR, file);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const docs = EJSON.parse(raw);

      if (!Array.isArray(docs) || docs.length === 0) {
        console.log(`⚠️  Skipping ${file} — empty or invalid`);
        continue;
      }

      const collection = db.collection(collectionName);

      // Drop existing data to avoid duplicates on re-run
      await collection.deleteMany({});

      const result = await collection.insertMany(docs, { ordered: false });
      console.log(`✅ ${collectionName}: inserted ${result.insertedCount} documents`);
    }

    console.log('\n🎉 Import complete');
  } catch (err) {
    console.error('❌ Import failed:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

run();
