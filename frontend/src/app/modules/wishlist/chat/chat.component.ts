import { Component, OnInit, OnDestroy, signal, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ChatService } from './chat.service';
import { AuthStateService }      from '../../core/services/auth-state.service';
import { SocketService }           from '../../core/services/socket.service';
import { VideoCallModalComponent } from '../../shared/components/video-call-modal/video-call-modal.component';
import { MatTooltipModule }        from '@angular/material/tooltip';
import { HttpClient }              from '@angular/common/http';
import { environment }             from '../../../environments/environment';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    CommonModule, DatePipe, FormsModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule,
    MatFormFieldModule, MatInputModule, MatTooltipModule,
    VideoCallModalComponent,
  ],
  templateUrl: './chat.component.html',
})
export class ChatComponent implements OnInit, AfterViewChecked {
  @ViewChild('messageContainer') messageContainer!: ElementRef;

  conversations       = signal<any[]>([]);
  messages            = signal<any[]>([]);
  activeConversationId = signal<string | null>(null);
  loadingConvs        = signal(false);
  loadingMessages     = signal(false);
  sending             = signal(false);
  newMessage          = '';
  isMobile            = window.innerWidth < 768;

  private shouldScroll = false;

  constructor(
    private chatSvc  : ChatService,
    public  authState: AuthStateService,
    private snack    : MatSnackBar,
    private route    : ActivatedRoute,
    public  socketSvc: SocketService,
    private http     : HttpClient,
  ) {}

  ngOnInit(): void {
    this.loadConversations();

    // Support direct navigation with conversationId
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.activeConversationId.set(id);
        this.messages.set([]);
        this.loadMessages(id);
      }
    });

    // Support deep-link from booking/listing pages:
    //   /messages?userId=XXX&listingId=YYY
    // → start (or fetch existing) conversation, then auto-open it.
    this.route.queryParamMap.subscribe(qp => {
      const userId    = qp.get('userId');
      const listingId = qp.get('listingId') || undefined;
      if (userId) {
        this.chatSvc.startConversation(userId, listingId).subscribe({
          next: (res) => {
            const convId = res.data?.conversationId;
            if (!convId) return;
            // Refresh list so the (possibly new) conversation appears, then open it
            this.chatSvc.getConversations().subscribe({
              next: (cr) => {
                this.conversations.set(cr.data.conversations);
                this.activeConversationId.set(convId);
                this.messages.set([]);
                this.loadMessages(convId);
              },
            });
          },
          error: () => this.snack.open('Could not open conversation', 'OK', { duration: 3000 }),
        });
      }
    });
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  activeConv() {
    return this.conversations().find(c => c._id === this.activeConversationId());
  }

  isMyMessage(msg: any): boolean {
    const senderId = msg.sender?._id || msg.sender;
    const myId = this.myUserId();
    return !!myId && String(senderId) === String(myId);
  }

  // ── Right-click delete menu ────────────────────────────────────────────────
  ctxMenu = signal<{ show: boolean; x: number; y: number; msg: any | null }>(
    { show: false, x: 0, y: 0, msg: null });

  onMsgRightClick(event: MouseEvent, msg: any): void {
    event.preventDefault();
    // Only allow deleting your OWN, not-already-deleted messages
    if (!this.isMyMessage(msg) || msg.isDeleted) return;
    this.ctxMenu.set({ show: true, x: event.clientX, y: event.clientY, msg });
  }

  closeCtxMenu(): void {
    this.ctxMenu.set({ show: false, x: 0, y: 0, msg: null });
  }

  deleteSelectedMsg(): void {
    const msg = this.ctxMenu().msg;
    this.closeCtxMenu();
    if (!msg?._id) return;
    this.chatSvc.deleteMessage(msg._id).subscribe({
      next: () => {
        // Mark as deleted locally (so bubble shows "Message deleted")
        this.messages.update(list =>
          list.map(m => m._id === msg._id ? { ...m, isDeleted: true, content: null } : m));
      },
      error: () => this.snack.open('Could not delete message', 'OK', { duration: 3000 }),
    });
  }

  // Resolve the logged-in user's ID, falling back to localStorage('ra_user')
  // since AuthService stores the user there (AuthStateService may be empty).
  private myUserId(): string | null {
    const fromState: any = this.authState.currentUser();
    if (fromState?.id || fromState?._id) return fromState.id || fromState._id;
    try {
      const raw = localStorage.getItem('ra_user');
      if (raw) {
        const u = JSON.parse(raw);
        return u?.id || u?._id || null;
      }
    } catch { /* ignore */ }
    return null;
  }

  loadConversations(): void {
    this.loadingConvs.set(true);
    this.chatSvc.getConversations().subscribe({
      next: (res) => {
        this.conversations.set(res.data.conversations);
        this.loadingConvs.set(false);
      },
      error: () => this.loadingConvs.set(false),
    });
  }

  openConversation(conv: any): void {
    this.activeConversationId.set(conv._id);
    this.messages.set([]);
    this.loadMessages(conv._id);
  }

  loadMessages(conversationId: string): void {
    this.loadingMessages.set(true);
    this.chatSvc.getMessages(conversationId).subscribe({
      next: (res) => {
        this.messages.set(res.data.messages);
        this.loadingMessages.set(false);
        this.shouldScroll = true;
      },
      error: () => this.loadingMessages.set(false),
    });
  }

  onEnterKey(event: Event): void {
    if (!(event as KeyboardEvent).shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  send(event?: Event): void {
    if (event) event.preventDefault();
    const content = this.newMessage.trim();
    if (!content || this.sending() || !this.activeConversationId()) return;

    this.sending.set(true);
    const convId = this.activeConversationId()!;

    this.chatSvc.send({ content, conversationId: convId }).subscribe({
      next: (res) => {
        this.messages.update(msgs => [...msgs, res.data.message]);
        this.newMessage = '';
        this.sending.set(false);
        this.shouldScroll = true;

        // Update conversation preview
        this.conversations.update(convs =>
          convs.map(c => c._id === convId
            ? { ...c, lastMessage: content, lastMessageAt: new Date() }
            : c
          )
        );
      },
      error: (err) => {
        this.snack.open(err.error?.message || 'Failed to send', 'Close', { duration: 3000 });
        this.sending.set(false);
      },
    });
  }

  startVideoCall(): void {
    const conv = this.activeConv();
    if (!conv || this.callingInProgress()) return;

    const roomName    = 'rentify-chat-' + conv._id;
    const otherUserId = conv.otherParticipant?._id || conv.otherParticipant?.id;
    const myName      = this.myUserName();

    this.callingInProgress.set(true);

    this.http.post<any>(environment.apiUrl + '/video/room', { roomName }).subscribe({
      next: (res) => {
        this.socketSvc.callState.set({
          active    : true,
          incoming  : false,
          roomUrl   : res.roomUrl,
          callerName: myName,
        });
        this.socketSvc.emitVideoCallInvite({
          toUserId  : otherUserId,
          roomUrl   : res.roomUrl,
          roomName,
          callerName: myName,
        });
        this.callingInProgress.set(false);
      },
      error: () => {
        this.snack.open('Video call shuru nahi ho saka', 'OK', { duration: 3000 });
        this.callingInProgress.set(false);
      },
    });
  }

  acceptCall(): void { this.socketSvc.acceptCall(); }
  endCall():    void { this.socketSvc.endCall(); }

  declineCall(): void {
    const otherUserId = this.activeConv()?.otherParticipant?._id;
    if (otherUserId) this.socketSvc.emitVideoCallDeclined(otherUserId);
    this.socketSvc.endCall();
  }

  private myUserName(): string {
    const u: any = this.authState.currentUser();
    if (u?.name) return u.name;
    try {
      const raw = localStorage.getItem('ra_user');
      if (raw) { const p = JSON.parse(raw); return p?.name || 'User'; }
    } catch {}
    return 'User';
  }

  private scrollToBottom(): void {
    try {
      const el = this.messageContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch {}
  }
}
