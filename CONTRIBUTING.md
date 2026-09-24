# Contributing an extension listing

1. Publish a public GitHub repository with `noeraven-extension.json` at its
   root. Follow the [hosted extension guide](https://github.com/noeraven/noeharness/blob/main/docs/hosted-extensions.md).
2. Confirm the manifest uses Noe Extension API v1 and has a stable
   `publisher.extension` ID. Keep version, name, description, commands, and
   themes in that manifest.
3. Add one `{ "id", "repository" }` entry to `registry.json`. Use a canonical
   `https://github.com/OWNER/REPOSITORY` URL without `.git`, a branch path, a
   trailing slash, a query string, or credentials.
4. Run `node --test` and `node scripts/validate.mjs`. Open a pull request using
   the template. The validation workflow must pass before merging.

The validator checks schema rules, duplicate IDs and repositories, reachability
of the public manifest, its API v1 structure, and the identity match. Reviewers
also inspect the prompts and theme colors. Passing validation does not imply
publisher verification or endorsement.

For a new release, update the extension's own manifest and increment its
`version`. A registry PR is unnecessary when its ID and repository URL remain
the same. If a repository moves, propose a registry URL change and explain the
move in the PR. Do not repurpose an existing ID for a different extension.
