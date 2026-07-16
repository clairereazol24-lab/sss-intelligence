export async function sendOpsTelegramMessage(text: string): Promise<void> {
  const token = process.env.TELEGRAM_OPS_BOT_TOKEN
  const chatId = process.env.TELEGRAM_OPS_CHAT_ID
  if (!token || !chatId) return

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
  } catch {
    // Telegram delivery failures must never fail the underlying request.
  }
}
