// ========= Copyright 2026 @ Strukto.AI All Rights Reserved. =========
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ========= Copyright 2026 @ Strukto.AI All Rights Reserved. =========

/* global console, process */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findLicenseStartLine(lines, startWith) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(startWith)) {
      return i;
    }
  }
  return null;
}

function findLicenseEndLine(lines, startWith) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith(startWith)) {
      return i;
    }
  }
  return null;
}

function updateLicenseInFile(
  filePath,
  licenseTemplate,
  startLineStartWith,
  endLineStartWith,
  commentMarker
) {
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    return false;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const newLicense = licenseTemplate.trim();
  const lines = content.split('\n');

  let shebang = null;
  let contentStartIndex = 0;
  if (lines.length > 0 && lines[0].startsWith('#!')) {
    shebang = lines[0];
    contentStartIndex = 1;
  }

  const commentLines = [];
  for (let i = contentStartIndex; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith(commentMarker)) {
      commentLines.push(line);
    } else if (line.trim() === '') {
      continue;
    } else {
      break;
    }
  }

  const startIndex = findLicenseStartLine(commentLines, startLineStartWith);
  const endIndex = findLicenseEndLine(commentLines, endLineStartWith);

  let hasChanges = false;

  if (startIndex !== null && endIndex !== null) {
    const existingLicense = commentLines
      .slice(startIndex, endIndex + 1)
      .join('\n');

    if (existingLicense.trim() !== newLicense.trim()) {
      const replacedContent = content.replace(existingLicense, newLicense);
      fs.writeFileSync(filePath, replacedContent, 'utf-8');
      console.log(`✓ Updated license in ${filePath}`);
      hasChanges = true;
    }
  } else {
    let newContent;
    if (shebang) {
      const contentAfterShebang = lines.slice(1).join('\n');
      newContent = shebang + '\n' + newLicense + '\n\n' + contentAfterShebang;
    } else {
      newContent = newLicense + '\n\n' + content;
    }
    fs.writeFileSync(filePath, newContent, 'utf-8');
    console.log(`✓ Added license to ${filePath}`);
    hasChanges = true;
  }

  return hasChanges;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node update_license.js <file1> [file2] [file3] ...');
    console.error('\nProcesses individual files passed by lint-staged');
    process.exit(1);
  }

  const skipDirs = [
    'node_modules',
    '.venv',
    'venv',
    '__pycache__',
    'dist',
    'dist-electron',
    'build',
    'coverage',
    '.git',
    '.next',
    '.nuxt',
    '.worktrees',
  ];

  let filesUpdated = 0;

  for (const filePath of args) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const shouldSkip = skipDirs.some(
      (dir) =>
        normalizedPath.includes(`/${dir}/`) ||
        normalizedPath.startsWith(`${dir}/`) ||
        normalizedPath.includes(`/.${dir}/`)
    );
    if (shouldSkip) {
      console.log(`⊘ Skipping ${filePath} (excluded directory)`);
      continue;
    }

    const ext = path.extname(filePath);
    let licenseTemplatePath, commentMarker;

    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      licenseTemplatePath = path.join(__dirname, 'license_template_ts.txt');
      commentMarker = '//';
    } else if (ext === '.py') {
      licenseTemplatePath = path.join(__dirname, 'license_template_py.txt');
      commentMarker = '#';
    } else {
      console.log(`⊘ Skipping ${filePath} (unsupported extension)`);
      continue;
    }

    if (!fs.existsSync(licenseTemplatePath)) {
      console.error(`Error: ${licenseTemplatePath} not found`);
      continue;
    }

    const licenseTemplate = fs.readFileSync(licenseTemplatePath, 'utf-8');
    const startLineStartWith = `${commentMarker} ========= Copyright`;
    const endLineStartWith = `${commentMarker} ========= Copyright`;

    if (
      updateLicenseInFile(
        filePath,
        licenseTemplate,
        startLineStartWith,
        endLineStartWith,
        commentMarker
      )
    ) {
      filesUpdated++;
    }
  }

  if (filesUpdated > 0) {
    console.log(`\n✔ License check complete: ${filesUpdated} file(s) updated`);
  }

  process.exit(0);
}

main();
