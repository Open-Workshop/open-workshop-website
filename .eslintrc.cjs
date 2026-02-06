module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'script',
  },
  globals: {
    $: 'readonly',
    jQuery: 'readonly',
    Toast: 'readonly',
    Masonry: 'readonly',
    URLManager: 'readonly',
    Formating: 'readonly',
    Dictionary: 'readonly',
    Pager: 'readonly',
    Cookies: 'readonly',
  },
  rules: {
    'no-unused-vars': 'warn',
    'no-undef': 'warn',
  },
};
