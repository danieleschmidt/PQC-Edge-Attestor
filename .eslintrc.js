module.exports = {
  env: {
    node: true,
    es2022: true,
    jest: true
  },
  extends: [
    'standard',
    'plugin:security/recommended',
    'plugin:node/recommended'
  ],
  plugins: [
    'security',
    'node'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  rules: {
    // Security rules
    'security/detect-object-injection': 'error',
    'security/detect-non-literal-fs-filename': 'warn',
    'security/detect-non-literal-regexp': 'error',
    'security/detect-unsafe-regex': 'error',
    'security/detect-buffer-noassert': 'error',
    'security/detect-child-process': 'warn',
    'security/detect-disable-mustache-escape': 'error',
    'security/detect-eval-with-expression': 'error',
    'security/detect-no-csrf-before-method-override': 'error',
    'security/detect-non-literal-require': 'warn',
    'security/detect-possible-timing-attacks': 'error',
    'security/detect-pseudoRandomBytes': 'error',

    // Code quality rules
    'no-console': 'warn',
    'no-debugger': 'error',
    'no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_'
    }],
    'no-var': 'error',
    'prefer-const': 'error',
    'prefer-arrow-callback': 'error',
    'arrow-spacing': 'error',
    'no-trailing-spaces': 'error',
    'indent': ['error', 2],
    'quotes': ['error', 'single'],
    'semi': ['error', 'always'],
    'comma-dangle': ['error', 'never'],
    'eol-last': 'error',

    // Node.js specific rules
    'node/no-unpublished-require': 'off',
    'node/no-missing-require': 'error',
    'node/no-unsupported-features/es-syntax': 'off',
    'node/exports-style': ['error', 'module.exports'],
    'node/prefer-global/buffer': ['error', 'always'],
    'node/prefer-global/console': ['error', 'always'],
    'node/prefer-global/process': ['error', 'always'],
    'node/prefer-global/url-search-params': ['error', 'always'],
    'node/prefer-global/url': ['error', 'always'],
    'node/prefer-promises/dns': 'error',
    'node/prefer-promises/fs': 'error',

    // Performance rules
    'no-loop-func': 'error',
    'no-caller': 'error',
    'no-extend-native': 'error',
    'no-extra-bind': 'error',
    'no-implied-eval': 'error',
    'no-iterator': 'error',
    'no-labels': 'error',
    'no-lone-blocks': 'error',
    'no-multi-str': 'error',
    'no-native-reassign': 'error',
    'no-new-func': 'error',
    'no-new-wrappers': 'error',
    'no-octal-escape': 'error',
    'no-proto': 'error',
    'no-return-assign': 'error',
    'no-script-url': 'error',
    'no-sequences': 'error',
    'no-throw-literal': 'error',
    'no-with': 'error',

    // Cryptographic and security specific rules
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error'
  },
  overrides: [
    {
      files: ['tests/**/*.js'],
      env: {
        jest: true
      },
      rules: {
        'no-console': 'off',
        'security/detect-non-literal-fs-filename': 'off',
        'node/no-unpublished-require': 'off'
      }
    },
    {
      files: ['src/crypto/**/*.js'],
      rules: {
        // Allow crypto-specific patterns
        'security/detect-non-literal-regexp': 'off',
        'no-bitwise': 'off'
      }
    },
    {
      files: ['benchmarks/**/*.js', 'scripts/**/*.js'],
      rules: {
        'no-console': 'off',
        'node/no-unpublished-require': 'off'
      }
    }
  ],
  globals: {
    'BigInt': 'readonly',
    'BigInt64Array': 'readonly',
    'BigUint64Array': 'readonly'
  },
  settings: {
    node: {
      allowModules: [
        'winston',
        'express',
        'helmet',
        'cors',
        'express-rate-limit',
        'bcrypt',
        'jsonwebtoken',
        'mongoose',
        'redis',
        'pg',
        'sequelize'
      ],
      tryExtensions: ['.js', '.json', '.node']
    }
  }
};