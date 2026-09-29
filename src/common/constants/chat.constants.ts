export const CHAT_MESSAGE_MAX_LENGTH = 10_000;

/** Most recent messages of a conversation sent back to the provider. */
export const CHAT_CONTEXT_MESSAGE_LIMIT = 20;

export const CHAT_MAX_OUTPUT_TOKENS = 1024;

/** New conversations are titled with the start of their first message. */
export const CHAT_TITLE_MAX_LENGTH = 60;

export const CHAT_ENDPOINT = 'POST /chats/messages';

export const CHAT_STREAM_ENDPOINT = 'POST /chats/messages/stream';
