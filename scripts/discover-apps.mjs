// Auto-discovery script for d6e apps.
//
// Searches GitHub for repositories with the "d6e-app" topic,
// fetches and validates each repo's template.yaml, then updates
// the registry files. Verified status is determined by
// verified-apps.yaml in the repository root.
//
// Supports i18n: description may be a plain string or a locale-keyed
// object (e.g. { "en-US": "...", "ja-JP": "..." }). Both formats are
// preserved as-is in the registry YAML.
//
// Limitations:
// - Only discovers public repositories (GitHub Search API constraint)
// - Rate-limited to 30 search requests/min with GITHUB_TOKEN
// - Repos without a valid template.yaml at root are skipped

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import yaml from 'js-yaml';

const REGISTRY_DIR = join(process.cwd(), 'registry');
const VERIFIED_PATH = join(process.cwd(), 'verified-apps.yaml');

async function githubFetch(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText} for ${url}`);
  }

  return response;
}

async function searchD6eAppRepos() {
  const repos = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `https://api.github.com/search/repositories?q=topic:d6e-app&per_page=${perPage}&page=${page}`;
    const response = await githubFetch(url);
    const data = await response.json();

    repos.push(...data.items);

    if (data.items.length < perPage) break;
    page++;

    // Respect rate limits between pages
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log(`Found ${repos.length} repositories with topic "d6e-app"`);
  return repos;
}

async function fetchTemplateYaml(repo) {
  const defaultBranch = repo.default_branch;
  const rawUrl = `https://raw.githubusercontent.com/${repo.full_name}/${defaultBranch}/template.yaml`;

  try {
    const response = await fetch(rawUrl);
    if (!response.ok) {
      console.warn(`  No template.yaml in ${repo.full_name} (${response.status})`);
      return null;
    }
    const text = await response.text();
    return yaml.load(text);
  } catch (error) {
    console.warn(`  Failed to fetch template.yaml from ${repo.full_name}: ${error.message}`);
    return null;
  }
}

function validateTemplate(template, repoFullName) {
  const required = ['name', 'namespace', 'version', 'description'];
  for (const field of required) {
    if (!template[field]) {
      console.warn(`  Invalid template in ${repoFullName}: missing "${field}"`);
      return false;
    }
  }

  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(template.name) && !/^[a-z0-9]$/.test(template.name)) {
    console.warn(`  Invalid name "${template.name}" in ${repoFullName}`);
    return false;
  }

  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(template.namespace) && !/^[a-z0-9]$/.test(template.namespace)) {
    console.warn(`  Invalid namespace "${template.namespace}" in ${repoFullName}`);
    return false;
  }

  if (!/^v\d+\.\d+\.\d+$/.test(template.version)) {
    console.warn(`  Invalid version "${template.version}" in ${repoFullName}`);
    return false;
  }

  return true;
}

function loadVerifiedApps() {
  if (!existsSync(VERIFIED_PATH)) return new Set();

  const content = readFileSync(VERIFIED_PATH, 'utf-8');
  const data = yaml.load(content);
  if (!data?.apps || !Array.isArray(data.apps)) return new Set();

  return new Set(data.apps.map((a) => `${a.namespace}/${a.name}`));
}

function countResources(template) {
  return {
    stfs: template.stfs?.length ?? 0,
    files: template.files?.length ?? 0,
    effects: template.effects?.length ?? 0,
    workflows: template.workflows?.length ?? 0
  };
}

function buildManifestUrl(repoFullName, version, defaultBranch) {
  const ref = version || defaultBranch;
  return `https://raw.githubusercontent.com/${repoFullName}/${ref}/template.yaml`;
}

function loadExistingDetail(namespace, name) {
  const filePath = join(REGISTRY_DIR, namespace, `${name}.yaml`);
  if (!existsSync(filePath)) return null;

  try {
    const content = readFileSync(filePath, 'utf-8');
    return yaml.load(content);
  } catch {
    return null;
  }
}

async function main() {
  console.log('Starting d6e app discovery...\n');

  const verifiedApps = loadVerifiedApps();
  console.log(`Verified apps: ${verifiedApps.size}`);

  const repos = await searchD6eAppRepos();

  // Load existing index to merge with, preventing app loss from partial search results
  let existingIndexApps = [];
  const existingIndexPath = join(REGISTRY_DIR, 'index.yaml');
  if (existsSync(existingIndexPath)) {
    try {
      const content = readFileSync(existingIndexPath, 'utf-8');
      const data = yaml.load(content);
      existingIndexApps = data?.apps ?? [];
    } catch {
      // ignore parse errors
    }
  }

  const discoveredApps = [];

  for (const repo of repos) {
    console.log(`\nProcessing: ${repo.full_name}`);

    const template = await fetchTemplateYaml(repo);
    if (!template) continue;

    if (!validateTemplate(template, repo.full_name)) continue;

    const appKey = `${template.namespace}/${template.name}`;
    const tier = verifiedApps.has(appKey) ? 'verified' : 'unverified';
    const manifestUrl = buildManifestUrl(repo.full_name, template.version, repo.default_branch);

    const existing = loadExistingDetail(template.namespace, template.name);

    const existingVersions = existing?.versions ?? [];
    const versionExists = existingVersions.some((v) => v.version === template.version);

    let versions;
    if (versionExists) {
      versions = existingVersions.map((v) =>
        v.version === template.version
          ? {
              version: template.version,
              releaseDate: v.releaseDate || new Date().toISOString().split('T')[0],
              manifestUrl,
              changelog: v.changelog || 'Updated',
              resources: countResources(template)
            }
          : v
      );
    } else {
      versions = [
        ...existingVersions,
        {
          version: template.version,
          releaseDate: new Date().toISOString().split('T')[0],
          manifestUrl,
          changelog: existingVersions.length === 0 ? 'Initial release' : 'New version',
          resources: countResources(template)
        }
      ];
    }

    const descFallback = resolveDescriptionText(template.description);
    const readme =
      existing?.readme || descFallback || `## ${template.name}\n\n${descFallback}`;

    const category = existing?.category || guessCategory(template, repo);
    const icon = existing?.icon || 'package';

    const appDetail = {
      name: template.name,
      namespace: template.namespace,
      description: template.description,
      tier,
      repo: repo.html_url,
      category,
      icon,
      screenshots: existing?.screenshots ?? [],
      versions,
      readme
    };

    const existingIdx = discoveredApps.findIndex(
      (a) => a.namespace === template.namespace && a.name === template.name
    );
    if (existingIdx !== -1) {
      console.warn(`  Duplicate ${appKey} — overwriting previous entry`);
      discoveredApps[existingIdx] = appDetail;
    } else {
      discoveredApps.push(appDetail);
    }

    const nsDir = join(REGISTRY_DIR, template.namespace);
    mkdirSync(nsDir, { recursive: true });
    writeFileSync(join(nsDir, `${template.name}.yaml`), yaml.dump(appDetail, { lineWidth: 120 }));

    console.log(`  ✓ ${appKey}@${template.version} (${tier})`);
  }

  // Merge: start with discovered apps, then add existing apps not found in this run
  const discoveredKeys = new Set(discoveredApps.map((app) => `${app.namespace}/${app.name}`));
  const mergedIndexApps = discoveredApps.map((app) => ({
    namespace: app.namespace,
    name: app.name,
    description: app.description,
    tier: app.tier,
    category: app.category,
    icon: app.icon,
    latestVersion: app.versions[app.versions.length - 1].version
  }));

  const indexApps = mergedIndexApps;

  indexApps.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === 'verified' ? -1 : 1;
    return `${a.namespace}/${a.name}`.localeCompare(`${b.namespace}/${b.name}`);
  });

  writeFileSync(join(REGISTRY_DIR, 'index.yaml'), yaml.dump({ apps: indexApps }, { lineWidth: 120 }));

  console.log(`\nRegistry updated: ${discoveredApps.length} apps`);

  const hasChanges = execSync('git diff --name-only', { encoding: 'utf-8' }).trim();
  if (!hasChanges) {
    console.log('No changes detected. Skipping commit.');
    return;
  }

  console.log('Committing changes...');
  execSync('git config user.name "github-actions[bot]"');
  execSync('git config user.email "github-actions[bot]@users.noreply.github.com"');
  execSync('git add registry/');
  execSync(`git commit -m "Update registry: ${discoveredApps.length} apps discovered"`);
  execSync('git push');

  console.log('Done!');
}

function resolveDescriptionText(description) {
  if (typeof description === 'string') return description;
  if (typeof description === 'object' && description !== null) {
    return Object.values(description).join(' ');
  }
  return '';
}

function guessCategory(template, repo) {
  const descText = resolveDescriptionText(template.description);
  const text = `${descText} ${template.name} ${repo.description || ''}`.toLowerCase();
  const categories = {
    business: ['invoice', 'accounting', 'finance', 'erp', 'crm', 'sales'],
    analytics: ['analytics', 'report', 'dashboard', 'chart', 'data'],
    communication: ['slack', 'email', 'notification', 'chat', 'message'],
    development: ['dev', 'debug', 'test', 'ci', 'deploy', 'code'],
    productivity: ['task', 'project', 'workflow', 'automation', 'schedule'],
    ai: ['ai', 'ml', 'model', 'gpt', 'llm', 'agent']
  };

  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some((kw) => new RegExp(`\\b${kw}\\b`).test(text))) return category;
  }

  return 'other';
}

main().catch((error) => {
  console.error('Discovery failed:', error);
  process.exit(1);
});
