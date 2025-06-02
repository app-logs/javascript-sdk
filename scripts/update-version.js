const fs = require('fs');
const path = require('path');

// Read package.json
const packageJson = require('../package.json');
const version = packageJson.version;

// Create version.ts content
const content = `// This file is auto-generated during build
export const VERSION = '${version}';
`;

// Write to version.ts
const versionFilePath = path.join(__dirname, '../src/version.ts');
fs.writeFileSync(versionFilePath, content);

console.log(`Updated version.ts with version: ${version}`); 