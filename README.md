# d6e Plugin Registry

Source of truth for the d6e Plugin ecosystem registry. This repository hosts the registry YAML data that the marketplace and every d6e instance read at runtime to list and install plugins.

The catalog browser ([d6e-plugin-marketplace](https://gitlab.com/cauchye/d6e-ai/d6e-plugin-marketplace)) and each self-hosted d6e instance read this registry at runtime to list and install plugins.

## Architecture

```
d6e-plugin-registry (this repo)
├── registry/                      Plugin registry data
│   ├── index.yaml                 Master index
│   └── {namespace}/{name}.yaml    Per-plugin detail
├── verified-plugins.yaml          Manually curated verified list (MR only)
└── scripts/
    └── discover-plugins.mjs       Legacy discovery script (currently unused)
```

## Public URLs

The registry is served as static files via GitLab Raw.

- **Index**: `https://gitlab.com/cauchye/d6e-ai/d6e-plugin-registry/-/raw/main/registry/index.yaml`
- **Plugin detail**: `https://gitlab.com/cauchye/d6e-ai/d6e-plugin-registry/-/raw/main/registry/{namespace}/{name}.yaml`

A JSON/YAML HTTP API wrapper is also available through the marketplace:

- **Index**: `https://marketplace.d6e.ai/api/registry` (append `?format=json` for JSON)
- **Plugin detail**: `https://marketplace.d6e.ai/api/registry/{namespace}/{name}`

Self-hosted d6e instances read the marketplace API by default (`MARKETPLACE_REGISTRY_URL`). Direct GitLab Raw access is supported for environments that prefer to bypass the marketplace.

## How to List a Plugin

> **Note:** The former GitHub-topic-based auto-discovery pipeline is currently
> unavailable. Marketplace listing is done manually via MRs to this repository.
> For development and testing you do not need a listing at all — use the
> **Install from URL** feature on the workspace's Plugins page instead.

1. Host your plugin repository (with a valid `template.yaml`) somewhere the
   installing d6e instance can reach — a public GitLab/GitHub repo, or a private
   one (installs then require an access token).
2. Submit an MR to this repository that adds:
   - an entry to `registry/index.yaml` under the `plugins:` key, and
   - a detail file `registry/{namespace}/{name}.yaml` (see format below).
3. The d6e team reviews and merges the MR. The plugin appears in the
   marketplace and on every instance's Plugins page after the caches expire
   (about 5 minutes).

### Verified Plugins

Verified plugins receive a green badge and are listed first. To request verification, include your plugin in `verified-plugins.yaml` in the same MR:

```yaml
plugins:
  - namespace: your-org
    name: your-plugin
```

The d6e team reviews the plugin contents (see the security guidelines in [d6e-plugin-skills](https://gitlab.com/cauchye/d6e-ai/d6e-plugin-skills)) before merging.

### Removing a Plugin

Submit an MR removing the entry from `registry/index.yaml` (and the detail file, and `verified-plugins.yaml` if listed).

## Registry Format

**`registry/index.yaml`** (master index):

```yaml
plugins:
  - namespace: my-org
    name: my-plugin
    description: Short description
    tier: unverified    # or "verified" if in verified-plugins.yaml
    category: business
    icon: package
    latestVersion: v1.0.0
```

**`registry/{namespace}/{name}.yaml`** (per-plugin detail):

```yaml
name: my-plugin
namespace: my-org
description: Short description
tier: unverified
repo: https://gitlab.com/my-org/d6e-plugin-my-plugin
category: business
icon: package
versions:
  - version: v1.0.0
    releaseDate: "2026-04-09"
    manifestUrl: https://gitlab.com/my-org/d6e-plugin-my-plugin/-/raw/v1.0.0/template.yaml
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
| **Verified** | Green | MR adding the plugin to `verified-plugins.yaml` | d6e team reviews |
| **Unverified** | Yellow | MR adding the plugin to `registry/` | Schema validation only |

## Related Repositories

- [d6e-plugin-marketplace](https://gitlab.com/cauchye/d6e-ai/d6e-plugin-marketplace) — Catalog browser website (reads this registry)
- [d6e-plugin-skills](https://gitlab.com/cauchye/d6e-ai/d6e-plugin-skills) — Agent Skills for plugin developers
- [d6e](https://gitlab.com/cauchye/d6e-ai/d6e) — The d6e platform itself (installs plugins from this registry)

## License

MIT
