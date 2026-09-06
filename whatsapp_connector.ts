import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion, extractMessageContent } from '@whiskeysockets/baileys';
import pino from 'pino';
import * as qrcode from 'qrcode';
import { processIncomingMessage, messageDiagnostics } from './server_whatsapp_handler.ts';
import fs from 'fs';

let qrCodeDataURL: string | null = null;
let currentStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
let sock: any = null;
let connectionStartTime = Date.now();
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

// In-memory buffer of recent messages to support Baileys encryption retries and getMessage callback
const recentMessages = new Map<string, any>();
function storeRecentMessage(keyId: string, msg: any) {
    if (!keyId) return;
    recentMessages.set(keyId, msg);
    if (recentMessages.size > 500) {
        const firstKey = recentMessages.keys().next().value;
        if (firstKey) recentMessages.delete(firstKey);
    }
}

export const getWhatsAppStatus = () => {
    return {
        status: currentStatus,
        qr: qrCodeDataURL,
        diagnostics: messageDiagnostics
    };
};

export async function resetWhatsAppConnection() {
    try {
        if (sock) {
            sock.end();
            sock = null;
        }
    } catch (e) {
        console.error("Error closing existing WhatsApp socket:", e);
    }
    currentStatus = 'disconnected';
    qrCodeDataURL = null;
    reconnectAttempts = 0;
    recentMessages.clear();
    try {
        if (fs.existsSync('./baileys_auth_info')) {
            fs.rmSync('./baileys_auth_info', { recursive: true, force: true });
            console.log('Successfully deleted baileys_auth_info on user request.');
        }
    } catch (err) {
        console.error("Could not delete baileys_auth_info folder:", err);
    }
}

export function getMessageText(message: any): string | null {
    if (!message) return null;

    // Unpack deviceSentMessage (sent from user's phone in multi-device testing)
    if (message.deviceSentMessage?.message) {
        return getMessageText(message.deviceSentMessage.message);
    }

    // Unpack edited messages (protocolMessage or editedMessage wrapper)
    if (message.protocolMessage?.editedMessage) {
        return getMessageText(message.protocolMessage.editedMessage);
    }
    if (message.editedMessage?.message) {
        return getMessageText(message.editedMessage.message);
    }

    // Normalize using Baileys official extractMessageContent
    let normalized = message;
    try {
        normalized = extractMessageContent(message) || message;
    } catch {
        normalized = message;
    }

    // Direct text fields
    if (typeof normalized.conversation === 'string' && normalized.conversation.trim()) {
        return normalized.conversation.trim();
    }
    if (typeof normalized.extendedTextMessage?.text === 'string' && normalized.extendedTextMessage.text.trim()) {
        return normalized.extendedTextMessage.text.trim();
    }
    if (typeof normalized.imageMessage?.caption === 'string' && normalized.imageMessage.caption.trim()) {
        return normalized.imageMessage.caption.trim();
    }
    if (typeof normalized.documentMessage?.caption === 'string' && normalized.documentMessage.caption.trim()) {
        return normalized.documentMessage.caption.trim();
    }
    if (typeof normalized.videoMessage?.caption === 'string' && normalized.videoMessage.caption.trim()) {
        return normalized.videoMessage.caption.trim();
    }

    // Support wrapped message models (viewOnce, ephemeral, templates, etc.)
    if (normalized.viewOnceMessageV2?.message) return getMessageText(normalized.viewOnceMessageV2.message);
    if (normalized.viewOnceMessageV2Extension?.message) return getMessageText(normalized.viewOnceMessageV2Extension.message);
    if (normalized.viewOnceMessage?.message) return getMessageText(normalized.viewOnceMessage.message);
    if (normalized.ephemeralMessage?.message) return getMessageText(normalized.ephemeralMessage.message);
    if (normalized.documentWithCaptionMessage?.message) return getMessageText(normalized.documentWithCaptionMessage.message);

    // Template or Interactive messages
    if (normalized.templateMessage?.hydratedTemplate?.hydratedContentText) return normalized.templateMessage.hydratedTemplate.hydratedContentText;
    if (normalized.templateMessage?.hydratedFourRowTemplate?.hydratedContentText) return normalized.templateMessage.hydratedFourRowTemplate.hydratedContentText;
    if (normalized.interactiveMessage?.body?.text) return normalized.interactiveMessage.body.text;
    if (normalized.buttonsMessage?.contentText) return normalized.buttonsMessage.contentText;
    if (normalized.buttonsResponseMessage?.selectedDisplayText) return normalized.buttonsResponseMessage.selectedDisplayText;
    if (normalized.templateButtonReplyMessage?.selectedDisplayText) return normalized.templateButtonReplyMessage.selectedDisplayText;

    return null;
}

export async function startWhatsAppConnection() {
    if (currentStatus === 'connected' || currentStatus === 'connecting') {
        return;
    }
    currentStatus = 'connecting';
    qrCodeDataURL = null;
    connectionStartTime = Date.now();
    console.log('[WA DEBUG] Starting WhatsApp connection, currentStatus=connecting');

    try {
        let waVersion: any = undefined;
        try {
            const versionInfo = await fetchLatestBaileysVersion();
            waVersion = versionInfo.version;
            console.log(`[WA DEBUG] Using WhatsApp Web version: ${Array.isArray(waVersion) ? waVersion.join('.') : waVersion}`);
        } catch (vErr) {
            console.warn('[WA DEBUG] Could not fetch online WA version, falling back to default.');
        }

        const { state, saveCreds } = await useMultiFileAuthState('./baileys_auth_info');

        sock = makeWASocket({
            version: waVersion,
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }) as any,
            browser: Browsers.macOS('Chrome'),
            syncFullHistory: false,
            markOnlineOnConnect: true,
            getMessage: async (key: any) => {
                if (key?.id && recentMessages.has(key.id)) {
                    return recentMessages.get(key.id)?.message;
                }
                return undefined;
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // Diagnostic event listeners to trace all Baileys activity
        sock.ev.on('messages.update', (updates: any) => {
            console.log(`[WA EVENT] messages.update: ${updates?.length || 0} updates`);
        });
        sock.ev.on('messages.delete', (del: any) => {
            console.log(`[WA EVENT] messages.delete event received`);
        });
        sock.ev.on('message-receipt.update', (updates: any) => {
            console.log(`[WA EVENT] message-receipt.update: ${updates?.length || 0} receipts`);
        });
        sock.ev.on('chats.upsert', (chats: any) => {
            console.log(`[WA EVENT] chats.upsert: ${chats?.length || 0} chats`);
        });
        sock.ev.on('chats.update', (chats: any) => {
            console.log(`[WA EVENT] chats.update: ${chats?.length || 0} chats`);
        });
        sock.ev.on('contacts.upsert', (contacts: any) => {
            console.log(`[WA EVENT] contacts.upsert: ${contacts?.length || 0} contacts`);
        });
        sock.ev.on('presence.update', (presence: any) => {
            console.log(`[WA EVENT] presence.update: ${JSON.stringify(presence).substring(0, 150)}`);
        });

        sock.ev.on('connection.update', async (update: any) => {
            const { connection, lastDisconnect, qr } = update;

            console.log(`[WA DEBUG] connection.update: connection=${connection || 'none'}, status=${currentStatus}, qrCode=${!!qr}`);

            if (qr) {
                try {
                    qrCodeDataURL = await qrcode.toDataURL(qr);
                    console.log('[WA DEBUG] New QR Code data URL generated successfully.');
                } catch (err) {
                    console.error("[WA DEBUG] QR Code conversion error:", err);
                }
            }

            if (connection === 'close') {
                currentStatus = 'disconnected';
                qrCodeDataURL = null;
                const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;

                let shouldReconnect = true;

                if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                    shouldReconnect = false;
                    try {
                        fs.rmSync('./baileys_auth_info', { recursive: true, force: true });
                        console.log('[WA DEBUG] Cleared baileys_auth_info due to logout/unauthorized (statusCode ' + statusCode + ').');
                    } catch (err) { }
                    console.log('[WA DEBUG] Automatically starting a new WhatsApp connection to generate a new QR code...');
                    setTimeout(startWhatsAppConnection, 5000);
                } else if (statusCode === DisconnectReason.badSession || statusCode === 500) {
                    shouldReconnect = false;
                    try {
                        fs.rmSync('./baileys_auth_info', { recursive: true, force: true });
                        console.log('[WA DEBUG] Cleared baileys_auth_info due to bad session (statusCode ' + statusCode + ').');
                    } catch (err) { }
                    console.log('[WA DEBUG] Automatically starting a new WhatsApp connection to generate a new QR code...');
                    setTimeout(startWhatsAppConnection, 5000);
                } else if (statusCode === DisconnectReason.connectionReplaced || statusCode === 440) {
                    shouldReconnect = false;
                    console.log('[WA DEBUG] Connection conflict (another client connected). Not reconnecting automatically.');
                } else if (statusCode === 405) {
                    shouldReconnect = false;
                    try {
                        fs.rmSync('./baileys_auth_info', { recursive: true, force: true });
                    } catch (err) { }
                    console.warn('[WA DEBUG] WhatsApp pairing rejected (405). Auth state reset. Please request QR from the WhatsApp panel.');
                } else if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
                    console.log('[WA DEBUG] Restart required by WhatsApp server, reconnecting...');
                    shouldReconnect = true;
                } else {
                    console.log('[WA DEBUG] WhatsApp connection closed due to:', lastDisconnect?.error?.message || lastDisconnect?.error || 'Unknown error');
                }

                // reconnect with max retry limit
                if (shouldReconnect) {
                    reconnectAttempts++;
                    if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
                        console.log(`[WA DEBUG] Reconnecting attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in 5s...`);
                        setTimeout(startWhatsAppConnection, 5000);
                    } else {
                        console.log('[WA DEBUG] Max WhatsApp reconnect attempts reached. Waiting for manual trigger.');
                        sock = null;
                    }
                } else {
                    sock = null;
                }
            } else if (connection === 'open') {
                console.log('[WA DEBUG] WhatsApp Connection Opened successfully!');
                currentStatus = 'connected';
                qrCodeDataURL = null;
                reconnectAttempts = 0;
            }
        });

        const handleBaileysMessage = async (msg: any, isLiveNotify: boolean = false) => {
            if (!msg) return;

            const messageId = msg.key?.id || 'unknown';
            const remoteJid = msg.key?.remoteJid || '';

            // Store message in recent buffer for getMessage decryption retries
            storeRecentMessage(messageId, msg);

            // Skip status broadcast and newsletter channels
            if (remoteJid === 'status@broadcast' || remoteJid.endsWith('@newsletter')) return;

            // Timestamp parsing: handle Long object, number, or string safely
            let rawTs = msg.messageTimestamp;
            let tsSeconds = 0;
            if (typeof rawTs === 'number') {
                tsSeconds = rawTs;
            } else if (rawTs && typeof rawTs === 'object') {
                tsSeconds = Number((rawTs as any).low ?? (rawTs as any).toNumber?.() ?? 0);
            } else if (typeof rawTs === 'string') {
                tsSeconds = parseInt(rawTs, 10) || 0;
            }

            const msgTimestamp = tsSeconds > 0
                ? (tsSeconds < 10000000000 ? tsSeconds * 1000 : tsSeconds)
                : Date.now();

            // Only skip historical messages if this is NOT a live notification event and is older than startup
            if (!isLiveNotify && msgTimestamp < connectionStartTime - 300000) {
                console.log(`[WA DEBUG] Skipping historical appended message ${messageId} from ${remoteJid}`);
                return;
            }

            if (!msg.message) {
                console.log(`[WA DEBUG] Message ${messageId} skipped: msg.message is empty (receipt, reaction, or protocol message).`);
                return;
            }

            const keys = Object.keys(msg.message || {});
            const textContent = getMessageText(msg.message);

            if (!textContent) {
                console.log(`[WA DEBUG] Message ${messageId} from ${remoteJid} skipped: No text content found. Available keys: ${JSON.stringify(keys)}`);
                return;
            }

            // Skip automated responses sent by the bot (fromMe) to prevent recursive loops
            if (msg.key?.fromMe) {
                const lowerText = textContent.toLowerCase();
                if (
                    lowerText.includes('agrosys') ||
                    lowerText.includes('registramos tu') ||
                    lowerText.includes('cruce de negocio') ||
                    lowerText.includes('alerta de precio') ||
                    lowerText.includes('confirmamos la operacion')
                ) {
                    console.log(`[WA DEBUG] Message ${messageId} skipped: automated bot message/response (fromMe).`);
                    return;
                }
            }

            const isGroup = remoteJid.endsWith('@g.us');

            // Extract clean phone numbers (stripping device IDs like :10)
            const myJid = sock?.user?.id || '';
            const myCleanPhone = myJid.split('@')[0].split(':')[0];
            const remoteCleanPhone = remoteJid.split('@')[0].split(':')[0];
            const isSelfChat = remoteCleanPhone === myCleanPhone;

            let senderPhone = 'Unknown';
            if (msg.key?.fromMe) {
                senderPhone = myCleanPhone || 'Me';
            } else {
                const senderJid = msg.key?.participantAlt || msg.key?.remoteJidAlt || msg.key?.participant || remoteJid || '';
                senderPhone = senderJid.split('@')[0].split(':')[0] || 'Unknown';
            }

            const sourceGroup = isGroup
                ? 'Grupo WhatsApp'
                : (isSelfChat ? 'Mensaje a Mí Mismo (Prueba)' : (msg.key?.fromMe ? 'Enviado por Mí' : 'Chat Privado'));

            console.log(`[WA DEBUG] Processing msg ${messageId} from ${senderPhone} (Group: ${isGroup}, fromMe: ${msg.key?.fromMe || false}, Live: ${isLiveNotify}): ${textContent}`);
            try {
                await processIncomingMessage(textContent, senderPhone, sourceGroup, messageId);
            } catch (err) {
                console.error(`[WA DEBUG] Error processing message ID ${messageId}`, err);
            }
        }

        sock.ev.on('messages.upsert', async (m: any) => {
            const isLiveNotify = m.type === 'notify';
            console.log(`[WA RAW] messages.upsert event: type=${m.type}, count=${m.messages?.length || 0}`);
            for (const msg of (m.messages || [])) {
                await handleBaileysMessage(msg, isLiveNotify);
            }
        });

        sock.ev.on('messaging-history.set', async ({ messages }: any) => {
            if (messages && Array.isArray(messages)) {
                console.log(`[WA DEBUG] messaging-history.set received ${messages.length} messages.`);
                for (const msg of messages) {
                    await handleBaileysMessage(msg, false);
                }
            }
        });
    } catch (startErr) {
        console.error('[WA DEBUG] Error initializing WhatsApp socket:', startErr);
        currentStatus = 'disconnected';
        sock = null;
    }
}

export async function sendWhatsAppMessage(phone: string, text: string) {
    if (!sock || currentStatus !== 'connected') {
        console.warn(`[WA DEBUG] Cannot send message to ${phone}: WhatsApp not connected.`);
        return false;
    }
    try {
        let jid = phone;
        if (!jid.includes('@')) {
            const cleanPhone = jid.replace(/\D/g, '');
            jid = `${cleanPhone}@s.whatsapp.net`;
        }
        await sock.sendMessage(jid, { text });
        console.log(`[WA DEBUG] Sent message to ${phone} successfully: ${text}`);
        return true;
    } catch (e) {
        console.error(`[WA DEBUG] Error sending message to ${phone}:`, e);
        return false;
    }
}
