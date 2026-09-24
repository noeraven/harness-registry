# Harness Registry

**Status: Experimental**

A curated directory of hosted Noe Harness extensions. This repository records
**where** an extension lives. Each extension's own `noeraven-extension.json`
is the source of truth for its version, name, description, commands, and themes.

The registry starts empty while its format and review process stabilize. The
browser harness currently supports direct installation from a public GitHub
repository; registry discovery can be connected when this repository is public.

## Structure

```text
harness-registry/
├── README.md
├── CONTRIBUTING.md
├── LICENSE
├── registry.json
├── schema/registry.schema.json
├── scripts/validate.mjs
├── tests/validate.test.mjs
└── .github/
    ├── workflows/validate.yml
    └── PULL_REQUEST_TEMPLATE.md
```

## Registry format

`registry.json` contains stable extension IDs and canonical public GitHub
repository URLs only:

```json
{
  "registryVersion": 1,
  "extensions": [
    {
      "id": "publisher.extension",
      "repository": "https://github.com/publisher/extension"
    }
  ]
}
```

The ID appears in both the registry and the extension manifest so validation
can confirm that a listing points to the intended extension. Release versions
and display metadata live only in the extension manifest. Do not add `version`,
`name`, `description`, or copied contribution data to registry entries.
`registryVersion` versions this directory format; it is separate from an
extension's `apiVersion` and release `version`.

The extension repository must have `noeraven-extension.json` at its root. The
manifest follows [Noe Extension API v1](https://github.com/noeraven/noeharness/blob/main/docs/extensions.md).
The registry lists data-only commands and themes; it does not load scripts or
grant extension repositories access to the harness.

## Validation

Run from this repository:

```sh
node --test
node scripts/validate.mjs --offline
node scripts/validate.mjs
```

The offline command checks registry structure, canonical URLs, and duplicate
IDs or repositories. The full command also downloads each listed public
manifest from GitHub, checks the 100 KB limit and API v1 format, and confirms
its ID matches the registry entry. It never runs code from extension
repositories. The harness remains the final validator at installation.

CI runs the tests and full validation for pull requests and pushes to `main`.
See [CONTRIBUTING.md](CONTRIBUTING.md) to propose a listing.

## Discovery and updates

This registry is for discovery. Installation and user-requested updates fetch
and validate the extension's manifest from its own repository. The harness
saves a reviewed local snapshot; editing the registry does not silently change
installed extensions. Removing a listing removes it from future discovery but
does not uninstall existing local copies.

If the catalog grows enough that fetching every manifest becomes costly, a
separate catalog cache can be generated from manifests by CI. Such a cache
would be derived output, never manually maintained release metadata.
