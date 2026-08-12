import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const outputDirectory = path.join(root, '.output');
const expectedVersion = packageJson.version;
const expectedAwsContentMatches = [
  'https://console.aws.amazon.com/*',
  'https://*.console.aws.amazon.com/*',
  'https://health.aws.amazon.com/*',
  'https://lightsail.aws.amazon.com/*',
];
const expectedAwsHostPermissions = [...expectedAwsContentMatches];
const expectedExtensionName = 'Roo - AWS Roles Jumper';
const expectedFunctionalPermissions = ['storage', 'scripting'];
const expectedAuthor = 'nova';
const expectedHomepageUrl =
  'https://github.com/bibace/Roo';
const expectedRepositoryUrl =
  'https://github.com/bibace/Roo.git';
const configurationEditorMarker = 'Configuration YAML';
const configurationGuideMarker = 'Configuration YAML Reference';

const targets = {
  chrome: {
    directory: 'chrome-mv3',
    manifestVersion: 3,
    actionKey: 'action',
    backgroundKey: 'service_worker',
    zipBudget: 338944,
    optionsEntryBudget: 104448,
  },
  edge: {
    directory: 'edge-mv3',
    manifestVersion: 3,
    actionKey: 'action',
    backgroundKey: 'service_worker',
    zipBudget: 338944,
    optionsEntryBudget: 104448,
  },
  firefox: {
    directory: 'firefox-mv2',
    manifestVersion: 2,
    actionKey: 'browser_action',
    backgroundKey: 'scripts',
    zipBudget: 339968,
    optionsEntryBudget: 104448,
  },
};

const targetName = process.argv[2] ?? 'chrome';

verifyPackageMetadata();

if (targetName === 'all') {
  for (const target of Object.keys(targets)) {
    verifyTarget(target);
  }
  console.log('All Roo release targets verified.');
} else {
  verifyTarget(targetName);
}

function verifyPackageMetadata() {
  if (packageJson.author !== expectedAuthor) {
    throw new Error(`Package author must be ${expectedAuthor}.`);
  }

  if (packageJson.homepage !== expectedHomepageUrl) {
    throw new Error(`Package homepage must be ${expectedHomepageUrl}.`);
  }

  if (packageJson.repository?.type !== 'git') {
    throw new Error('Package repository type must be git.');
  }

  if (packageJson.repository?.url !== expectedRepositoryUrl) {
    throw new Error(`Package repository URL must be ${expectedRepositoryUrl}.`);
  }
}

function verifyTarget(name) {
  const target = targets[name];

  if (!target) {
    throw new Error(`Unknown release target: ${name}. Expected chrome, edge, firefox, or all.`);
  }

  const buildDirectory = path.join(outputDirectory, target.directory);
  const manifestPath = path.join(buildDirectory, 'manifest.json');

  if (!existsSync(manifestPath)) {
    throw new Error(`${name} manifest was not found at ${manifestPath}.`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const contentScriptReferences = verifyManifest(name, target, manifest, buildDirectory);

  const zipName = `roo-${expectedVersion}-${name}-mv${target.manifestVersion}.zip`;
  const zipPath = path.join(outputDirectory, zipName);

  if (!existsSync(zipPath)) {
    throw new Error(`${name} release ZIP was not found at ${zipPath}.`);
  }

  const zipSize = readFileSync(zipPath).byteLength;

  if (zipSize > target.zipBudget) {
    throw new Error(
      `${name} release ZIP is ${zipSize} bytes; budget is ${target.zipBudget} bytes.`,
    );
  }

  const zipEntries = execFileSync('unzip', ['-Z1', zipPath], {
    encoding: 'utf8',
  }).split('\n').filter(Boolean);

  for (const requiredEntry of ['manifest.json', 'options.html', 'popup.html']) {
    if (!zipEntries.includes(requiredEntry)) {
      throw new Error(`${name} release ZIP is missing ${requiredEntry}.`);
    }
  }

  for (const reference of contentScriptReferences) {
    if (!zipEntries.includes(reference)) {
      throw new Error(`${name} release ZIP is missing the referenced AWS content-script bundle.`);
    }
  }

  const backgroundReference = getBackgroundReferences(target, manifest)[0];
  if (!zipEntries.includes(backgroundReference)) {
    throw new Error(`${name} release ZIP is missing the referenced background bundle.`);
  }

  const editor = verifyOptionsLazyEditor(
    name,
    buildDirectory,
    zipEntries,
    target.optionsEntryBudget,
  );

  console.log(
    `Release size budget (${name}): actual ZIP bytes=${zipSize}; ZIP budget=${target.zipBudget}; ` +
    `Options entry bytes=${editor.entrySize}; Options entry budget=${target.optionsEntryBudget}; ` +
    `editor lazy chunk reference(s)=${editor.editorReferences.join(', ')}; ` +
    `guide lazy chunk reference(s)=${editor.guideReferences.join(', ')}`,
  );
  console.log(`Release artifact verified (${name}): ${zipName}`);
}

function getHtmlTags(html, tagName) {
  return html.match(new RegExp(`<${tagName}\\b[^>]*>`, 'gi')) ?? [];
}

function getHtmlAttributes(tag) {
  const attributes = new Map();
  const content = tag.replace(/^<\w+\b/i, '').replace(/>$/, '');
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
  }

  return attributes;
}

function normalizeGeneratedReference(reference, description) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(reference)) {
    throw new Error(`${description} must not use an external URL: ${reference}.`);
  }

  const withoutSuffix = reference.split(/[?#]/, 1)[0];
  const normalized = withoutSuffix.startsWith('/')
    ? withoutSuffix.slice(1)
    : withoutSuffix.startsWith('./')
      ? withoutSuffix.slice(2)
      : withoutSuffix;

  if (normalized.length === 0 || normalized.startsWith('../') || path.isAbsolute(normalized)) {
    throw new Error(`${description} has an invalid generated reference: ${reference}.`);
  }

  return normalized;
}

function listJavascriptFiles(directory, relativeDirectory = '') {
  const currentDirectory = path.join(directory, relativeDirectory);
  const files = [];

  for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);

    if (entry.isDirectory()) {
      files.push(...listJavascriptFiles(directory, relativePath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(relativePath);
    }
  }

  return files;
}

function verifyOptionsLazyEditor(name, buildDirectory, zipEntries, entryBudget) {
  const optionsHtmlPath = path.join(buildDirectory, 'options.html');

  if (!existsSync(optionsHtmlPath)) {
    throw new Error(`${name} Options HTML was not found.`);
  }

  const optionsHtml = readFileSync(optionsHtmlPath, 'utf8');
  const scripts = getHtmlTags(optionsHtml, 'script').map(getHtmlAttributes);
  const moduleScripts = scripts.filter((attributes) => attributes.get('type') === 'module');

  if (moduleScripts.length !== 1) {
    throw new Error(`${name} Options HTML must contain exactly one module entry script.`);
  }

  const rawEntryReference = moduleScripts[0].get('src');

  if (!rawEntryReference) {
    throw new Error(`${name} Options module entry script is missing src.`);
  }

  const entryReference = normalizeGeneratedReference(
    rawEntryReference,
    `${name} Options module entry script`,
  );
  const entryPath = path.join(buildDirectory, entryReference);

  if (!existsSync(entryPath)) {
    throw new Error(`${name} Options entry module was not found at ${entryReference}.`);
  }

  const entrySource = readFileSync(entryPath);
  const entrySize = entrySource.byteLength;

  if (entrySize > entryBudget) {
    throw new Error(`${name} Options entry is ${entrySize} bytes; budget is ${entryBudget} bytes.`);
  }

  if (entrySource.includes(configurationGuideMarker)) {
    throw new Error(`${name} Options entry statically contains the Configuration guide marker.`);
  }

  if (entrySource.includes(configurationEditorMarker)) {
    throw new Error(`${name} Options entry statically contains the Configuration editor marker.`);
  }

  const editorReferences = listJavascriptFiles(buildDirectory).filter((reference) => (
    reference !== entryReference &&
    readFileSync(path.join(buildDirectory, reference), 'utf8').includes(configurationEditorMarker) &&
    !readFileSync(path.join(buildDirectory, reference), 'utf8').includes(configurationGuideMarker)
  ));

  if (editorReferences.length === 0) {
    throw new Error(`${name} build does not contain a separate Configuration editor chunk.`);
  }

  const staticScriptReferences = new Set(
    scripts
      .map((attributes) => attributes.get('src'))
      .filter((reference) => reference !== undefined)
      .map((reference) => normalizeGeneratedReference(reference, `${name} Options script`)),
  );
  const modulePreloadReferences = new Set(
    getHtmlTags(optionsHtml, 'link')
      .map(getHtmlAttributes)
      .filter((attributes) => attributes.get('rel') === 'modulepreload')
      .map((attributes) => attributes.get('href'))
      .filter((reference) => reference !== undefined)
      .map((reference) => normalizeGeneratedReference(reference, `${name} Options modulepreload`)),
  );

  for (const reference of editorReferences) {
    if (staticScriptReferences.has(reference)) {
      throw new Error(`${name} editor chunk is statically loaded by Options HTML: ${reference}.`);
    }

    if (modulePreloadReferences.has(reference)) {
      throw new Error(`${name} editor chunk is preloaded by Options HTML: ${reference}.`);
    }

    if (!zipEntries.includes(reference)) {
      throw new Error(`${name} release ZIP is missing editor chunk ${reference}.`);
    }
  }

  const guideReferences = listJavascriptFiles(buildDirectory).filter((reference) => (
    reference !== entryReference &&
    readFileSync(path.join(buildDirectory, reference), 'utf8').includes(configurationGuideMarker)
  ));

  if (guideReferences.length === 0) {
    throw new Error(`${name} build does not contain a separate Configuration guide chunk.`);
  }

  for (const reference of guideReferences) {
    if (staticScriptReferences.has(reference)) {
      throw new Error(`${name} guide chunk is statically loaded by Options HTML: ${reference}.`);
    }

    if (modulePreloadReferences.has(reference)) {
      throw new Error(`${name} guide chunk is preloaded by Options HTML: ${reference}.`);
    }

    if (!zipEntries.includes(reference)) {
      throw new Error(`${name} release ZIP is missing guide chunk ${reference}.`);
    }
  }

  return { entrySize, editorReferences, guideReferences };
}

function verifyManifest(name, target, manifest, buildDirectory) {
  if (manifest.name !== expectedExtensionName) {
    throw new Error(`${name} manifest name is not ${expectedExtensionName}.`);
  }

  if (manifest.description !== 'Fast navigation to known AWS Console destinations.') {
    throw new Error(`${name} manifest description is unexpected.`);
  }

  if (manifest.homepage_url !== expectedHomepageUrl) {
    throw new Error(`${name} manifest homepage is not ${expectedHomepageUrl}.`);
  }

  if (manifest.version !== expectedVersion) {
    throw new Error(
      `${name} manifest version is ${manifest.version}; expected ${expectedVersion}.`,
    );
  }

  if (manifest.manifest_version !== target.manifestVersion) {
    throw new Error(
      `${name} manifest version is ${manifest.manifest_version}; expected ${target.manifestVersion}.`,
    );
  }

  const functionalPermissions = manifest.permissions.filter((permission) => !permission.includes('://'));

  if (JSON.stringify(functionalPermissions) !== JSON.stringify(expectedFunctionalPermissions)) {
    throw new Error(`${name} manifest permissions are not exactly ["storage", "scripting"].`);
  }

  verifyAwsHostAccess(name, target, manifest);

  for (const forbiddenKey of [
    'optional_permissions',
    'optional_host_permissions',
    'externally_connectable',
    'web_accessible_resources',
  ]) {
    if (forbiddenKey in manifest) {
      throw new Error(`${name} manifest contains unexpected field: ${forbiddenKey}.`);
    }
  }

  const forbiddenPermissions = [
    'cookies',
    'tabs',
    'webRequest',
    'webRequestBlocking',
    'webNavigation',
    'history',
    'identity',
    'management',
    'nativeMessaging',
    'unlimitedStorage',
  ];

  if (forbiddenPermissions.some((permission) => manifest.permissions.includes(permission))) {
    throw new Error(`${name} manifest contains a forbidden permission.`);
  }

  if (manifest.permissions.some((permission) => permission === '<all_urls>')) {
    throw new Error(`${name} manifest contains a host permission.`);
  }

  const contentScriptReferences = verifyAwsContentScript(name, manifest, buildDirectory);

  if (manifest.options_ui?.page !== 'options.html') {
    throw new Error(`${name} Options entry is missing from the manifest.`);
  }

  const action = manifest[target.actionKey];

  if (action?.default_title !== expectedExtensionName) {
    throw new Error(`${name} action title is not ${expectedExtensionName}.`);
  }

  if (action?.default_popup !== 'popup.html') {
    throw new Error(`${name} popup entry is missing from the manifest.`);
  }

  if (target.manifestVersion === 3 && action?.default_state !== 'disabled') {
    throw new Error(`${name} MV3 action default state must be disabled.`);
  }

  if (target.manifestVersion === 2 && 'default_state' in (action ?? {})) {
    throw new Error(`${name} MV2 browser action contains an unexpected default state.`);
  }

  const backgroundReferences = getBackgroundReferences(target, manifest);
  if (backgroundReferences.length === 0) {
    throw new Error(`${name} background entrypoint is missing from the manifest.`);
  }

  for (const reference of backgroundReferences) {
    if (!existsSync(path.join(buildDirectory, reference))) {
      throw new Error(`${name} background bundle was not found at ${reference}.`);
    }
  }

  if (name === 'firefox') {
    const gecko = manifest.browser_specific_settings?.gecko;
    if (gecko?.id !== 'roo-aws-roles-jumper@bibace') {
      throw new Error('Firefox Gecko ID must be roo-aws-roles-jumper@bibace.');
    }

    if (JSON.stringify(gecko.data_collection_permissions?.required) !== JSON.stringify(['none'])) {
      throw new Error('Firefox data collection declaration must be required: ["none"].');
    }

    if (gecko.strict_min_version !== '140.0') {
      throw new Error('Firefox Gecko minimum version must be 140.0.');
    }

    if (manifest.background?.service_worker) {
      throw new Error('Firefox MV2 must not contain a service worker background.');
    }
  } else if (typeof manifest.background?.service_worker !== 'string') {
    throw new Error(`${name} MV3 service worker is missing from the manifest.`);
  }

  return contentScriptReferences;
}

function verifyAwsHostAccess(name, target, manifest) {
  const manifestHostPermissions = manifest.permissions.filter((permission) => permission.includes('://'));

  if (target.manifestVersion === 2) {
    if ('host_permissions' in manifest) {
      throw new Error(`${name} MV2 manifest contains unexpected host_permissions.`);
    }

    if (JSON.stringify([...manifestHostPermissions].sort()) !== JSON.stringify([...expectedAwsHostPermissions].sort())) {
      throw new Error(`${name} manifest host permissions are not the exact approved AWS allowlist.`);
    }
    return;
  }

  if (manifestHostPermissions.length > 0 ||
      !Array.isArray(manifest.host_permissions) ||
      JSON.stringify([...manifest.host_permissions].sort()) !== JSON.stringify([...expectedAwsHostPermissions].sort())) {
    throw new Error(`${name} manifest host permissions are not the exact approved AWS allowlist.`);
  }
}

function verifyAwsContentScript(name, manifest, buildDirectory) {
  if (!Array.isArray(manifest.content_scripts) || manifest.content_scripts.length !== 1) {
    throw new Error(`${name} manifest must contain exactly one AWS content-script definition.`);
  }

  const [contentScript] = manifest.content_scripts;

  if (
    !Array.isArray(contentScript.matches) ||
    JSON.stringify([...contentScript.matches].sort()) !== JSON.stringify([...expectedAwsContentMatches].sort())
  ) {
    throw new Error(`${name} AWS content-script matches are not the exact approved list.`);
  }

  if (!Array.isArray(contentScript.js) || contentScript.js.length === 0 ||
      contentScript.js.some((reference) => typeof reference !== 'string' || reference.length === 0)) {
    throw new Error(`${name} AWS content-script must reference generated JavaScript.`);
  }

  if ('css' in contentScript) {
    throw new Error(`${name} AWS content-script must not declare CSS.`);
  }

  for (const reference of contentScript.js) {
    if (!existsSync(path.join(buildDirectory, reference))) {
      throw new Error(`${name} AWS content-script bundle was not found at ${reference}.`);
    }
  }

  return contentScript.js;
}

function getBackgroundReferences(target, manifest) {
  const background = manifest.background;
  const value = background?.[target.backgroundKey];

  if (typeof value === 'string') {
    return [value];
  }

  return Array.isArray(value) ? value : [];
}
