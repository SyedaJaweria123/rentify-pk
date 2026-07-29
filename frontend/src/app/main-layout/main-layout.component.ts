import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd, NavigationStart } from '@angular/router';
import { filter } from 'rxjs';
import { NavbarComponent } from '../shared/components/navbar.component';
import { FooterComponent }  from '../shared/components/footer/footer.component';
import { ChatbotComponent } from '../components/chatbot/chatbot.component';
import { VideoCallModalComponent } from '../shared/components/video-call-modal/video-call-modal.component';
import { CartDrawerComponent } from '../modules/cart/cart-drawer.component';
import { SocketService } from '../core/services/socket.service';
import { ChatService } from '../modules/chat/chat.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    CommonModule, RouterModule, NavbarComponent, FooterComponent,
    ChatbotComponent, VideoCallModalComponent, CartDrawerComponent,
  ],
  templateUrl: './main-layout.component.html',
  styleUrls:   ['./main-layout.component.css'],
})
export class MainLayoutComponent implements OnInit {
  loading       = false;

  /**
   * Pages that render inside a sidebar shell (renter/rider dashboards and their
   * sub-pages) provide their own full-height layout, so the global footer would
   * look out of place there — hide it on those routes.
   */
  get hideFooter(): boolean {
    const url = (this.router.url || '').split('?')[0];
    const noFooter = ['/dashboard', '/bookings', '/track', '/notifications', '/wallet'];
    return noFooter.some(p => url === p || url.startsWith(p + '/'));
  }

  constructor(
    private router    : Router,
    public  socketSvc : SocketService,
    private cdr        : ChangeDetectorRef,
    private chatSvc     : ChatService,
  ) {}

  ngOnInit(): void {
    this.socketSvc.connect();

    this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this.loading = true;
        this.cdr.detectChanges();
      }
      if (event instanceof NavigationEnd) {
        this.loading = false;
        this.cdr.detectChanges();
      }
    });

    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  // ── Global video/voice call controls ─────────────────────────────────────
  // Each handler does two things: (1) persists the outcome to the CallLog
  // collection in MongoDB via SocketService, (2) drops a friendly text
  // line into the chat thread (when the call came from a conversation),
  // exactly like WhatsApp's "Video call ended" message.

  acceptIncomingCall(): void {
    this.socketSvc.acceptCall();   // also PATCHes /call/:id/accept internally
  }

  declineIncomingCall(): void {
    const s = this.socketSvc.callState();
    const callType       = s?.callType || 'video';
    const callLogId       = s?.callLogId;
    const conversationId = this.extractConversationId(s?.roomId || '');

    this.socketSvc.endCall();

    if (callLogId) {
      this.socketSvc.patchCallLog(callLogId, 'decline', 'declined').subscribe({ error: () => {} });
    }
    this.logCallToChat(conversationId, callType, 'declined');
  }

  endActiveCall(): void {
    const s = this.socketSvc.callState();
    const callType       = s?.callType || 'video';
    const callLogId       = s?.callLogId;
    const conversationId = this.extractConversationId(s?.roomId || '');

    this.socketSvc.endCall();

    if (callLogId) {
      this.socketSvc.patchCallLog(callLogId, 'end').subscribe({ error: () => {} });
    }
    this.logCallToChat(conversationId, callType, 'ended');
  }

  /**
   * roomId is built as 'rentify-<conversationId>' (chat) or
   * 'rentify-delivery-<assignmentId>' (rider) — only chat-originated calls
   * have a conversationId to drop a message into.
   */
  private extractConversationId(roomId: string): string | undefined {
    const prefix = 'rentify-';
    if (roomId?.startsWith(prefix) && !roomId.includes('delivery-')) {
      return roomId.slice(prefix.length);
    }
    return undefined;
  }

  private logCallToChat(conversationId: string | undefined, callType: 'video' | 'voice', outcome: 'ended' | 'declined'): void {
    if (!conversationId) return;

    const label = callType === 'voice' ? 'Voice call' : 'Video call';
    const text  = outcome === 'declined' ? `📵 ${label} declined` : `📞 ${label} ended`;

    this.chatSvc.send({ content: text, conversationId }).subscribe({
      // Best-effort — if it fails, the call still worked and is still
      // recorded in CallLog; we just won't have a chat-bubble record too.
      error: () => {},
    });
  }
}
