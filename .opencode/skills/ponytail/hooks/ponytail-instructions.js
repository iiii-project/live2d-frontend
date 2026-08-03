const fs = require('fs');
const path = require('path');
const { getDefaultMode, normalizePersistedMode } = require('./ponytail-config');

const SKILL_PATH = path.join(__dirname, '..', 'skills', 'ponytail', 'SKILL.md');

function getPonytailInstructions(mode) {
  const activeMode = normalizePersistedMode(mode) || getDefaultMode();
  try {
    if (activeMode === 'off') return '';
    const body = fs.readFileSync(SKILL_PATH, 'utf8')
      .replace(/^---[\s\S]*?---\s*/, '')
      .split(/\r?\n/)
      .filter((line) => {
        const label = line.match(/^\|\s*\*\*(lite|full|ultra)\*\*\s*\|/i)?.[1]?.toLowerCase();
        return !label || label === activeMode;
      })
      .join('\n');
    return `PONYTAIL MODE ACTIVE — level: ${activeMode}\n\n${body}`;
  } catch {
    return `PONYTAIL MODE ACTIVE — level: ${activeMode}`;
  }
}

module.exports = { getPonytailInstructions };
