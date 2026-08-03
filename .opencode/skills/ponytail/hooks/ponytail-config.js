const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_MODE = 'full';
const VALID_MODES = ['off', 'lite', 'full', 'ultra'];

function normalizePersistedMode(mode) {
  return typeof mode === 'string' && VALID_MODES.includes(mode.trim().toLowerCase())
    ? mode.trim().toLowerCase()
    : null;
}

function getDefaultMode() {
  const envMode = normalizePersistedMode(process.env.PONYTAIL_DEFAULT_MODE);
  if (envMode) return envMode;

  try {
    const configPath = path.join(
      process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
      'ponytail',
      'config.json',
    );
    return normalizePersistedMode(JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '')).defaultMode) || DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

module.exports = { getDefaultMode, normalizePersistedMode };
