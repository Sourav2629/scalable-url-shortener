/**
 * Diagnostic script: inspect analytics events and test ua-parser with real user agents.
 * Run: node scripts/diagnose-analytics.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config');
const AnalyticsEvent = require('../src/modules/analytics/infrastructure/models/analytics-event.model');
const { parseUserAgent } = require('../src/modules/analytics/utils/ua-parser');

// Real-world user agents for testing
const USER_AGENTS = {
  chrome_windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  brave_windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  brave_with_shield: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  brave_linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  firefox_windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
  safari_mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
};

async function main() {
  await mongoose.connect(config.database.getMongoUri());
  console.log('Connected to MongoDB.\n');

  // 1. Test ua-parser with known user agents
  console.log('=== ua-parser-js Detection Results ===');
  console.log('(Brave uses the SAME User-Agent string as Chrome)\n');
  for (const [name, ua] of Object.entries(USER_AGENTS)) {
    const parsed = parseUserAgent(ua);
    console.log(`  ${name}:`);
    console.log(`    UA:       ${ua.substring(0, 80)}...`);
    console.log(`    Browser:  ${parsed.browser}`);
    console.log(`    OS:       ${parsed.os}`);
    console.log(`    Device:   ${parsed.deviceType}`);
    console.log();
  }

  // 2. Inspect recent analytics events
  console.log('=== Recent Analytics Events (last 20) ===\n');
  const recentEvents = await AnalyticsEvent.find()
    .sort({ timestamp: -1 })
    .limit(20)
    .lean();

  if (recentEvents.length === 0) {
    console.log('  No analytics events found in database.\n');
  } else {
    for (const evt of recentEvents) {
      console.log(`  Event ${evt.eventId || evt._id}:`);
      console.log(`    URL ID:     ${evt.urlId}`);
      console.log(`    Timestamp:  ${evt.timestamp}`);
      console.log(`    User-Agent: ${(evt.userAgent || '(none)').substring(0, 100)}`);
      console.log(`    Metadata:   ${JSON.stringify(evt.metadata || {})}`);
      console.log();
    }
  }

  // 3. Summarize browser breakdown
  console.log('=== Browser Breakdown (all events) ===\n');
  const browserAgg = await AnalyticsEvent.aggregate([
    { $group: { _id: '$metadata.browser', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  for (const b of browserAgg) {
    console.log(`  ${b._id || '(null)'}: ${b.count}`);
  }

  console.log('\n=== OS Breakdown ===\n');
  const osAgg = await AnalyticsEvent.aggregate([
    { $group: { _id: '$metadata.os', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  for (const o of osAgg) {
    console.log(`  ${o._id || '(null)'}: ${o.count}`);
  }

  console.log('\n=== Device Breakdown ===\n');
  const devAgg = await AnalyticsEvent.aggregate([
    { $group: { _id: '$metadata.deviceType', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  for (const d of devAgg) {
    console.log(`  ${d._id || '(null)'}: ${d.count}`);
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
