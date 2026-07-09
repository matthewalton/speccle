# Contributing

## Commits

Messages follow [Conventional Commits](https://www.conventionalcommits.org):
`<type>(<scope>): <description>`

- **Types**: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.
- **Scopes**: `oracle`, `plugin`, `targets`, `docs`. Omit the scope for repo-wide
  changes.
- **Description**: imperative and concise; detail goes in the body.
- **No attribution trailers** — no `Co-Authored-By`, no "Generated with" footers, from
  any tool or agent.
- husky runs eslint + prettier on staged files; a commit that needs `--no-verify`
  isn't ready.
