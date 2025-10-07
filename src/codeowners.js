const core = require('@actions/core');
const { getContent, getPullRequestFiles, assignPullRequest } = require('./github-service');

/**
 * Load CODEOWNERS file from repository
 * Searches in standard locations: CODEOWNERS, .github/CODEOWNERS, docs/CODEOWNERS
 *
 * @returns {Array|null} Array of parsed CODEOWNERS rules or null if not found
 */
async function loadCodeowners() {
  const path = 'CODEOWNERS';

  const data = await getContent(path);
  if (data && data.content) {
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    core.debug(`Found CODEOWNERS at: ${path}`);
    return parseCodeowners(content);
  }

  return null;
}

/**
 * Parse CODEOWNERS file content into structured rules
 *
 * @param {string} content - Raw CODEOWNERS file content
 * @returns {Array} Array of rules with pattern and owners
 */
function parseCodeowners(content) {
  const rules = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse pattern and owners
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) {
      continue;
    }

    const pattern = parts[0];
    const owners = parts.slice(1)
      .map(owner => owner.replace('@', '')) // Remove @ prefix
      .filter(owner => !owner.includes('/')); // Only individual users, not teams

    if (owners.length > 0) {
      rules.push({ pattern, owners });
      core.debug(`Parsed rule: ${pattern} -> [${owners.join(', ')}]`);
    }
  }

  return rules;
}

/**
 * Get CODEOWNERS for a specific pull request based on changed files
 *
 * @param {number} prNumber - Pull request number
 * @param {Array} codeowners - Parsed CODEOWNERS rules
 * @returns {Array} Array of owner usernames
 */
async function getPRCodeowners(prNumber, codeowners) {
  const files = await getPullRequestFiles(prNumber);
  
  core.debug(`PR #${prNumber} has ${files.length} changed files`);

  const allOwners = new Set();

  // Match each file against CODEOWNERS patterns
  for (const file of files) {
    const matchedOwners = matchFileToOwners(file.filename, codeowners);

    if (matchedOwners.length > 0) {
      core.debug(`File ${file.filename} matches owners: [${matchedOwners.join(', ')}]`);
      matchedOwners.forEach(owner => allOwners.add(owner));
    }
  }

  return Array.from(allOwners);
}

/**
 * Match a file to its owners based on CODEOWNERS rules
 * Last matching pattern wins (following Git CODEOWNERS behavior)
 *
 * @param {string} filename - File path to match
 * @param {Array} codeowners - Parsed CODEOWNERS rules
 * @returns {Array} Array of owner usernames
 */
function matchFileToOwners(filename, codeowners) {
  let matchedOwners = [];

  // CODEOWNERS rules are processed in order, last match wins
  for (const rule of codeowners) {
    if (matchPattern(filename, rule.pattern)) {
      matchedOwners = rule.owners;
    }
  }

  return matchedOwners;
}

/**
 * Check if a file matches a CODEOWNERS pattern
 * Supports:
 * - Exact matches: /path/to/file.js
 * - Directory matches: /path/to/dir/
 * - Wildcard matches: *.js
 * - Double wildcards: **\/*.test.js
 * - Glob patterns: /src/**\/*.js
 *
 * @param {string} filename - File path to match
 * @param {string} pattern - CODEOWNERS pattern
 * @returns {boolean} True if file matches pattern
 */
function matchPattern(filename, pattern) {
  // Match everything
  if (pattern === '*') {
    return true;
  }

  // Normalize paths - remove leading slash for comparison
  const file = filename.startsWith('/') ? filename.slice(1) : filename;
  const pat = pattern.startsWith('/') ? pattern.slice(1) : pattern;

  // Exact match
  if (file === pat) {
    return true;
  }

  // Directory match (pattern ends with /)
  if (pat.endsWith('/')) {
    const dir = pat.slice(0, -1);
    return file.startsWith(dir + '/') || file === dir;
  }

  // Extension match (e.g., *.js)
  if (pat.startsWith('*.')) {
    const ext = pat.slice(1);
    return file.endsWith(ext);
  }

  // Wildcard patterns
  if (pat.includes('*')) {
    const regexPattern = pat
      .replace(/\./g, '\\.') // Escape dots
      .replace(/\*\*\//g, '(.*\\/)?') // **/ means "zero or more directories" - handle BEFORE **
      .replace(/\/\*\*/g, '(\\/.*)?') // /** means "slash followed by anything"
      .replace(/\*\*/g, '.*') // ** alone means "anything"
      .replace(/\*/g, '[^/]*'); // * matches anything except /

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(file);
  }

  // Prefix match (directory without trailing slash)
  if (!pat.includes('.') && !pat.includes('*')) {
    return file.startsWith(pat + '/') || file === pat;
  }

  return false;
}

/**
 * Assign a pull request to its CODEOWNERS
 *
 * @param {number} prNumber - Pull request number
 * @param {Array} owners - Array of owner usernames to assign
 * @returns {boolean} True if assignment successful
 */
async function assignPRToOwners(prNumber, owners) {
  return await assignPullRequest(prNumber, owners);
}

module.exports = {
  loadCodeowners,
  parseCodeowners,
  getPRCodeowners,
  matchFileToOwners,
  matchPattern,
  assignPRToOwners
};
