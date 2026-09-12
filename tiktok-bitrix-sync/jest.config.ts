import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'src/.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: {
            syntax: 'typescript',
            decorators: true,
          },
          transform: {
            legacyDecorator: true,
            decoratorMetadata: true,
          },
        },
      },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!(@nestjs|rxjs|pino)/)'],
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '<rootDir>/test/',
    '<rootDir>/src/main\\.ts$',
    '<rootDir>/src/config/',
    '<rootDir>/scripts/',
    '<rootDir>/prisma/',
    '\\.spec\\.ts$',
    '\\.interface\\.ts$',
    '\\.dto\\.ts$',
    '\\.entity\\.ts$',
    '\\.module\\.ts$',
    '\\.constants\\.ts$',
    '\\.controller\\.ts$',
  ],

  coverageThreshold: {
    global: {
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },
  },
};

export default config;
