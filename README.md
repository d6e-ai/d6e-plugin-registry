# d6e App Registry

Source of truth for the d6e App ecosystem registry. This repository hosts the registry YAML data and the scheduled discovery pipeline that keeps it in sync with public GitHub repositories tagged with the `d6e-app` topic.

The catalog browser ([d6e-ai/d6e-app-marketplace](https://github.com/d6e-ai/d6e-app-marketplace)) and each self-hosted d6e instance read this registry at runtime to list and install apps.

## Architecture

```
d6e-app-registry (this repo)
├── registry/                      Auto-generated app registry
│   ├── index.yaml                 Master index
│   └── {namespace}/{name}.yaml    Per-app detail
├── verified-apps.yaml             Manually curated verified list (PR only)
├── scripts/
│   └── discover-apps.mjs          Discovery script (runs in GitHub Action)
└── .github/workflows/
    └── discover-apps.yml          Scheduled workflow (every 6h)
```

## Public URLs

The registry is served as static files via GitHub Raw.

- **Index**: `https://raw.githubusercontent.com/d6e-ai/d6e-app-registry/main/registry/index.yaml`
- **App detail**: `https://raw.githubusercontent.com/d6e-ai/d6e-app-registry/main/registry/{namespace}/{name}.yaml`

A JSON/YAML HTTP API wrapper is also available through the marketplace:

- **Index**: `https://marketplace.d6e.ai/api/registry` (append `?format=json` for JSON)
- **App detail**: `https://marketplace.d6e.ai/api/registry/{namespace}/{name}`

Self-hosted d6e instances read the marketplace API by default (`MARKETPLACE_REGISTRY_URL`). Direct GitHub Raw access is supported for environments that prefer to bypass the marketplace.

## How App Discovery Works

The registry is **automatically populated** by a scheduled GitHub Action that runs every 6 hours.

### For App Developers (Unverified)

1. Create a public GitHub repository with a valid `template.yaml` at the root.
2. Add the GitHub topic **`d6e-app`** to your repository.
3. Done — your app appears in the registry within 6 hours.

No Issues or PRs required. Just create the repo and add the topic.

### For Verified Apps

Verified apps receive a green badge and are listed first. To request verification:

1. Ensure your app is already discovered (has the `d6e-app` topic).
2. Submit a PR to this repository adding your app to `verified-apps.yaml`:

   ```yaml
   apps:
     - namespace: your-org
       name: your-app
   ```

3. The d6e team will review your app and merge the PR.

### Removing an App

Remove the `d6e-app` topic from your repository. The next discovery run will remove it from the registry.

## Development

```bash
npm install
GITHUB_TOKEN=your_token npm run discover
```

### Manual Discovery

Trigger the discovery workflow manually from the Actions tab, or run locally as shown above. The script expects to run from the repository root.

## Registry Format

**`registry/index.yaml`** (auto-generated master index):

```yaml
apps:
  - namespace: my-org
    name: my-app
    description: Short description
    tier: unverified    # or "verified" if in verified-apps.yaml
    category: business
    icon: package
    latestVersion: v1.0.0
```

**`registry/{namespace}/{name}.yaml`** (auto-generated per-app detail):

```yaml
name: my-app
namespace: my-org
description: Short description
tier: unverified
repo: https://github.com/my-org/d6e-app-my-app
category: business
icon: package
versions:
  - version: v1.0.0
    releaseDate: "2026-04-09"
    manifestUrl: https://raw.githubusercontent.com/my-org/d6e-app-my-app/v1.0.0/template.yaml
    changelog: Initial release
    resources:
      stfs: 1
      files: 0
      effects: 0
      workflows: 0
readme: Short description
```

Both `description`, `changelog`, and `readme` accept either a plain string or a locale-keyed object (e.g. `{ "en-US": "...", "ja-JP": "..." }`). Consumers resolve the best match for the requested locale.

## Tier System

| Tier | Badge | How to get | Review |
|------|-------|------------|--------|
| **Verified** | Green | PR to `verified-apps.yaml` | d6e team reviews |
| **Unverified** | Yellow | Add `d6e-app` topic to repo | Automatic (schema validation only) |

## Related Repositories

- [d6e-ai/d6e-app-marketplace](https://github.com/d6e-ai/d6e-app-marketplace) — Catalog browser website (reads this registry)
- [d6e-ai/d6e-app-skills](https://github.com/d6e-ai/d6e-app-skills) — Agent Skills for app developers
- [d6e-ai/d6e](https://github.com/d6e-ai/d6e) — The d6e platform itself (installs apps from this registry)

## License

MIT
