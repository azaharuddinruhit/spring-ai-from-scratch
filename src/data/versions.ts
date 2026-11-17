/**
 * The stack every lesson's code targets. Bump versions here only; snippets read from this object.
 * Verified against Maven Central and services.gradle.org on 2026-11-17.
 */
export const STACK = {
  java: '25',
  gradle: '9.9.1',
  springBoot: '4.1.2',
  springFramework: '7',
  springAi: '2.0.2',
  dependencyManagementPlugin: '1.1.7',
  jspecify: '1.0.1',
} as const;

/**
 * The site's own version, shown in the header pill. The deploy workflow sets SITE_VERSION to VERSION (major.minor) plus
 * its run number; any other build (npm run dev, a local build, a pull request) shows "dev".
 */
export const SITE_VERSION: string = import.meta.env.SITE_VERSION ? `v${import.meta.env.SITE_VERSION}` : 'dev';
