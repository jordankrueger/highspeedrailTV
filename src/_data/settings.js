const fs = require('fs');
const path = require('path');

module.exports = function() {
  const settingsPath = path.join(__dirname, '..', '..', 'admin', 'data', 'settings.json');

  try {
    const data = fs.readFileSync(settingsPath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    // Return defaults if settings file doesn't exist
    return {
      footerLinks: [
        { id: 1, label: 'hsr.fyi', url: 'https://hsr.fyi' },
        { id: 2, label: 'HSR Alliance', url: 'https://www.hsrail.org' },
        { id: 3, label: 'CA HSR Authority', url: 'https://hsr.ca.gov' }
      ],
      googleAnalyticsId: ''
    };
  }
};
