import { Injectable }      from '@angular/core';
import { SocketService }   from '../core/services/socket.service';

// Re-export CallState for components that need it
export type { CallState } from '../core/services/socket.service';

@Injectable({ providedIn: 'root' })
export class VideoCallService {
  // Delegate everything to SocketService — callState lives there
  get callState() { return this.socket.callState; }

  constructor(private socket: SocketService) {}

  getOrCreateRoom(roomName: string, http: any, apiUrl: string) {
    return this.socket.getOrCreateRoom(roomName, http, apiUrl);
  }

  acceptCall(): void  { this.socket.acceptCall(); }
  endCall():    void  { this.socket.endCall(); }

  setIncomingCall(roomUrl: string, callerName: string): void {
    this.socket.callState.set({ active: false, incoming: true, roomUrl, callerName });
  }
}
