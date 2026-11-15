const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '..', 'data', 'trip.json');
const jsPath = path.join(__dirname, '..', 'data', 'trip-data.js');

const raw = fs.readFileSync(jsonPath, 'utf8');
const parsed = JSON.parse(raw); // validate JSON syntax

const output = `// Auto-synced from data/trip.json for offline / file:// direct opening\nwindow.__DEFAULT_TRIP_DATA__ = ${JSON.stringify(parsed, null, 2)};\n`;
fs.writeFileSync(jsPath, output, 'utf8');
console.log('Synced data/trip.json -> data/trip-data.js successfully. Places:', parsed.places.length, 'Days:', parsed.days.length);
