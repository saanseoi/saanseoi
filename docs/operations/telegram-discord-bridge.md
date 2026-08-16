# Telegram and Discord bridge operations

`telegram-discord-bridge` is a Cloudflare Worker, scheduled every ten minutes. Its
single SQLite-backed Durable Object reads new Discord messages through the REST API and
appends them to the private Telegram admin log. Public announcements are copied only
from the configured Discord announcements channel; `#no-telegram` suppresses only that
public copy. The same announcements are also copied to the
[`saanseoi/saanseoi` Announcements Discussions category](https://github.com/saanseoi/saanseoi/discussions/categories/announcements).
`#no-github` suppresses only the GitHub Discussion copy.

The first run records the current cursor for each channel without sending historical
messages. To import the latest 100 messages from each channel once, set
`BRIDGE_INITIAL_SYNC=backfill` for the first deployment, wait for a successful run, then
remove it and deploy again. The bridge does not edit or delete historical Telegram
posts.

The bridge polls Discord guild-text and announcement channels, plus active public,
private and announcement threads. This includes every text channel currently shown in
the SaanSeoi server: `#general`, `#datasets`, `#mapping`, `#feedback`, `#help`,
`#rules`, `#welcome`, `#announcements`, `#jobs`, `#system` and `#releases`. It does not
replay messages that were already present when a channel first acquired a cursor. A
message sent after that first poll is included in the private Telegram log, even if its
Discord body is empty (for example, a join or other Discord system message).

## Discord administration

Use the Mountainfish bot rather than the Discord dashboard for repeatable server
changes. On an administration machine, use the directly available
`DISCORD_BOT_TOKEN_SAANSEOI` and `DISCORD_GUILD_ID_SAANSEOI` environment variables. Do
not print or record the token in the repository, shell history or a command pasted into
a chat. The production bridge has its separately named, encrypted `DISCORD_BOT_TOKEN`
Worker secret; the local administration credential does not change that deployment
configuration.

Use Discord API v10 for a read-before-write check. The following commands expose only
channel and role metadata, not credentials:

```fish
set api https://discord.com/api/v10
set auth "Authorization: Bot $DISCORD_BOT_TOKEN_SAANSEOI"

curl --fail-with-body --silent --show-error -H $auth \
  "$api/guilds/$DISCORD_GUILD_ID_SAANSEOI/channels" \
  | jq -r '.[] | [.id, .type, (.parent_id // "-"), .name, .position] | @tsv'

curl --fail-with-body --silent --show-error -H $auth \
  "$api/guilds/$DISCORD_GUILD_ID_SAANSEOI/roles" \
  | jq -r '.[] | [.id, .name, .permissions] | @tsv'
```

The policy is role-based. `Mountainfish` is the bot role. The SaanSeoi teams are the
`Admin` and `Moderator` roles; grant human posting rights through those roles, not by
individual account ID. Prefer the narrowest channel-level overwrite, then read back the
created or updated channel before reporting success. Do not add webhooks to a read-only
channel unless that webhook is intentionally an additional publisher.

### `#releases` policy

`#releases` is a guild-text channel in the `PLATFORM` category. Its channel-level
overwrites deliberately make it readable by everyone despite that category's otherwise
private default:

- `@everyone`: allow **View Channel** and **Read Message History**; deny **Send
  Messages**.
- `Mountainfish`, `Admin` and `Moderator`: allow **View Channel**, **Read Message
  History** and **Send Messages**.

This means the only intended publishers are Mountainfish and members of either SaanSeoi
team role. When changing the policy, update every one of those four overwrites together
and retain the `@everyone` send denial.

### API release announcements

The production Harbour API posts one Discord embed to `#releases` when it first changes
an API release set from draft to published. It runs after the immutable release set and
its first changelog have been committed, so retries and later processing stages do not
post a second announcement. The same rule applies when
`release-sets:reconcile --target production` completes a previously draft release set.

Each embed includes the publisher name, source version, API version, cohort, domain and
catalogue revision, and links to the public release log at
`https://saanseoi.hk/apis/{api-family}/{release-set-code}`. A Discord failure is logged
but does not roll back or fail the already-published API release set.

This publisher is production-only: preview and local Harbour configurations have no
release-channel ID or Discord bot secret. The production channel ID is a non-secret
Worker variable. Set the production-only bot secret from the local Fish credential
without exposing it in the command line:

```fish
source $HOME/discord.fish
printf %s "$DISCORD_BOT_TOKEN_SAANSEOI" \
  | bunx wrangler secret put DISCORD_BOT_TOKEN --env production
```

Run that command from `apps/harbour-api`; it creates a new production Worker version.
Deploy the Harbour API afterwards so the production route begins publishing embeds.

## Configuration

Set these as Cloudflare Worker secrets for the production Worker only:

- `DISCORD_BOT_TOKEN`: the Discord bot token.
- `DISCORD_GUILD_ID`: the Discord server ID to poll.
- `DISCORD_ANNOUNCEMENTS_CHANNEL_ID`: the Discord channel copied to public Telegram.
- `TELEGRAM_BOT_TOKEN`: the Telegram bot token.
- `TELEGRAM_ANNOUNCEMENTS_CHAT_ID`: the public Telegram announcements channel/chat ID.
- `TELEGRAM_LOG_CHAT_ID`: the private Telegram admin-log channel/chat ID.
- `GITHUB_APP_ID`: the ID of the GitHub App that publishes announcements.
- `GITHUB_APP_INSTALLATION_ID`: that App's installation ID for `saanseoi/saanseoi`.
- `GITHUB_APP_PRIVATE_KEY_BASE64`: Base64 encoding of the GitHub App's downloaded PKCS#8
  private-key file. This stays a single Worker secret without storing a PEM file on the
  Worker filesystem.

The IDs are not intrinsically secret, but storing all nine configuration values as
Worker secrets keeps the environment-specific configuration out of source control and
makes deployment validation consistent. `DISCORD_BRIDGE` is a Durable Object binding in
`wrangler.jsonc`, not a secret or variable.

The Worker is deployed only by the production deployment workflow. The deployment
credential variables `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` belong only in
the deployment terminal or GitHub Actions secrets; they are not Worker bindings.

The Discord bot needs access to the server's readable text and active-thread channels,
and its **Message Content Intent** must be enabled in the Discord Developer Portal so
the REST API returns message contents and attachments. The Telegram bot needs permission
to post in the public announcements channel and the private admin-log channel.

The GitHub App must be installed only on `saanseoi/saanseoi` with **Discussions: Read
and write** repository permission. The bridge resolves the existing `announcements`
category at delivery time, creates a Discussion whose title is the first non-empty
Discord line, and keeps the complete Discord text and attachment URLs in its body. It
links back to the source Discord message. It does not edit or delete GitHub Discussions
after publishing.

## Telegram setup

1. In Telegram, open [@BotFather](https://t.me/BotFather), run `/newbot`, and save the
   token it gives you. The bridge only sends Telegram messages, so do not configure a
   Telegram webhook or change BotFather privacy settings.
2. Create or choose the public announcements channel and a separate private admin-log
   channel. Add the bot as an administrator of both, with permission to post messages.
3. Post one ordinary test message to each channel. On a local machine, retrieve their
   numeric chat IDs with Fish (the ID must retain its leading minus sign):

   ```fish
   read --silent TELEGRAM_BOT_TOKEN
   curl --silent --show-error "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates" \
     | jq -r '.result[] | (.channel_post // .edited_channel_post) | select(.) | "\(.chat.title)\t\(.chat.id)"'
   set --erase TELEGRAM_BOT_TOKEN
   ```

   Set `TELEGRAM_ANNOUNCEMENTS_CHAT_ID` to the public channel ID and
   `TELEGRAM_LOG_CHAT_ID` to the private channel ID. If the command prints no channel
   posts, confirm the bot was made an administrator before posting the test messages,
   then run it again.

4. Keep the three values ready. The initial production deployment must set all nine
   bridge secrets together, including the three Discord and three GitHub values, as
   described below.

## First production deployment

After completing the Discord and GitHub setup, use a temporary `.env` file containing
all nine secrets. Do not use individual `wrangler secret put` commands for this initial
setup: each one creates a new live Worker version. From `apps/telegram-discord-bridge`:

```fish
set secrets_file (mktemp --suffix=.env)
$EDITOR $secrets_file
```

Enter these lines in the temporary file, then save it:

```dotenv
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=
DISCORD_ANNOUNCEMENTS_CHANNEL_ID=
GITHUB_APP_ID=
GITHUB_APP_INSTALLATION_ID=
GITHUB_APP_PRIVATE_KEY_BASE64=
TELEGRAM_BOT_TOKEN=
TELEGRAM_ANNOUNCEMENTS_CHAT_ID=
TELEGRAM_LOG_CHAT_ID=
```

Authenticate with `bunx wrangler login` if necessary, then run this single production
deployment. It uploads the code and all nine encrypted secrets together; it has no
preview or local target.

```fish
bunx wrangler deploy --secrets-file $secrets_file --minify
rm -- $secrets_file
```

Later deployments made by GitHub Actions preserve these Worker secrets. For a future
secret rotation, use `bunx wrangler secret put SECRET_NAME` from this same directory;
that also targets the production Worker directly.

## Scheduled job records

The Harbour CLI may separately post scheduled-job records to a private Discord channel
via `SAANSEOI_DISCORD_JOBS_WEBHOOK_URL`. Those Discord records are subsequently included
in the append-only Telegram admin log by this Worker. That webhook remains configured in
`~/.config/saanseoi/scheduled-jobs.env` for the local systemd timers; it is not a Worker
secret.
