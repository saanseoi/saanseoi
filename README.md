# 山水 | SaanSeoi 
Hong Kong places API

## Monorepo

This project is a monorepo managed by [Turborepo](https://turbo.build/).

```bash
# Applications
/apps
    /atlas-api # HK Atlas (Places API)
# Shared Libraries
/libs
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
