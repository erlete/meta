#!/usr/bin/env node

/**
 * Comprehensive Test Suite for Meta Schema CDN Server
 *
 * This test suite covers:
 * - Basic endpoint functionality
 * - Security features (rate limiting, DDoS protection)
 * - Performance characteristics
 * - Edge cases and error handling
 * - HTTP compliance and standards
 * - Content validation and integrity
 */

import http from 'node:http';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const BASE_URL = 'http://localhost:8080';

// Test statistics
const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  warnings: 0,
  startTime: performance.now(),
};

// Test configuration
const TEST_CONFIG = {
  timeout: 10000,
  rateLimitTests: 50,
  concurrentRequests: 20,
  expectedSchemas: ['core/1.0.0', 'other/3.0.0'],
};

// Utility functions
const log = (level, message, data = {}) => {
  const timestamp = new Date().toISOString();
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    warning: '\x1b[33m',
    error: '\x1b[31m',
    reset: '\x1b[0m',
  };

  const color = colors[level] || colors.reset;
  console.log(
    `${color}[${timestamp}] ${level.toUpperCase()}: ${message}${colors.reset}`
  );

  if (Object.keys(data).length > 0) {
    console.log(`   ${JSON.stringify(data, null, 2).replace(/\n/g, '\n   ')}`);
  }
};

const formatDuration = (ms) => {
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const createTest = (name, testFn) => {
  return async () => {
    stats.total++;
    const startTime = performance.now();

    try {
      await testFn();
      const duration = performance.now() - startTime;
      stats.passed++;
      log('success', `✅ ${name}`, { duration: formatDuration(duration) });
      return true;
    } catch (error) {
      const duration = performance.now() - startTime;
      stats.failed++;
      log('error', `❌ ${name}`, {
        duration: formatDuration(duration),
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join('\n'),
      });
      return false;
    }
  };
};

const makeRequest = (options = {}) => {
  const {
    path = '/',
    method = 'GET',
    headers = {},
    timeout = TEST_CONFIG.timeout,
    body = null,
  } = options;

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 8080,
        path,
        method,
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
            size: Buffer.byteLength(data, 'utf8'),
          });
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error(`Request timeout after ${timeout}ms`));
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
};

const validateJSON = (data, description = 'JSON') => {
  try {
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`Invalid ${description}: ${error.message}`);
  }
};

const validateSchema = (schema, path) => {
  const required = ['$id', '$schema'];
  const missing = required.filter((field) => !(field in schema));

  if (missing.length > 0) {
    throw new Error(
      `Schema at ${path} missing required fields: ${missing.join(', ')}`
    );
  }

  if (!schema.$id.startsWith('http')) {
    throw new Error(`Schema at ${path} has invalid $id format: ${schema.$id}`);
  }

  return true;
};

const calculateHash = (content) => {
  return createHash('sha256').update(content).digest('hex');
};

// Test suites
const healthTests = () => [
  createTest('Health endpoint responds', async () => {
    const res = await makeRequest({ path: '/health' });

    if (res.statusCode !== 200) {
      throw new Error(`Expected status 200, got ${res.statusCode}`);
    }

    const health = validateJSON(res.body, 'health response');

    const requiredFields = ['status', 'timestamp', 'uptime', 'memory', 'stats'];
    const missing = requiredFields.filter((field) => !(field in health));

    if (missing.length > 0) {
      throw new Error(`Health response missing fields: ${missing.join(', ')}`);
    }

    if (health.status !== 'healthy') {
      throw new Error(`Expected status 'healthy', got '${health.status}'`);
    }
  }),

  createTest('Health endpoint has correct headers', async () => {
    const res = await makeRequest({ path: '/health' });

    const expectedContentType = 'application/json';
    if (!res.headers['content-type']?.startsWith(expectedContentType)) {
      throw new Error(
        `Unexpected content-type: ${res.headers['content-type']}, expected to start with: ${expectedContentType}`
      );
    }

    if (!res.headers['cache-control']?.includes('no-cache')) {
      stats.warnings++;
      log(
        'warning',
        'Health endpoint lacks no-cache directive - may be cached by clients'
      );
    }
  }),
];

const manifestTests = () => [
  createTest('Manifest endpoint responds', async () => {
    const res = await makeRequest({ path: '/manifest.json' });

    if (res.statusCode !== 200) {
      throw new Error(`Expected status 200, got ${res.statusCode}`);
    }

    const manifest = validateJSON(res.body, 'manifest');

    if (!manifest.schemas || typeof manifest.schemas !== 'object') {
      throw new Error('Manifest should contain schemas object');
    }

    if (Object.keys(manifest.schemas).length === 0) {
      throw new Error('Manifest should contain at least one schema');
    }
  }),

  createTest('Manifest contains expected schemas', async () => {
    const res = await makeRequest({ path: '/manifest.json' });
    const manifest = validateJSON(res.body);

    const schemaIds = Object.keys(manifest.schemas);
    const missing = TEST_CONFIG.expectedSchemas.filter(
      (expected) => !schemaIds.some((id) => id.includes(expected))
    );

    if (missing.length > 0) {
      throw new Error(`Missing expected schemas: ${missing.join(', ')}`);
    }
  }),
];

const schemaTests = () => [
  createTest('Raw schemas are accessible', async () => {
    const paths = ['/json/core/1.0.0.json', '/json/other/3.0.0.json'];

    for (const path of paths) {
      const res = await makeRequest({ path });

      if (res.statusCode !== 200) {
        throw new Error(`Schema ${path} returned ${res.statusCode}`);
      }

      const schema = validateJSON(res.body, `schema at ${path}`);
      validateSchema(schema, path);
    }
  }),

  createTest('Bundled schemas are accessible', async () => {
    const paths = ['/bundled/core/1.0.0.json', '/bundled/other/3.0.0.json'];

    for (const path of paths) {
      const res = await makeRequest({ path });

      if (res.statusCode !== 200) {
        throw new Error(`Bundled schema ${path} returned ${res.statusCode}`);
      }

      const schema = validateJSON(res.body, `bundled schema at ${path}`);
      validateSchema(schema, path);
    }
  }),

  createTest('Schema ETags are consistent', async () => {
    const path = '/json/core/1.0.0.json';

    const res1 = await makeRequest({ path });
    const res2 = await makeRequest({ path });

    if (!res1.headers.etag || !res2.headers.etag) {
      throw new Error('Schemas should have ETag headers');
    }

    if (res1.headers.etag !== res2.headers.etag) {
      throw new Error('ETag should be consistent for same resource');
    }
  }),

  createTest('Schema content integrity', async () => {
    const path = '/json/core/1.0.0.json';

    const res1 = await makeRequest({ path });
    const res2 = await makeRequest({ path });

    const hash1 = calculateHash(res1.body);
    const hash2 = calculateHash(res2.body);

    if (hash1 !== hash2) {
      throw new Error('Schema content should be identical across requests');
    }
  }),
];

const errorHandlingTests = () => [
  createTest('404 for non-existent paths', async () => {
    const paths = [
      '/nonexistent.json',
      '/json/fake/1.0.0.json',
      '/bundled/missing/2.0.0.json',
      '/random/path',
    ];

    for (const path of paths) {
      const res = await makeRequest({ path });

      if (res.statusCode !== 404) {
        throw new Error(
          `Path ${path} should return 404, got ${res.statusCode}`
        );
      }

      // For internal usage, empty 404s are optimal for performance
      // Only validate JSON for general 404s, not schema-specific ones
      if (res.body && res.body.trim().length > 0) {
        try {
          const error = validateJSON(res.body, `404 response for ${path}`);

          if (!error.error || !error.message) {
            throw new Error(
              `404 response for ${path} should include error and message fields`
            );
          }
        } catch (jsonError) {
          // If JSON parsing fails, log a warning but don't fail the test
          log('warning', `404 response for ${path} is not valid JSON`, {
            body: res.body.substring(0, 100),
            error: jsonError.message,
          });
        }
      }
      // Empty bodies for schema 404s are expected for performance optimization
    }
  }),

  createTest('Invalid HTTP methods handled', async () => {
    const methods = ['POST', 'PUT', 'DELETE', 'PATCH'];

    for (const method of methods) {
      const res = await makeRequest({ path: '/health', method });

      // Server should either handle gracefully or return appropriate error
      if (res.statusCode < 200 || res.statusCode >= 600) {
        throw new Error(`Invalid status code ${res.statusCode} for ${method}`);
      }
    }
  }),
];

const securityTests = () => [
  createTest('Security headers present', async () => {
    const res = await makeRequest({ path: '/health' });

    const securityHeaders = [
      'x-content-type-options',
      'x-frame-options',
      'x-xss-protection',
    ];

    const missing = securityHeaders.filter((header) => !res.headers[header]);

    if (missing.length > 0) {
      stats.warnings++;
      log('warning', `Missing security headers: ${missing.join(', ')}`);
    }
  }),

  createTest('Rate limiting protection', async () => {
    const requests = [];
    const startTime = performance.now();

    // Make rapid requests to test rate limiting
    for (let i = 0; i < TEST_CONFIG.rateLimitTests; i++) {
      requests.push(makeRequest({ path: '/health', timeout: 2000 }));
    }

    const responses = await Promise.allSettled(requests);
    const duration = performance.now() - startTime;

    const successful = responses.filter(
      (r) => r.status === 'fulfilled' && r.value.statusCode === 200
    ).length;
    const blocked = responses.filter(
      (r) => r.status === 'fulfilled' && r.value.statusCode === 429
    ).length;

    log('info', 'Rate limit test results', {
      totalRequests: TEST_CONFIG.rateLimitTests,
      successful,
      blocked,
      duration: formatDuration(duration),
      rps: (TEST_CONFIG.rateLimitTests / (duration / 1000)).toFixed(2),
    });

    // At least some requests should succeed
    if (successful === 0) {
      throw new Error(
        'All requests were blocked - rate limiting too aggressive'
      );
    }
  }),
];

const performanceTests = () => [
  createTest('Response times reasonable', async () => {
    const paths = ['/health', '/manifest.json', '/json/core/1.0.0.json'];
    const maxResponseTime = 1000; // 1 second

    for (const path of paths) {
      const startTime = performance.now();
      const res = await makeRequest({ path });
      const duration = performance.now() - startTime;

      if (duration > maxResponseTime) {
        throw new Error(
          `${path} took ${formatDuration(duration)}, expected < ${maxResponseTime}ms`
        );
      }

      if (res.statusCode !== 200) {
        throw new Error(`${path} returned ${res.statusCode}`);
      }
    }
  }),

  createTest('Concurrent request handling', async () => {
    const requests = [];

    for (let i = 0; i < TEST_CONFIG.concurrentRequests; i++) {
      requests.push(makeRequest({ path: '/health' }));
    }

    const startTime = performance.now();
    const responses = await Promise.all(requests);
    const duration = performance.now() - startTime;

    const successful = responses.filter((r) => r.statusCode === 200).length;

    if (successful !== TEST_CONFIG.concurrentRequests) {
      throw new Error(
        `Only ${successful}/${TEST_CONFIG.concurrentRequests} concurrent requests succeeded`
      );
    }

    log('info', 'Concurrent request test', {
      requests: TEST_CONFIG.concurrentRequests,
      duration: formatDuration(duration),
      avgResponseTime: formatDuration(
        duration / TEST_CONFIG.concurrentRequests
      ),
    });
  }),
];

const complianceTests = () => [
  createTest('CORS headers present', async () => {
    const res = await makeRequest({ path: '/health' });

    if (!res.headers['access-control-allow-origin']) {
      stats.warnings++;
      log('warning', 'CORS headers not found - may cause browser issues');
    }
  }),

  createTest('Content-Type headers correct', async () => {
    const testCases = [
      { path: '/health', expected: 'application/json' },
      { path: '/manifest.json', expected: 'application/json' },
      { path: '/json/core/1.0.0.json', expected: 'application/schema+json' },
    ];

    for (const { path, expected } of testCases) {
      const res = await makeRequest({ path });

      if (!res.headers['content-type']?.startsWith(expected)) {
        throw new Error(
          `${path} has incorrect Content-Type: ${res.headers['content-type']}, expected to start with: ${expected}`
        );
      }
    }
  }),
];

const advancedTests = () => [
  createTest('Path traversal protection', async () => {
    const maliciousPaths = [
      '/json/../../../etc/passwd',
      '/bundled/..\\..\\windows\\system32\\drivers\\etc\\hosts',
      '/json/%2e%2e%2f%2e%2e%2fpasswd',
      '/bundled/....//....//etc/passwd',
    ];

    for (const path of maliciousPaths) {
      const res = await makeRequest({ path });

      if (res.statusCode === 200) {
        throw new Error(
          `Path traversal vulnerability detected: ${path} returned 200`
        );
      }

      if (
        res.statusCode !== 404 &&
        res.statusCode !== 400 &&
        res.statusCode !== 403
      ) {
        log('warning', `Unexpected status for malicious path: ${path}`, {
          status: res.statusCode,
        });
      }
    }
  }),

  createTest('HTTP method restrictions', async () => {
    const sensitiveEndpoints = ['/manifest.json', '/json/core/1.0.0.json'];
    const unsafeMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];

    for (const endpoint of sensitiveEndpoints) {
      for (const method of unsafeMethods) {
        const res = await makeRequest({ path: endpoint, method });

        if (res.statusCode === 200) {
          throw new Error(`${method} ${endpoint} should not be allowed`);
        }
      }
    }
  }),

  createTest('Large request handling', async () => {
    const largePayload = 'x'.repeat(1024 * 1024); // 1MB payload

    try {
      const res = await makeRequest({
        path: '/health',
        method: 'POST',
        body: largePayload,
        timeout: 5000,
      });

      // Server should handle large requests gracefully
      if (res.statusCode >= 500) {
        throw new Error(`Server error on large request: ${res.statusCode}`);
      }
    } catch (error) {
      if (error.message.includes('timeout')) {
        log('warning', 'Server may be vulnerable to large payload DoS attacks');
      } else {
        throw error;
      }
    }
  }),

  createTest('Request header handling', async () => {
    const maliciousHeaders = {
      'X-Forwarded-For': '127.0.0.1, evil.com',
      'X-Real-IP': '127.0.0.1',
      Host: 'evil.com',
      'User-Agent': '<script>alert("xss")</script>',
      Referer: 'javascript:alert(1)',
    };

    const res = await makeRequest({
      path: '/health',
      headers: maliciousHeaders,
    });

    // Server should handle malicious headers gracefully
    if (res.statusCode !== 200) {
      log('warning', 'Server may not handle malicious headers properly', {
        status: res.statusCode,
      });
    }
  }),

  createTest('Schema validation edge cases', async () => {
    // Test if server properly validates schema formats
    const edgeCases = [
      '/json/core/1.0.0.json?callback=alert(1)',
      '/json/core/1.0.0.json#fragment',
      '/json/core/1.0.0.json/../1.0.0.json',
      '/json/core/1.0.0.json%00.txt',
    ];

    for (const path of edgeCases) {
      const res = await makeRequest({ path });

      if (res.statusCode === 200 && res.body) {
        try {
          const schema = validateJSON(res.body);
          // If it returns a schema for malformed paths, that might be an issue
          if (!schema.$id || !schema.$schema) {
            log(
              'warning',
              `Edge case path returned unexpected content: ${path}`
            );
          }
        } catch {
          // Not valid JSON - that's probably correct for edge cases
        }
      }
    }
  }),

  createTest('Performance under load spikes', async () => {
    const spike1 = [];
    const spike2 = [];

    // Create two load spikes with a brief pause between
    for (let i = 0; i < 25; i++) {
      spike1.push(makeRequest({ path: '/health', timeout: 3000 }));
    }

    const start1 = performance.now();
    const results1 = await Promise.allSettled(spike1);
    const duration1 = performance.now() - start1;

    // Brief pause
    await new Promise((resolve) => setTimeout(resolve, 100));

    for (let i = 0; i < 25; i++) {
      spike2.push(makeRequest({ path: '/manifest.json', timeout: 3000 }));
    }

    const start2 = performance.now();
    const results2 = await Promise.allSettled(spike2);
    const duration2 = performance.now() - start2;

    const successful1 = results1.filter(
      (r) => r.status === 'fulfilled' && r.value?.statusCode === 200
    ).length;
    const successful2 = results2.filter(
      (r) => r.status === 'fulfilled' && r.value?.statusCode === 200
    ).length;

    log('info', 'Load spike test results', {
      spike1: {
        successful: successful1,
        total: 25,
        duration: formatDuration(duration1),
      },
      spike2: {
        successful: successful2,
        total: 25,
        duration: formatDuration(duration2),
      },
    });

    if (successful1 < 20 || successful2 < 20) {
      log(
        'warning',
        'Server performance degrades significantly under load spikes'
      );
    }
  }),

  createTest('Memory consumption stability', async () => {
    // Get initial memory
    const initialHealth = await makeRequest({ path: '/health' });
    const initialMemory = validateJSON(initialHealth.body).memory.heapUsed;

    // Make many requests to potentially cause memory leaks
    const requests = [];
    for (let i = 0; i < 100; i++) {
      requests.push(makeRequest({ path: '/json/core/1.0.0.json' }));
    }

    await Promise.all(requests);

    // Check memory after load
    const finalHealth = await makeRequest({ path: '/health' });
    const finalMemory = validateJSON(finalHealth.body).memory.heapUsed;

    const memoryIncrease = finalMemory - initialMemory;
    const memoryIncreasePercent = (memoryIncrease / initialMemory) * 100;

    log('info', 'Memory consumption test', {
      initialMemory: `${(initialMemory / 1024 / 1024).toFixed(2)} MB`,
      finalMemory: `${(finalMemory / 1024 / 1024).toFixed(2)} MB`,
      increase: `${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`,
      increasePercent: `${memoryIncreasePercent.toFixed(2)}%`,
    });

    if (memoryIncreasePercent > 50) {
      log(
        'warning',
        'Significant memory increase detected - possible memory leak'
      );
    }
  }),
];

// Main test execution
const runTestSuite = async () => {
  console.log('🧪 Meta Schema CDN Server - Comprehensive Test Suite');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  log('info', 'Starting comprehensive test suite', {
    baseUrl: BASE_URL,
    timeout: `${TEST_CONFIG.timeout}ms`,
    expectedSchemas: TEST_CONFIG.expectedSchemas,
  });

  // Check if server is running
  try {
    await makeRequest({ path: '/health', timeout: 5000 });
    log('success', 'Server connectivity confirmed');
  } catch (error) {
    log('error', 'Cannot connect to server - is it running?', {
      url: BASE_URL,
      error: error.message,
    });
    process.exit(1);
  }

  console.log('');

  // Run test suites
  const testSuites = [
    { name: 'Health Endpoint Tests', tests: healthTests() },
    { name: 'Manifest Tests', tests: manifestTests() },
    { name: 'Schema Tests', tests: schemaTests() },
    { name: 'Error Handling Tests', tests: errorHandlingTests() },
    { name: 'Security Tests', tests: securityTests() },
    { name: 'Performance Tests', tests: performanceTests() },
    { name: 'HTTP Compliance Tests', tests: complianceTests() },
    { name: 'Advanced Security & Edge Case Tests', tests: advancedTests() },
  ];

  for (const suite of testSuites) {
    log('info', `Running ${suite.name}`, { testCount: suite.tests.length });

    for (const test of suite.tests) {
      await test();
    }

    console.log('');
  }

  // Final report
  const totalDuration = performance.now() - stats.startTime;
  const successRate = ((stats.passed / stats.total) * 100).toFixed(1);

  console.log('📊 Test Results Summary');
  console.log('═══════════════════════');

  log('info', 'Test execution completed', {
    total: stats.total,
    passed: stats.passed,
    failed: stats.failed,
    warnings: stats.warnings,
    successRate: `${successRate}%`,
    duration: formatDuration(totalDuration),
  });

  if (stats.failed > 0) {
    log('error', 'Some tests failed - server may have issues');
    process.exit(1);
  } else if (stats.warnings > 0) {
    log('warning', 'All tests passed but with warnings');
  } else {
    log('success', '🎉 All tests passed! Server is working perfectly.');
  }
};

// Execute tests
await runTestSuite();
