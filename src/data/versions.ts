/**
 * The stack every lesson's code targets. Bump versions here only; snippets read from this object.
 * Spring AI 2.1.0 is built on Spring Boot 4.2.0 (Spring Framework 7.1.0). Verified against Maven Central on 2026-11-20.
 */
export const STACK = {
  java: '25',
  gradle: '9.9.1',
  springBoot: '4.2.0',
  springFramework: '7.1',
  springAi: '2.1.0',
  dependencyManagementPlugin: '1.1.7',
  jspecify: '1.0.1',
} as const;

export type Stack = { readonly [K in keyof typeof STACK]: string };

/**
 * The site's own version, shown in the header pill. The deploy workflow sets SITE_VERSION to VERSION (major.minor) plus
 * its run number; any other build (npm run dev, a local build, a pull request) shows "dev".
 */
export const SITE_VERSION: string = import.meta.env.SITE_VERSION ? `v${import.meta.env.SITE_VERSION}` : 'dev';
