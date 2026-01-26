/**
 * Copy Web Build Script
 * 
 * Copies the frontend-web build to the renderer folder.
 * This ensures Electron always uses the same code as the web version.
 */

const fs = require('fs');
const path = require('path');

const SOURCE = path.resolve(__dirname, '../../frontend-web/dist');
const TARGET = path.resolve(__dirname, '../renderer');

console.log('📦 Copying web build to Electron renderer...');
console.log(`   Source: ${SOURCE}`);
console.log(`   Target: ${TARGET}`);

// Check if source exists
if (!fs.existsSync(SOURCE)) {
  console.error('❌ Error: Web build not found!');
  console.error('   Please run "npm run build" in frontend-web first.');
  process.exit(1);
}

// Remove existing renderer folder
if (fs.existsSync(TARGET)) {
  console.log('🗑️  Removing existing renderer folder...');
  fs.rmSync(TARGET, { recursive: true, force: true });
}

// Copy recursively
function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    const items = fs.readdirSync(src);
    for (const item of items) {
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log('📋 Copying files...');
copyRecursive(SOURCE, TARGET);

// Count files
function countFiles(dir) {
  let count = 0;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      count += countFiles(fullPath);
    } else {
      count++;
    }
  }
  return count;
}

const fileCount = countFiles(TARGET);
console.log(`✅ Copied ${fileCount} files successfully!`);
