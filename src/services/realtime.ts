import type { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { allowSharedGlobalOwner } from './owner.ts';
import { verifyJwtToken } from './jwt.ts';

let io: SocketIOServer | null = null;

export function initRealtime(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PATCH', 'DELETE']
    }
  });

  io.use((socket, next) => {
    const headerToken = typeof socket.handshake.headers.authorization === 'string'
      && socket.handshake.headers.authorization.startsWith('Bearer ')
      ? socket.handshake.headers.authorization.substring(7)
      : '';
    const token = (typeof socket.handshake.auth?.token === 'string' && socket.handshake.auth.token) || headerToken;
    if (!token) {
      return next(new Error('Se requiere iniciar sesión.'));
    }
    try {
      const decoded = verifyJwtToken(token);
      socket.data.uid = decoded.uid;
      next();
    } catch {
      next(new Error('La sesión no es válida o ha vencido.'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.uid}`);
    if (allowSharedGlobalOwner()) {
      socket.join('dev-broadcast');
    }
    socket.on('disconnect', () => {});
  });

  return io;
}

export function notifyClients(event: string, data: any = {}, ownerId?: string) {
  if (!io) return;
  if (ownerId && ownerId !== 'GLOBAL') {
    io.to(`user:${ownerId}`).emit(event, data);
    if (allowSharedGlobalOwner()) {
      io.to('dev-broadcast').emit(event, data);
    }
    return;
  }
  if (allowSharedGlobalOwner()) {
    io.to('dev-broadcast').emit(event, data);
  }
}
