import wdio from '@wdio/eslint';

export default wdio.config({
  rules: {
    '@stylistic/indent': ['error', 2],
    '@stylistic/semi': ['error', 'always'],
    'curly': ['error', 'multi-line'],
    '@typescript-eslint/no-explicit-any': 'warn',
  }
});
