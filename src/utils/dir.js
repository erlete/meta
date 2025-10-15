const fs = require('fs');
const path = require('path');

/**
 * Resolves a given path (relative or absolute) to an absolute path.
 * Optionally forces the path to be an existing directory.
 *
 * @param {string} inputPath - The input path.
 * @param {object} [options] - Optional settings.
 * @param {boolean} [options.forceDirectory=false] - If true, returns null when the resolved path doesn't exist or isn't a directory.
 * @returns {string|null} - The absolute path, or null if forceDirectory is true but the path is not an existing directory.
 */
function getAbsolutePath(inputPath, { forceDirectory = false } = {}) {
  // Resolve the path to an absolute path
  const absolutePath = path.resolve(inputPath);

  // If forceDirectory is true, ensure the path exists and is a directory
  if (forceDirectory) {
    if (!fs.existsSync(absolutePath)) {
      return null;
    }
    const stats = fs.statSync(absolutePath);
    if (!stats.isDirectory()) {
      return null;
    }
  }

  return absolutePath;
}

module.exports = { getAbsolutePath };
