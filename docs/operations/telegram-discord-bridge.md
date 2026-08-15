# Telegram and Discord bridge operations

`telegram-discord-bridge` is a Cloudflare Worker, scheduled every ten minutes. Its
single SQLite-backed Durable Object reads new Discord messages through the REST API and
appends them to the private Telegram admin log. Public announcements are copied only
from the configured Discord announcements channel; `#no-telegram` suppresses only that
public copy.

The first run records the current cursor for each channel without sending historical
messages. To import the latest 100 messages from each channel once, set
`BRIDGE_INITIAL_SYNC=backfill` for the first deployment, wait for a successful run, then
remove it and deploy again. The bridge does not edit or delete historical Telegram
posts.

## Configuration

Set these as Cloudflare Worker secrets for the production Worker only:

- `DISCORD_BOT_TOKEN`: the Discord bot token.
- `DISCORD_GUILD_ID`: the Discord server ID to poll.
- `DISCORD_ANNOUNCEMENTS_CHANNEL_ID`: the Discord channel copied to public Telegram.
- `TELEGRAM_BOT_TOKEN`: the Telegram bot token.
- `TELEGRAM_ANNOUNCEMENTS_CHAT_ID`: the public Telegram announcements channel/chat ID.
- `TELEGRAM_LOG_CHAT_ID`: the private Telegram admin-log channel/chat ID.

The IDs are not intrinsically secret, but storing all six as Worker secrets keeps the
environment-specific configuration out of source control and makes deployment validation
consistent. `DISCORD_BRIDGE` is a Durable Object binding in `wrangler.jsonc`, not a
secret or variable.

The Worker is deployed only by the production deployment workflow. The deployment
credential variables `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` belong only in
the deployment terminal or GitHub Actions secrets; they are not Worker bindings.

The Discord bot needs access to the server's readable text and active-thread channels,
and its **Message Content Intent** must be enabled in the Discord Developer Portal so
the REST API returns message contents and attachments. The Telegram bot needs permission
to post in the public announcements channel and the private admin-log channel.

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

4. Keep the three values ready. The initial production deployment must set all six
   bridge secrets together, including the three Discord values, as described below.

## First production deployment

After completing the Discord setup, use a temporary `.env` file containing all six
secrets. Do not use individual `wrangler secret put` commands for this initial setup:
each one creates a new live Worker version. From `apps/telegram-discord-bridge`:

```fish
set secrets_file (mktemp --suffix=.env)
$EDITOR $secrets_file
```

Enter these lines in the temporary file, then save it:

```dotenv
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=
DISCORD_ANNOUNCEMENTS_CHANNEL_ID=
TELEGRAM_BOT_TOKEN=
TELEGRAM_ANNOUNCEMENTS_CHAT_ID=
TELEGRAM_LOG_CHAT_ID=
```

Authenticate with `bunx wrangler login` if necessary, then run this single production
deployment. It uploads the code and all six encrypted secrets together; it has no
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
