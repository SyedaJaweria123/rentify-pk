// src/app/core/services/socket.service.ts
import { Injectable, signal } from '@angular/core';
import { io, Socket }          from 'socket.io-client';
import { HttpClient }          from '@angular/common/http';
import { environment }         from '../../../environments/environment';
import { TOKEN_KEY }           from '../../models/auth.model';

export interface RiderLocation {
  riderId   : string;
  lat       : number;
  lng       : number;
  bookingId : string | null;
  status    : string | null;
  ts        : number;
}

export type CallType = 'video' | 'voice';

export interface CallState {
  active     : boolean;
  roomId     : string;
  callerName : string;
  incoming   : boolean;
  callType   : CallType;
  callLogId? : string | null;   // MongoDB CallLog _id for this call, once known
}

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket | null = null;

  // ── Reactive signals ──────────────────────────────────────────────────────
  connected         = signal(false);
  lastMessage       = signal<any | null>(null);
  lastDeletedMessage = signal<any | null>(null);
  lastBooking       = signal<any | null>(null);
  lastReview        = signal<any | null>(null);
  lastSupport       = signal<any | null>(null);
  lastRiderLocation = signal<RiderLocation | null>(null);

  // ── Video/Voice Call State ───────────────────────────────────────────────
  callState = signal<CallState | null>(null);

  constructor(private http: HttpClient) {}

  private get serverUrl(): string {
    return environment.apiUrl.replace(/\/api\/?$/, '');
  }

  connect(): void {
    if (this.socket?.connected) return;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    this.socket = io(this.serverUrl, {
      auth            : { token },
      transports      : ['websocket', 'polling'],
      reconnection    : true,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect',    () => this.connected.set(true));
    this.socket.on('disconnect', () => this.connected.set(false));
    this.socket.on('connect_error', (err: any) => {
      console.warn('[socket] connect error:', err.message);
      this.connected.set(false);
    });

    this.socket.on('message:new',          (d: any) => this.lastMessage.set({ ...d, _ts: Date.now() }));
    this.socket.on('message:deleted',      (d: any) => this.lastDeletedMessage.set({ ...d, _ts: Date.now() }));
    this.socket.on('booking:new',          (d: any) => this.lastBooking.set({ ...d, event: 'booking:new',       _ts: Date.now() }));
    this.socket.on('booking:confirmed',    (d: any) => this.lastBooking.set({ ...d, event: 'booking:confirmed', _ts: Date.now() }));
    this.socket.on('booking:cancelled',    (d: any) => this.lastBooking.set({ ...d, event: 'booking:cancelled', _ts: Date.now() }));
    this.socket.on('review:new',           (d: any) => this.lastReview.set({ ...d, _ts: Date.now() }));
    this.socket.on('support:notification', (d: any) => this.lastSupport.set({ ...d, _ts: Date.now() }));

    this.socket.on('rider:location_update', (data: RiderLocation) => {
      this.lastRiderLocation.set({ ...data });
    });

    // ── Video/Voice Call Events ──────────────────────────────────────────────
    this.socket.on('video:incoming_call', (data: any) => {
      this.callState.set({
        active    : false,
        incoming  : true,
        roomId    : data.roomId,
        callerName: data.callerName,
        callType  : data.callType || 'video',
        callLogId : data.callLogId || null,
      });
    });

    this.socket.on('video:call_declined', () => {
      // Caller side: receiver declined before answering — mark as declined.
      const s = this.callState();
      if (s?.callLogId) {
        this.patchCallLog(s.callLogId, 'decline', 'declined').subscribe();
      }
      this.callState.set(null);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected.set(false);
    this.lastMessage.set(null);
    this.lastDeletedMessage.set(null);
    this.lastBooking.set(null);
    this.lastReview.set(null);
    this.lastSupport.set(null);
    this.lastRiderLocation.set(null);
    this.callState.set(null);
  }

  emitRiderLocation(lat: number, lng: number): void {
    if (!this.socket?.connected) return;
    this.socket.emit('rider:location_update', { lat, lng });
  }

  // ── Video/Voice Call emit/control ────────────────────────────────────────
  emitVideoCallInvite(data: { toUserId: string; roomId: string; callerName: string; callType: CallType; callLogId?: string | null }): void {
    if (!this.socket?.connected) return;
    this.socket.emit('video:call_invite', data);
  }

  emitVideoCallDeclined(toUserId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit('video:call_declined', { toUserId });
  }

  acceptCall(): void {
    const s = this.callState();
    if (!s) return;
    this.callState.set({ ...s, incoming: false, active: true });
    if (s.callLogId) {
      this.patchCallLog(s.callLogId, 'accept').subscribe();
    }
  }

  endCall(): void {
    this.callState.set(null);
  }

  // ── CallLog persistence (MongoDB via /api/video/call/*) ──────────────────
  startCallLog(receiverId: string, roomId: string, callType: CallType, conversationId?: string): import('rxjs').Observable<any> {
    return this.http.post(environment.apiUrl + '/video/call/start', {
      receiverId, roomId, callType, conversationId,
    });
  }

  /** action: 'accept' | 'decline' | 'end' — maps to the matching backend route. */
  patchCallLog(callLogId: string, action: 'accept' | 'decline' | 'end', reason?: string): import('rxjs').Observable<any> {
    return this.http.patch(`${environment.apiUrl}/video/call/${callLogId}/${action}`, reason ? { reason } : {});
  }

  getCallHistory(limit = 30): import('rxjs').Observable<any> {
    return this.http.get(`${environment.apiUrl}/video/call/history`, { params: { limit: String(limit) } as any });
  }
}
