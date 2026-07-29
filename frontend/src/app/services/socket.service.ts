import { Injectable, signal } from '@angular/core';
import { io, Socket }         from 'socket.io-client';
import { environment }        from '../../../environments/environment';
import { TOKEN_KEY }          from '../../models/auth.model';

export interface RiderLocation {
  riderId   : string;
  lat       : number;
  lng       : number;
  bookingId : string | null;
  status    : string | null;
  ts        : number;
}

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket | null = null;

  connected         = signal(false);
  lastMessage       = signal<any | null>(null);
  lastBooking       = signal<any | null>(null);
  lastReview        = signal<any | null>(null);
  lastSupport       = signal<any | null>(null);
  lastRiderLocation = signal<RiderLocation | null>(null);

  private get serverUrl(): string {
    return environment.apiUrl.replace(/\/api\/?$/, '');
  }

  connect(): void {
    if (this.socket?.connected) return;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    this.socket = io(this.serverUrl, {
      auth      : { token },
      transports: ['websocket', 'polling'],
      reconnection       : true,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect',       () => this.connected.set(true));
    this.socket.on('disconnect',    () => this.connected.set(false));
    this.socket.on('connect_error', (err) => {
      console.warn('[socket] connect error:', err.message);
      this.connected.set(false);
    });

    this.socket.on('message:new',          (d) => this.lastMessage.set({ ...d, _ts: Date.now() }));
    this.socket.on('booking:new',          (d) => this.lastBooking.set({ ...d, event: 'booking:new',       _ts: Date.now() }));
    this.socket.on('booking:confirmed',    (d) => this.lastBooking.set({ ...d, event: 'booking:confirmed', _ts: Date.now() }));
    this.socket.on('booking:cancelled',    (d) => this.lastBooking.set({ ...d, event: 'booking:cancelled', _ts: Date.now() }));
    this.socket.on('review:new',           (d) => this.lastReview.set({ ...d, _ts: Date.now() }));
    this.socket.on('support:notification', (d) => this.lastSupport.set({ ...d, _ts: Date.now() }));

    // Live rider location — map component is signal ko watch karta hai
    this.socket.on('rider:location_update', (data: RiderLocation) => {
      this.lastRiderLocation.set({ ...data });
    });
  }

  disconnect(): void {
    if (this.socket) { this.socket.disconnect(); this.socket = null; }
    this.connected.set(false);
    this.lastMessage.set(null);
    this.lastBooking.set(null);
    this.lastReview.set(null);
    this.lastSupport.set(null);
    this.lastRiderLocation.set(null);
  }

  // Rider apni location har 5 sec mein bhejta hai
  emitRiderLocation(lat: number, lng: number): void {
    if (!this.socket?.connected) {
      console.warn('[socket] not connected — location not sent');
      return;
    }
    this.socket.emit('rider:location_update', { lat, lng });
  }
}
