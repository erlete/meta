import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';

const BASE_URL = 'http://localhost:8080';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = normalize(join(__dirname, '../dist'));
const MIME = {
  '.json': 'application/schema+json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  default: 'application/octet-stream',
};

// DDoS Protection & Rate Limiting
const connections = new Map(); // IP -> { count, lastRequest, blocked }
// const MAX_CONNECTIONS_PER_IP = 100;
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 1000;
const BLOCK_DURATION = 300000; // 5 minutes

// Performance Metrics
let totalRequests = 0;
let totalBytes = 0;
let cacheHits = 0;
let cacheMisses = 0;

const log = (level, data) => {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, level, ...data };
  console.log(JSON.stringify(logEntry));
};

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const formatPercentage = (part, total) => {
  if (total === 0) return '0%';
  return `${((part / total) * 100).toFixed(1)}%`;
};

const calculateCompression = (raw, bundled) => {
  if (raw === 0 || bundled === 0) return 'N/A';
  const ratio = ((bundled - raw) / raw) * 100;
  return ratio > 0 ? `+${ratio.toFixed(1)}%` : `${ratio.toFixed(1)}%`;
};

const getETag = (filePath, stats) => {
  const hash = createHash('md5')
    .update(`${filePath}-${stats.mtime.getTime()}-${stats.size}`)
    .digest('hex');
  return `"${hash}"`;
};

const isRateLimited = (clientIP) => {
  const now = Date.now();
  let client = connections.get(clientIP);

  if (!client) {
    client = { count: 0, lastRequest: now, blocked: false, blockUntil: 0 };
    connections.set(clientIP, client);
  }

  // Check if client is currently blocked
  if (client.blocked && now < client.blockUntil) {
    return { blocked: true, reason: 'IP blocked due to rate limiting' };
  } else if (client.blocked && now >= client.blockUntil) {
    // Unblock client
    client.blocked = false;
    client.count = 0;
  }

  // Reset count if window has passed
  if (now - client.lastRequest > RATE_LIMIT_WINDOW) {
    client.count = 0;
  }

  client.count++;
  client.lastRequest = now;

  // Check rate limits
  if (client.count > MAX_REQUESTS_PER_WINDOW) {
    client.blocked = true;
    client.blockUntil = now + BLOCK_DURATION;
    return { blocked: true, reason: 'Rate limit exceeded' };
  }

  return { blocked: false };
};

const loadManifest = async () => {
  try {
    const manifestPath = join(ROOT, 'manifest.json');
    const manifestData = await readFile(manifestPath, 'utf8');
    return JSON.parse(manifestData);
  } catch {
    return null;
  }
};

const analyzeSchema = async (schemaPath, type) => {
  try {
    const stats = statSync(schemaPath);
    const content = await readFile(schemaPath, 'utf8');
    const schema = JSON.parse(content);

    return {
      path: schemaPath,
      type,
      size: stats.size,
      lastModified: stats.mtime.toISOString(),
      id: schema.$id,
      title: schema.title,
      version: schema.$id?.split('/').pop(),
      etag: getETag(schemaPath, stats),
    };
  } catch {
    return null;
  }
};

const printInventory = async (rootDir) => {
  const startTime = Date.now();
  log('info', {
    message: 'Starting inventory scan',
    rootDir,
    baseUrl: BASE_URL,
  });

  // Load manifest for additional metadata
  const manifest = await loadManifest();

  const jsonDir = join(rootDir, 'json');
  const bundledDir = join(rootDir, 'bundled');

  const schemas = new Map(); // schemaId -> { raw, bundled, manifest }
  let totalFiles = 0;
  let totalSize = 0;

  // Scan JSON (raw) schemas
  try {
    const jsonEntries = await readdir(jsonDir, { recursive: true });
    for (const entry of jsonEntries) {
      if (entry.endsWith('.json')) {
        const fullPath = join(jsonDir, entry);
        const analysis = await analyzeSchema(fullPath, 'raw');
        if (analysis) {
          const schemaId = analysis.id;
          if (!schemas.has(schemaId)) schemas.set(schemaId, {});
          schemas.get(schemaId).raw = analysis;
          totalFiles++;
          totalSize += analysis.size;
        }
      }
    }
  } catch (error) {
    log('warn', {
      message: 'Could not scan json directory',
      error: error.message,
    });
  }

  // Scan bundled schemas
  try {
    const bundledEntries = await readdir(bundledDir, { recursive: true });
    for (const entry of bundledEntries) {
      if (entry.endsWith('.json')) {
        const fullPath = join(bundledDir, entry);
        const analysis = await analyzeSchema(fullPath, 'bundled');
        if (analysis) {
          const schemaId = analysis.id;
          if (!schemas.has(schemaId)) schemas.set(schemaId, {});
          schemas.get(schemaId).bundled = analysis;
          totalFiles++;
          totalSize += analysis.size;
        }
      }
    }
  } catch (error) {
    log('warn', {
      message: 'Could not scan bundled directory',
      error: error.message,
    });
  }

  // Print detailed inventory
  console.log(
    '\n═══════════════════════════════════════════════════════════════'
  );
  console.log('🚀 META SCHEMA CDN SERVER - INVENTORY REPORT');
  console.log(
    '═══════════════════════════════════════════════════════════════'
  );

  let schemaCount = 0;
  let totalRawSize = 0;
  let totalBundledSize = 0;

  for (const [schemaId, data] of schemas.entries()) {
    schemaCount++;
    const raw = data.raw;
    const bundled = data.bundled;
    const manifestData = manifest?.schemas?.[schemaId];

    console.log(`\n📋 Schema: ${schemaId}`);
    console.log(`   Title: ${raw?.title || bundled?.title || 'Unknown'}`);
    console.log(`   Version: ${raw?.version || bundled?.version || 'Unknown'}`);

    if (raw) {
      totalRawSize += raw.size;
      console.log(
        `   📄 Raw: ${formatBytes(raw.size)} | ${BASE_URL}/json${new URL(schemaId).pathname}.json`
      );
    }

    if (bundled) {
      totalBundledSize += bundled.size;
      console.log(
        `   📦 Bundled: ${formatBytes(bundled.size)} | ${BASE_URL}/bundled${new URL(schemaId).pathname}.json`
      );
    }

    if (raw && bundled) {
      const compression = calculateCompression(raw.size, bundled.size);
      console.log(`   📊 Size Difference: ${compression} (bundled vs raw)`);
    }

    if (manifestData) {
      console.log(`   🔒 SHA256: ${manifestData.hash.substring(0, 16)}...`);
      console.log(
        `   📅 Last Modified: ${raw?.lastModified || bundled?.lastModified}`
      );
    }
  }

  const scanTime = Date.now() - startTime;

  console.log(
    '\n═══════════════════════════════════════════════════════════════'
  );
  console.log('📊 SUMMARY STATISTICS');
  console.log(
    '═══════════════════════════════════════════════════════════════'
  );
  console.log(`🎯 Total Schemas: ${schemaCount}`);
  console.log(`📁 Total Files: ${totalFiles}`);
  console.log(`💾 Total Size: ${formatBytes(totalSize)}`);
  console.log(
    `📄 Raw Schemas: ${formatBytes(totalRawSize)} (${formatPercentage(totalRawSize, totalSize)})`
  );
  console.log(
    `📦 Bundled Schemas: ${formatBytes(totalBundledSize)} (${formatPercentage(totalBundledSize, totalSize)})`
  );
  console.log(`⚡ Scan Time: ${scanTime}ms`);
  console.log(`🌐 Server: ${BASE_URL}`);
  console.log(`📂 Root: ${rootDir}`);
  console.log(
    '═══════════════════════════════════════════════════════════════\n'
  );

  log('info', {
    message: 'Inventory scan completed',
    stats: {
      schemas: schemaCount,
      files: totalFiles,
      totalSize: totalSize,
      rawSize: totalRawSize,
      bundledSize: totalBundledSize,
      scanTimeMs: scanTime,
    },
  });

  return { schemas, totalFiles, totalSize };
};

const srv = http.createServer((req, res) => {
  const startTime = process.hrtime.bigint();
  const requestId = Math.random().toString(36).substring(2, 15);
  const clientIP = req.socket.remoteAddress || 'unknown';

  totalRequests++;
  let reqBytes = 0;
  let resBytes = 0;

  req.on('data', (chunk) => (reqBytes += chunk.length));

  // DDoS Protection
  const rateLimitCheck = isRateLimited(clientIP);
  if (rateLimitCheck.blocked) {
    res.writeHead(429, {
      'Content-Type': 'application/json',
      'Retry-After': '300',
      'X-Rate-Limit-Reason': rateLimitCheck.reason,
    });
    res.end(
      JSON.stringify({
        error: 'Too Many Requests',
        reason: rateLimitCheck.reason,
      })
    );

    const duration = Number(process.hrtime.bigint() - startTime) / 1e6;
    log('warn', {
      requestId,
      clientIP,
      method: req.method,
      url: req.url,
      status: 429,
      duration: `${duration.toFixed(3)}ms`,
      reason: rateLimitCheck.reason,
    });
    return;
  }

  // Enhanced CORS + Security Headers
  const securityHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, If-None-Match, If-Modified-Since',
    'Access-Control-Expose-Headers': 'ETag, Last-Modified, Cache-Control',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    Server: 'Meta-Schema-CDN/1.0',
  };

  Object.entries(securityHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Content-Length': '0' });
    res.end();

    const duration = Number(process.hrtime.bigint() - startTime) / 1e6;
    log('info', {
      requestId,
      clientIP,
      method: req.method,
      url: req.url,
      status: 204,
      duration: `${duration.toFixed(3)}ms`,
      type: 'preflight',
    });
    return;
  }

  // Only allow GET/HEAD
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD, OPTIONS' });
    res.end();

    const duration = Number(process.hrtime.bigint() - startTime) / 1e6;
    log('warn', {
      requestId,
      clientIP,
      method: req.method,
      url: req.url,
      status: 405,
      duration: `${duration.toFixed(3)}ms`,
      error: 'Method not allowed',
    });
    return;
  }

  try {
    const urlObj = new URL(
      req.url,
      `http://${req.headers.host || 'localhost'}`
    );
    const pathname = decodeURIComponent(urlObj.pathname);

    // Security: prevent path traversal
    if (pathname.includes('..') || pathname.includes('~')) {
      res.writeHead(400);
      res.end();

      const duration = Number(process.hrtime.bigint() - startTime) / 1e6;
      log('warn', {
        requestId,
        clientIP,
        method: req.method,
        url: req.url,
        status: 400,
        duration: `${duration.toFixed(3)}ms`,
        error: 'Invalid path',
      });
      return;
    }

    // Route: /health - Health check endpoint
    if (pathname === '/health') {
      const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        stats: {
          totalRequests,
          totalBytes,
          cacheHits,
          cacheMisses,
          activeConnections: connections.size,
        },
      };

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      });
      const healthJson = JSON.stringify(healthData, null, 2);
      res.end(healthJson);
      resBytes = Buffer.byteLength(healthJson);

      const duration = Number(process.hrtime.bigint() - startTime) / 1e6;
      log('info', {
        requestId,
        clientIP,
        method: req.method,
        url: req.url,
        status: 200,
        duration: `${duration.toFixed(3)}ms`,
        bytes: resBytes,
        type: 'health-check',
      });
      return;
    }

    // Route: /manifest.json - Serve manifest
    if (pathname === '/manifest.json') {
      const manifestPath = join(ROOT, 'manifest.json');
      const stats = statSync(manifestPath, { throwIfNoEntry: false });

      if (!stats) {
        res.writeHead(404);
        res.end();

        const duration = Number(process.hrtime.bigint() - startTime) / 1e6;
        log('warn', {
          requestId,
          clientIP,
          method: req.method,
          url: req.url,
          status: 404,
          duration: `${duration.toFixed(3)}ms`,
          error: 'Manifest not found',
        });
        return;
      }

      const etag = getETag(manifestPath, stats);
      const lastModified = stats.mtime.toUTCString();

      // Handle conditional requests
      if (
        req.headers['if-none-match'] === etag ||
        req.headers['if-modified-since'] === lastModified
      ) {
        res.writeHead(304);
        res.end();
        cacheHits++;

        const duration = Number(process.hrtime.bigint() - startTime) / 1e6;
        log('info', {
          requestId,
          clientIP,
          method: req.method,
          url: req.url,
          status: 304,
          duration: `${duration.toFixed(3)}ms`,
          type: 'cache-hit',
          etag,
        });
        return;
      }

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes cache
      res.setHeader('ETag', etag);
      res.setHeader('Last-Modified', lastModified);

      if (req.method === 'HEAD') {
        res.writeHead(200, { 'Content-Length': String(stats.size) });
        res.end();
      } else {
        const stream = createReadStream(manifestPath);
        stream.on('data', (chunk) => (resBytes += chunk.length));
        stream.pipe(res);
      }

      cacheMisses++;
      const duration = Number(process.hrtime.bigint() - startTime) / 1e6;
      log('info', {
        requestId,
        clientIP,
        method: req.method,
        url: req.url,
        status: 200,
        duration: `${duration.toFixed(3)}ms`,
        bytes: stats.size,
        type: 'manifest',
        etag,
      });
      return;
    }

    // Route: /{json|bundled}/<schema-path>/<version>.json - Serve schemas
    const schemaMatch = pathname.match(/^\/(json|bundled)(\/.+\.json)$/);
    if (schemaMatch) {
      const [, type, schemaPath] = schemaMatch;
      const fullPath = join(ROOT, type, schemaPath.substring(1)); // Remove leading slash

      // Security check: ensure path is within ROOT
      if (!normalize(fullPath).startsWith(normalize(ROOT))) {
        res.writeHead(403);
        res.end();

        const duration = Number(process.hrtime.bigint() - startTime) / 1e6;
        log('warn', {
          requestId,
          clientIP,
          method: req.method,
          url: req.url,
          status: 403,
          duration: `${duration.toFixed(3)}ms`,
          error: 'Path traversal attempt',
        });
        return;
      }

      const stats = statSync(fullPath, { throwIfNoEntry: false });
      if (!stats || !stats.isFile()) {
        res.writeHead(404);
        res.end();

        const duration = Number(process.hrtime.bigint() - startTime) / 1e6;
        log('info', {
          requestId,
          clientIP,
          method: req.method,
          url: req.url,
          status: 404,
          duration: `${duration.toFixed(3)}ms`,
          error: 'Schema not found',
          requestedPath: fullPath,
        });
        return;
      }

      const etag = getETag(fullPath, stats);
      const lastModified = stats.mtime.toUTCString();

      // Handle conditional requests
      if (
        req.headers['if-none-match'] === etag ||
        req.headers['if-modified-since'] === lastModified
      ) {
        res.writeHead(304);
        res.end();
        cacheHits++;

        const duration = Number(process.hrtime.bigint() - startTime) / 1e6;
        log('info', {
          requestId,
          clientIP,
          method: req.method,
          url: req.url,
          status: 304,
          duration: `${duration.toFixed(3)}ms`,
          type: 'cache-hit',
          schemaType: type,
          etag,
        });
        return;
      }

      // Set appropriate headers for schema serving
      res.setHeader('Content-Type', MIME['.json']);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year cache for schemas
      res.setHeader('ETag', etag);
      res.setHeader('Last-Modified', lastModified);
      res.setHeader('X-Schema-Type', type);

      if (req.method === 'HEAD') {
        res.writeHead(200, { 'Content-Length': String(stats.size) });
        res.end();

        const duration = Number(process.hrtime.bigint() - startTime) / 1e6;
        log('info', {
          requestId,
          clientIP,
          method: req.method,
          url: req.url,
          status: 200,
          duration: `${duration.toFixed(3)}ms`,
          bytes: 0,
          size: stats.size,
          type: 'head',
          schemaType: type,
          etag,
        });
        return;
      }

      const stream = createReadStream(fullPath);
      stream.on('data', (chunk) => {
        resBytes += chunk.length;
        totalBytes += chunk.length;
      });

      stream.on('error', (error) => {
        if (!res.headersSent) {
          res.writeHead(500);
          res.end();
        }

        const duration = Number(process.hrtime.bigint() - startTime) / 1e6;
        log('error', {
          requestId,
          clientIP,
          method: req.method,
          url: req.url,
          status: 500,
          duration: `${duration.toFixed(3)}ms`,
          error: error.message,
          schemaType: type,
        });
      });

      stream.on('end', () => {
        cacheMisses++;
        const duration = Number(process.hrtime.bigint() - startTime) / 1e6;
        log('info', {
          requestId,
          clientIP,
          method: req.method,
          url: req.url,
          status: 200,
          duration: `${duration.toFixed(3)}ms`,
          bytes: resBytes,
          schemaType: type,
          cached: false,
          userAgent: req.headers['user-agent'] || 'unknown',
          referer: req.headers['referer'] || undefined,
          etag,
        });
      });

      stream.pipe(res);
      return;
    }

    // If no routes match, return 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Not Found',
        message: `Path ${pathname} not found`,
        availableEndpoints: [
          '/health',
          '/manifest.json',
          '/json/<schema-path>/<version>.json',
          '/bundled/<schema-path>/<version>.json',
        ],
      })
    );

    const duration = Number(process.hrtime.bigint() - startTime) / 1e6;
    log('info', {
      requestId,
      clientIP,
      method: req.method,
      url: req.url,
      status: 404,
      duration: `${duration.toFixed(3)}ms`,
      error: 'Route not found',
    });
  } catch (error) {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }

    const duration = Number(process.hrtime.bigint() - startTime) / 1e6;
    log('error', {
      requestId,
      clientIP,
      method: req.method,
      url: req.url,
      status: 500,
      duration: `${duration.toFixed(3)}ms`,
      error: error.message,
      stack: error.stack,
    });
  }
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  log('info', { message: 'SIGTERM received, shutting down gracefully' });
  srv.close(() => {
    log('info', { message: 'Server closed' });
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  log('info', { message: 'SIGINT received, shutting down gracefully' });
  srv.close(() => {
    log('info', { message: 'Server closed' });
    process.exit(0);
  });
});

// Error handling
process.on('uncaughtException', (error) => {
  log('error', {
    message: 'Uncaught exception',
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log('error', { message: 'Unhandled rejection', reason, promise });
});

// Start server
log('info', { message: 'Starting Meta Schema CDN Server', version: '1.0.0' });

await printInventory(ROOT);

srv.listen(8080, () => {
  log('info', {
    message: 'Meta Schema CDN Server started successfully',
    port: 8080,
    host: 'localhost',
    url: BASE_URL,
    rootDirectory: ROOT,
    pid: process.pid,
    nodeVersion: process.version,
    platform: process.platform,
  });

  console.log('\n🎉 Meta Schema CDN Server is ready!');
  console.log(`🌐 Access your schemas at: ${BASE_URL}`);
  console.log(`📊 Health check: ${BASE_URL}/health`);
  console.log(`📋 Manifest: ${BASE_URL}/manifest.json`);
  console.log(`📄 Raw schemas: ${BASE_URL}/json/<path>/<version>.json`);
  console.log(
    `📦 Bundled schemas: ${BASE_URL}/bundled/<path>/<version>.json\n`
  );
});
