module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es2021: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    sourceType: 'module',
    ecmaVersion: 2021,
  },
  extends: [
    '@electron-toolkit/eslint-config-ts',
    '@electron-toolkit/eslint-config-prettier',
    'plugin:react/recommended',
  ],
  plugins: ['react', '@typescript-eslint'],
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    'max-len': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'no-console': 'off',
    'react/jsx-filename-extension': [1, { extensions: ['.tsx', '.jsx'] }],
    'react/react-in-jsx-scope': 'off',
    'react/jsx-props-no-spreading': 'off',
    'react/display-name': 'off',
    'react/require-default-props': 'off',
  },
};
