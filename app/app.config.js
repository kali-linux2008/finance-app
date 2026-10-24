// Bovenop app.json. google-services.json (Firebase, voor pushmeldingen) gebruiken we alleen als
// hij er is, zodat `npx expo start` met Expo Go ook zonder Firebase blijft werken.
const fs = require('fs');

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    ...(fs.existsSync('./google-services.json') ? { googleServicesFile: './google-services.json' } : {}),
  },
});
