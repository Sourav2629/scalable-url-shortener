function classifyReferrer(referrer) {
  if (!referrer) return 'Direct';

  try {
    const url = new URL(referrer);
    const hostname = url.hostname.toLowerCase();

    const searchEngines = ['google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'search.yahoo.com'];
    if (searchEngines.some(se => hostname.includes(se))) return 'Search';

    const socialPlatforms = ['facebook.com', 'twitter.com', 't.co', 'instagram.com', 'linkedin.com', 'reddit.com', 't.co'];
    if (socialPlatforms.some(sp => hostname.includes(sp))) return 'Social';

    return 'Referral';
  } catch (e) {
    return 'Other';
  }
}

module.exports = { classifyReferrer };
