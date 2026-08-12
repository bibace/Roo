import { defineConfig } from 'wxt';
import { SUPPORTED_AWS_CONSOLE_MATCH_PATTERNS } from './src/aws-context/supported-url';

const rooIcons = {
  16: 'icons/16.png',
  32: 'icons/32.png',
  48: 'icons/48.png',
  128: 'icons/128.png',
};

function firefoxZodStaticLintCompatibility() {
  return {
    name: 'roo-remove-zod-eval-probe',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const normalizedId = id.replaceAll('\\', '/');
      if (!normalizedId.endsWith('/zod/v4/core/util.js')) {
        return undefined;
      }

      const expectedPattern = /const F = Function;\s*new F\(""\);/g;
      if ([...code.matchAll(expectedPattern)].length === 0) {
        throw new Error(
          'Roo Firefox Zod compatibility pattern was not found; dependency implementation requires review.',
        );
      }

      const transformed = code.replaceAll(expectedPattern, 'throw new Error("CSP");');

      if ([...transformed.matchAll(expectedPattern)].length > 0) {
        throw new Error(
          'Roo Firefox Zod compatibility pattern remained after replacement; dependency implementation requires review.',
        );
      }

      return transformed;
    },
  };
}

function firefoxReactDomStaticLintCompatibility() {
  return {
    name: 'roo-remove-react-dom-inner-html-assignment',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const normalizedId = id.replaceAll('\\', '/');
      if (!normalizedId.includes('/react-dom/') || !normalizedId.includes('react-dom-client.production')) {
        return undefined;
      }

      const expectedAssignment = 'domElement.innerHTML = key;';
      const occurrenceCount = code.split(expectedAssignment).length - 1;
      if (occurrenceCount === 0) {
        throw new Error(
          'Roo Firefox React DOM compatibility pattern was not found; dependency implementation requires review.',
        );
      }

      const transformed = code.replaceAll(
        expectedAssignment,
        'throw new Error("Roo does not support dangerouslySetInnerHTML.");',
      );

      if (transformed.includes(expectedAssignment)) {
        throw new Error(
          'Roo Firefox React DOM compatibility pattern remained after replacement; dependency implementation requires review.',
        );
      }

      return transformed;
    },
  };
}

export default defineConfig({
  targetBrowsers: ['chrome', 'edge', 'firefox'],
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser, manifestVersion }) => ({
    name: 'Roo - AWS Roles Jumper',
    description: 'Fast navigation to known AWS Console destinations.',
    homepage_url: 'https://github.com/bibace/Roo',
    icons: rooIcons,
    action: {
      default_title: 'Roo - AWS Roles Jumper',
      default_icon: rooIcons,
      ...(manifestVersion === 3 ? { default_state: 'disabled' } : {}),
    },
    permissions: ['storage', 'scripting'],
    host_permissions: [...SUPPORTED_AWS_CONSOLE_MATCH_PATTERNS],
    ...(browser === 'firefox' && manifestVersion === 2
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'roo-aws-roles-jumper@bibace',
              strict_min_version: '140.0',
              data_collection_permissions: {
                required: ['none'],
              },
            },
            gecko_android: {
              strict_min_version: '142.0',
            },
          },
        }
      : {}),
  }),
  zip: {
    artifactTemplate: '{{name}}-{{version}}-{{browser}}-{{manifestVersion}}.zip',
    zipSources: false,
  },
  vite: (configEnv) => ({
    plugins:
      configEnv.browser === 'firefox'
        ? [firefoxZodStaticLintCompatibility(), firefoxReactDomStaticLintCompatibility()]
        : [],
  }),
});
