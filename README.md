# 山水 | SaanSeoi 
Hong Kong places API

## Monorepo

This project is a monorepo managed by [Turborepo](https://turbo.build/).

```bash
# Applications
/apps
    /atlas-api # Atlas (Places API)
    /harbour # Harbour (Ingestion)
    /harbour-cli # Harbour (Upload Tool)
# Shared Libraries
/libs
    /core # Types and logic
    /db # Schema and config
    /i18n # ParaglideJs
```

## Testing

```sh
# run the test suite
bun run test
# ... in watch mode
bun run test:watch
# get test suite coverage
bun run test:coverage
```

## Fish Completion For Upload

To enable Fish completions for `bun run upload ...`, install the repo-managed snippet once:

```sh
bun run fish:install-completions
source ~/.config/fish/conf.d/saanseoi-upload-completion.fish
```

This adds:

- file and directory completion for `bun run upload <file>`
- file completion for `--db` and `--raw-root`
- option-value completion for `--type`, `--theme`, and `--region`
