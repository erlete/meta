import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2023,
      },
    },
    rules: {
      'no-console': 'off', // Allow console for CLI tools
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/cli.js', 'src/utils/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.node,
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
      },
    },
  },
];
