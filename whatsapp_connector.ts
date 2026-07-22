import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } from '@whiskeysockets/baileys';
import pino from 'pino';
import * as qrcode from 'qrcode';
import { getDb, processIncomingMessage } from './server_whatsapp_handler.ts';
import fs from 'fs';

let qrCodeDataURL: string | null = null;
let currentStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
let sock: any = null;
let connectionStartTime = Date.now();

export const getWhatsAppStatus = () => {
    return {
        status: currentStatus,
        qr: qrCodeDataURL
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
    try {
        if (fs.existsSync('./baileys_auth_info')) {
            fs.rmSync('./baileys_auth_info', { recursive: true, force: true });
            console.log('Successfully deleted baileys_auth_info on user request.');
        }
    } catch (err) {
        console.error("Could not delete baileys_auth_info folder:", err);
    }
}

function getMessageText(message: any): string | null {
    if (!message) return null;
    
    // Direct fields
    if (message.conversation) return message.conversation;
    if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
    if (message.imageMessage?.caption) return message.imageMessage.caption;
    if (message.documentMessage?.caption) return message.documentMessage.caption;
    if (message.videoMessage?.caption) return message.videoMessage.caption;
    
    // Support wrapped message models (viewOnce, ephemeral, templates, etc.)
    if (message.viewOnceMessageV2?.message) return getMessageText(message.viewOnceMessageV2.message);
    if (message.viewOnceMessage?.message) return getMessageText(message.viewOnceMessage.message);
    if (message.ephemeralMessage?.message) return getMessageText(message.ephemeralMessage.message);
    if (message.documentWithCaptionMessage?.message) return getMessageText(message.documentWithCaptionMessage.message);
    
    // Template or Interactive messages (often sent by automated business services)
    if (message.templateMessage?.hydratedTemplate?.hydratedContentText) return message.templateMessage.hydratedTemplate.hydratedContentText;
    if (message.templateMessage?.hydratedFourRowTemplate?.hydratedContentText) return message.templateMessage.hydratedFourRowTemplate.hydratedContentText;
    if (message.interactiveMessage?.body?.text) return message.interactiveMessage.body.text;
    if (message.buttonsMessage?.contentText) return message.buttonsMessage.contentText;
    
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

    const { state, saveCreds } = await useMultiFileAuthState('./baileys_auth_info');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }) as any,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false,
        markOnlineOnConnect: true
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
                shouldReconnect = false; // Need a new session
                try {
                    fs.rmSync('./baileys_auth_info', { recursive: true, force: true });
                    console.log('[WA DEBUG] Cleared baileys_auth_info due to bad session (statusCode ' + statusCode + ').');
                } catch (err) { }
                console.log('[WA DEBUG] Automatically starting a new WhatsApp connection to generate a new QR code...');
                setTimeout(startWhatsAppConnection, 5000);
            } else if (statusCode === DisconnectReason.connectionReplaced || statusCode === 440) {
                shouldReconnect = false;
                console.log('[WA DEBUG] Connection conflict (another client connected). Not reconnecting automatically.');
            } else if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
                console.log('[WA DEBUG] Restart required by WhatsApp server, reconnecting...');
                shouldReconnect = true;
            } else {
                console.log('[WA DEBUG] WhatsApp connection closed due to:', lastDisconnect?.error, ', reconnecting:', shouldReconnect);
            }
            
            // reconnect if not logged out/conflict
            if (shouldReconnect) {
                setTimeout(startWhatsAppConnection, 5000);
            } else {
                sock = null;
            }
        } else if (connection === 'open') {
            console.log('[WA DEBUG] WhatsApp Connection Opened successfully!');
            currentStatus = 'connected';
            qrCodeDataURL = null;
        }
    });

    async function handleBaileysMessage(msg: any) {
        if (!msg) return;
        
        const messageId = msg.key?.id || 'unknown';
        const remoteJid = msg.key?.remoteJid || '';
        
        // Skip status broadcast messages
        if (remoteJid === 'status@broadcast') return;

        // Skip historical messages synced from history/logs on connection startup
        const msgTimestamp = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now();
        if (msgTimestamp < connectionStartTime - 300000) {
            console.log(`[WA DEBUG] Skipping historical message ${messageId} from ${remoteJid} (Sent at: ${new Date(msgTimestamp).toISOString()}, Connection started at: ${new Date(connectionStartTime).toISOString()})`);
            return;
        }

        if (!msg.message) {
            console.log(`[WA DEBUG] Message ${messageId} skipped: msg.message is empty (possibly a receipt, reaction, or protocol message).`);
            return;
        }

        const keys = Object.keys(msg.message || {});
        const textContent = getMessageText(msg.message);
        
        if (!textContent) {
            console.log(`[WA DEBUG] Message ${messageId} from ${remoteJid} skipped: No text content found. Available keys: ${JSON.stringify(keys)}`);
            return;
        }

        // Skip messages sent by ourselves (fromMe) to prevent recursive loops, but allow user self-testing messages
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
        
        // Extract logged-in JID and other JID to detect self-chats and self-sent messages
        const myJid = sock?.user?.id || '';
        const myCleanPhone = myJid.split(':')[0].split('@')[0];
        const remoteCleanPhone = remoteJid.split('@')[0] || '';
        const isSelfChat = remoteCleanPhone === myCleanPhone;

        let senderPhone = 'Unknown';
        if (msg.key.fromMe) {
            senderPhone = myCleanPhone || 'Me';
        } else {
            const senderJid = msg.key.participant || remoteJid || '';
            senderPhone = senderJid.split('@')[0] || 'Unknown';
        }

        const sourceGroup = isGroup 
            ? 'Grupo WhatsApp' 
            : (isSelfChat ? 'Mensaje a Mí Mismo (Prueba)' : (msg.key.fromMe ? 'Enviado por Mí' : 'Chat Privado'));

        console.log(`[WA DEBUG] Processing msg ${messageId} from ${senderPhone} (Group: ${isGroup}, fromMe: ${msg.key.fromMe || false}, SelfChat: ${isSelfChat}): ${textContent}`);
        try {
            await processIncomingMessage(textContent, senderPhone, sourceGroup, messageId);
        } catch (err) {
            console.error(`[WA DEBUG] Error processing message ID ${messageId}`, err);
        }
    }

    sock.ev.on('messages.upsert', async (m: any) => {
        console.log(`[WA RAW] messages.upsert event: type=${m.type}, messageCount=${m.messages?.length || 0}`);
        for (const msg of (m.messages || [])) {
            console.log(`[WA RAW] Message entry: id=${msg.key?.id}, remoteJid=${msg.key?.remoteJid}, fromMe=${msg.key?.fromMe}, participant=${msg.key?.participant || 'none'}, timestamp=${msg.messageTimestamp}, messageKeys=${JSON.stringify(Object.keys(msg.message || {}))}`);
            await handleBaileysMessage(msg);
        }
    });

    sock.ev.on('messaging-history.set', async ({ messages }: any) => {
        if (messages && Array.isArray(messages)) {
            console.log(`[WA DEBUG] messaging-history.set received ${messages.length} messages.`);
            for (const msg of messages) {
                await handleBaileysMessage(msg);
            }
        }
    });
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
