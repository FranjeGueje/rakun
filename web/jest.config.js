module.exports = {
  displayName: 'Web',

  testEnvironment: 'jsdom',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  testPathIgnorePatterns: ['./node_modules/'],

  rootDir: '..',
  roots: ['<rootDir>/web/src'],

  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  moduleNameMapper: { '\\.css$': '<rootDir>/web/src/__tests__/empty.js' },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/web/tsconfig.json' }]
  }
}
