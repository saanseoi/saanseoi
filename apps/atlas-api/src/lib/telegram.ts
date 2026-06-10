type TelegramSendMessageResult = {
  ok: boolean
  description?: string
}

export async function sendTelegramAdminMessage(input: {
  botToken: string
  chatId: string
  text: string
}) {
  const response = await fetch(
    `https://api.telegram.org/bot${input.botToken}/sendMessage`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: input.chatId,
        text: input.text,
        disable_notification: true,
      }),
    },
  )

  const payload = (await response
    .json()
    .catch(() => null)) as TelegramSendMessageResult | null

  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.description || 'Telegram notification failed.')
  }
}
