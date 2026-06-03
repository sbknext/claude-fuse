/**
 * TelegramSender — sends an alert message via the Telegram Bot API.
 *
 * Uses native fetch (Node >= 18). Never throws. Returns { success, error? }.
 * Token is masked in all log output.
 */

function maskToken(token) {
  if (!token || token.length < 8) return '****';
  return token.slice(0, 4) + '****' + token.slice(-4);
}

/**
 * @param {string} message  — plain-text message to send
 * @param {{ token: string, chatId: string }} config
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function sendTelegram(message, config) {
  const { token, chatId } = config;
  if (!token || !chatId) {
    return { success: false, error: 'missing CLAUDE_FUSE_TELEGRAM_BOT_TOKEN or CLAUDE_FUSE_TELEGRAM_CHAT_ID' };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[alerts/telegram] send failed (token ${maskToken(token)}): HTTP ${res.status} — ${body.slice(0, 120)}`);
      return { success: false, error: `HTTP ${res.status}` };
    }

    return { success: true };
  } catch (err) {
    console.warn(`[alerts/telegram] send error (token ${maskToken(token)}):`, err.message);
    return { success: false, error: err.message };
  }
}
