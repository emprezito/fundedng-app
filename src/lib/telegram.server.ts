/**
 * Telegram utilities for FundedNG admin notifications.
 * send_telegram DB function handles plain alerts (breach, equity warnings).
 * sendTelegramWithButtons() handles actionable messages with inline keyboards.
 */

import { createClient } from "@supabase/supabase-js";

const TELEGRAM_API = "https://api.telegram.org";

async function getTelegramConfig(): Promise<{ token: string; chatId: string }> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data } = await supabase
    .from("app_config")
    .select("key, value")
    .in("key", ["telegram_bot_token", "telegram_chat_id"]);

  const config = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
  return {
    token: config.telegram_bot_token ?? "",
    chatId: config.telegram_chat_id ?? "",
  };
}

export interface InlineButton {
  text: string;
  callback_data: string;
}

export async function sendTelegramWithButtons(
  message: string,
  buttons: InlineButton[][],
): Promise<void> {
  const { token, chatId } = await getTelegramConfig();
  if (!token || !chatId) {
    console.error("[telegram] Missing bot token or chat ID");
    return;
  }

  const payload = {
    chat_id: chatId,
    text: message,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: buttons.map((row) =>
        row.map((btn) => ({
          text: btn.text,
          callback_data: btn.callback_data,
        })),
      ),
    },
  };

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[telegram] sendMessage failed:", err);
    }
  } catch (e) {
    console.error("[telegram] sendMessage error:", e);
  }
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert = false,
): Promise<void> {
  const { token } = await getTelegramConfig();
  if (!token) return;
  await fetch(`${TELEGRAM_API}/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text: text ?? "",
      show_alert: showAlert,
    }),
  }).catch(() => {});
}

export async function editTelegramMessage(
  chatId: string | number,
  messageId: number,
  newText: string,
): Promise<void> {
  const { token } = await getTelegramConfig();
  if (!token) return;
  await fetch(`${TELEGRAM_API}/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: newText,
      parse_mode: "HTML",
    }),
  }).catch(() => {});
}

export async function editTelegramMessageWithButtons(
  chatId: string | number,
  messageId: number,
  newText: string,
  buttons: InlineButton[][],
): Promise<void> {
  const { token } = await getTelegramConfig();
  if (!token) return;

  await fetch(`${TELEGRAM_API}/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: newText,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: buttons.map(row =>
          row.map(btn => ({
            text: btn.text,
            callback_data: btn.callback_data,
          }))
        ),
      },
    }),
  }).catch(e => console.error("[telegram] editMessageWithButtons error:", e));
}
