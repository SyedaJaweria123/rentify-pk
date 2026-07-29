import { Component, OnInit, signal, effect, ViewChild, ElementRef, AfterViewChecked, HostListener } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ChatService } from './chat.service';
import { AuthStateService } from '../../core/services/auth-state.service';
import { SocketService } from '../../core/services/socket.service';
import { PRICE_UNIT_LABELS } from '../../models/listing.model';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, MatSnackBarModule],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css'],
})
export class ChatComponent implements OnInit, AfterViewChecked {
  @ViewChild('messageContainer') messageContainer!: ElementRef;

  conversations        = signal<any[]>([]);
  messages             = signal<any[]>([]);
  activeConversationId = signal<string | null>(null);
  // Metadata (otherParticipant, listing, etc.) for whichever conversation is
  // currently open, sourced directly from loadMessages()'s response. This
  // exists separately from `conversations` because a brand-new conversation
  // with zero messages is intentionally excluded from getConversations()'s
  // list (WhatsApp-style: empty chats don't show in the inbox) — so the
  // header can't always rely on finding it there.
  activeConversationData = signal<any | null>(null);
  loadingConvs         = signal(false);
  loadingMessages       = signal(false);
  sending              = signal(false);
  newMessage           = '';
  isMobile             = signal(window.innerWidth < 768);
  moreMenuOpen         = signal(false);

  // ── Voice message recording state ────────────────────────────────────────
  isRecording      = signal(false);
  recordSeconds    = signal(0);
  uploadingVoice   = signal(false);
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordTimer: any = null;
  private recordStream: MediaStream | null = null;

  private shouldScroll = false;

  constructor(
    private chatSvc  : ChatService,
    public  authState: AuthStateService,
    private snack    : MatSnackBar,
    private route    : ActivatedRoute,
    private router   : Router,
    public  socketSvc: SocketService,
  ) {
    // Real-time sync: when the OTHER participant deletes a message "for
    // everyone", reflect that on this screen immediately too.
    effect(() => {
      const d = this.socketSvc.lastDeletedMessage();
      if (!d?.messageId) return;
      this.messages.update(list =>
        list.map(m => m._id === d.messageId
          ? { ...m, isDeleted: true, content: null, imageUrl: null, videoUrl: null, videoThumbUrl: null, audioUrl: null, locationLat: null, locationLng: null }
          : m
        )
      );
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (!t.closest('.chat-more-wrap')) this.moreMenuOpen.set(false);
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.isMobile.set(window.innerWidth < 768);
  }

  ngOnInit(): void {
    this.loadConversations();

    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.activeConversationId.set(id);
        this.messages.set([]);
        this.loadMessages(id);
      }
    });

    this.route.queryParamMap.subscribe(qp => {
      const userId    = qp.get('userId');
      const listingId = qp.get('listingId') || undefined;
      if (userId) {
        this.chatSvc.startConversation(userId, listingId).subscribe({
          next: (res) => {
            const convId = res.data?.conversationId;
            if (!convId) return;
            this.activeConversationId.set(convId);
            this.messages.set([]);
            this.loadMessages(convId); // populates activeConversationData itself
            this.loadConversations();  // best-effort sidebar refresh, non-blocking
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
    return this.activeConversationData()
      || this.conversations().find(c => c._id === this.activeConversationId());
  }

  /** The sidebar's actual render list — `conversations()` plus the active
   *  conversation prepended if it's not already in there (e.g. a brand-new
   *  thread with no messages yet, which getConversations() deliberately
   *  excludes). Keeps the sidebar from looking empty/broken the moment a
   *  renter starts a new chat from a listing's "Message Owner" button. */
  sidebarList() {
    const list = this.conversations();
    const activeId = this.activeConversationId();
    const activeData = this.activeConversationData();
    if (activeId && activeData && !list.some(c => c._id === activeId)) {
      return [{ ...activeData, lastMessage: null, lastMessageAt: null }, ...list];
    }
    return list;
  }

  isMyMessage(msg: any): boolean {
    if (!msg) return false;
    const senderId = msg.sender?._id || msg.sender;
    const myId = this.myUserId();
    return !!myId && String(senderId) === String(myId);
  }

  // ── Right-click context menu (Reply / Copy / Delete) ─────────────────────
  ctxMenu = signal<{ show: boolean; x: number; y: number; msg: any | null }>(
    { show: false, x: 0, y: 0, msg: null });

  // The message currently being replied to (shows as a preview above the input).
  replyingTo = signal<any | null>(null);

  onMsgRightClick(event: MouseEvent, msg: any): void {
    event.preventDefault();
    if (msg.isDeleted) return;
    // Clamp to the viewport — a right-aligned "own" message near the screen
    // edge would otherwise position the menu partly (or fully) off-screen,
    // which is especially common on narrow phones.
    const menuWidth = 190;
    const menuHeight = 180;
    const x = Math.min(event.clientX, window.innerWidth - menuWidth - 8);
    const y = Math.min(event.clientY, window.innerHeight - menuHeight - 8);
    this.ctxMenu.set({ show: true, x: Math.max(8, x), y: Math.max(8, y), msg });
  }

  closeCtxMenu(): void {
    this.ctxMenu.set({ show: false, x: 0, y: 0, msg: null });
  }

  /** Plain text a message can be copied/quoted as, for any message type. */
  msgPreviewText(msg: any): string {
    if (msg.isDeleted) return '🚫 This message was deleted';
    if (msg.type === 'audio')    return '🎤 Voice message';
    if (msg.type === 'video')    return '🎥 Video';
    if (msg.type === 'image')    return '📷 Photo';
    if (msg.type === 'location') return '📍 Location';
    return msg.content || '';
  }

  /** Used by the template to render the quoted-message preview line. */
  replyPreviewText(replyToMsg: any): string {
    if (!replyToMsg) return '';
    return this.msgPreviewText(replyToMsg);
  }

  startReply(): void {
    const msg = this.ctxMenu().msg;
    this.closeCtxMenu();
    if (msg) this.replyingTo.set(msg);
  }

  cancelReply(): void {
    this.replyingTo.set(null);
  }

  copyMsgText(): void {
    const msg = this.ctxMenu().msg;
    this.closeCtxMenu();
    if (!msg) return;
    const text = this.msgPreviewText(msg);
    navigator.clipboard?.writeText(text).then(
      () => this.snack.open('Copy ho gaya', undefined, { duration: 1500 }),
      () => this.snack.open('Copy nahi ho saka', 'OK', { duration: 2000 }),
    );
  }

  deleteForMe(): void {
    const msg = this.ctxMenu().msg;
    this.closeCtxMenu();
    if (!msg?._id) return;

    this.chatSvc.deleteMessage(msg._id, 'me').subscribe({
      next: () => {
        // Hidden only on THIS device — simplest is to drop it from the
        // local list; the backend already excludes it from future loads.
        this.messages.update(list => list.filter(m => m._id !== msg._id));
      },
      error: () => this.snack.open('Message delete nahi ho saka', 'OK', { duration: 3000 }),
    });
  }

  deleteForEveryone(): void {
    const msg = this.ctxMenu().msg;
    this.closeCtxMenu();
    if (!msg?._id) return;

    this.chatSvc.deleteMessage(msg._id, 'everyone').subscribe({
      next: () => {
        this.messages.update(list =>
          list.map(m => m._id === msg._id ? { ...m, isDeleted: true, content: null, imageUrl: null, videoUrl: null, videoThumbUrl: null, audioUrl: null, locationLat: null, locationLng: null } : m));
      },
      error: (err) => {
        const msg2 = err?.error?.message || 'Message delete nahi ho saka';
        this.snack.open(msg2, 'OK', { duration: 3000 });
      },
    });
  }

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
    this.activeConversationData.set(conv);
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
        // The header's data comes straight from this response now — works
        // even for a brand-new, message-less conversation that
        // getConversations() deliberately excludes from the sidebar list.
        if (res.data.conversation) {
          this.activeConversationData.set(res.data.conversation);
        }
        // Best-effort: once this conversation has at least one message, it
        // becomes eligible to appear in the sidebar — refresh so it shows up
        // there too, without blocking or hiding anything while we wait.
        if (!this.conversations().some(c => c._id === conversationId)) {
          this.loadConversations();
        }
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
    const replyTo = this.replyingTo()?._id;

    this.chatSvc.send({ content, conversationId: convId, replyTo }).subscribe({
      next: (res) => {
        this.messages.update(msgs => [...msgs, res.data.message]);
        this.newMessage = '';
        this.replyingTo.set(null);
        this.sending.set(false);
        this.shouldScroll = true;

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

  // ── Voice Messages (record + send, WhatsApp-style) ──────────────────────
  async startRecording(): Promise<void> {
    if (this.isRecording() || !this.activeConversationId()) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.recordStream = stream;
      this.recordedChunks = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');

      this.mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.recordedChunks.push(e.data);
      };

      this.mediaRecorder.start();
      this.isRecording.set(true);
      this.recordSeconds.set(0);
      this.recordTimer = setInterval(() => this.recordSeconds.update(s => s + 1), 1000);

    } catch (err) {
      this.snack.open('Microphone access denied ya unavailable hai', 'OK', { duration: 3000 });
    }
  }

  cancelRecording(): void {
    this.stopRecordingInternal();
    this.recordedChunks = [];
  }

  stopAndSendRecording(): void {
    if (!this.isRecording() || !this.mediaRecorder) return;

    const duration = this.recordSeconds();
    const mimeType = this.mediaRecorder.mimeType || 'audio/webm';

    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.recordedChunks, { type: mimeType });
      this.recordedChunks = [];
      if (blob.size > 0 && duration >= 1) {
        this.uploadVoiceMessage(blob, duration);
      }
    };

    this.stopRecordingInternal();
  }

  private stopRecordingInternal(): void {
    try { this.mediaRecorder?.stop(); } catch {}
    this.recordStream?.getTracks().forEach(t => t.stop());
    this.recordStream = null;
    if (this.recordTimer) { clearInterval(this.recordTimer); this.recordTimer = null; }
    this.isRecording.set(false);
    this.recordSeconds.set(0);
  }

  private uploadVoiceMessage(blob: Blob, duration: number): void {
    const convId = this.activeConversationId();
    if (!convId) return;

    this.uploadingVoice.set(true);
    this.chatSvc.uploadVoiceNote(blob, duration).subscribe({
      next: (up: any) => {
        const audioUrl      = up?.data?.url;
        const audioPublicId = up?.data?.publicId;
        const audioDuration = up?.data?.duration ?? duration;

        this.chatSvc.send({ conversationId: convId, audioUrl, audioPublicId, audioDuration }).subscribe({
          next: (res) => {
            this.messages.update(msgs => [...msgs, res.data.message]);
            this.uploadingVoice.set(false);
            this.shouldScroll = true;
          },
          error: () => {
            this.snack.open('Voice message bhej nahi saka', 'OK', { duration: 3000 });
            this.uploadingVoice.set(false);
          },
        });
      },
      error: () => {
        this.snack.open('Voice message upload fail ho gaya', 'OK', { duration: 3000 });
        this.uploadingVoice.set(false);
      },
    });
  }

  formatRecordTime(totalSeconds: number): string {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ── Attachment Menu (image / video / location) ───────────────────────────
  showAttachMenu = signal(false);

  toggleAttachMenu(): void {
    this.showAttachMenu.update(v => !v);
  }

  closeAttachMenu(): void {
    this.showAttachMenu.set(false);
  }

  // ── Image Sharing ─────────────────────────────────────────────────────────
  uploadingImage = signal(false);

  triggerImagePicker(fileInput: HTMLInputElement): void {
    this.closeAttachMenu();
    fileInput.click();
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    input.value = '';   // reset so the same file can be picked again later
    if (!file) return;

    const convId = this.activeConversationId();
    if (!convId) return;

    if (file.size > 5 * 1024 * 1024) {
      this.snack.open('Image 5MB se zyada nahi honi chahiye', 'OK', { duration: 3000 });
      return;
    }

    this.uploadingImage.set(true);
    this.chatSvc.uploadChatImage(file).subscribe({
      next: (up: any) => {
        const imageUrl      = up?.data?.url;
        const imagePublicId = up?.data?.publicId;

        this.chatSvc.send({ conversationId: convId, imageUrl, imagePublicId }).subscribe({
          next: (res) => {
            this.messages.update(msgs => [...msgs, res.data.message]);
            this.uploadingImage.set(false);
            this.shouldScroll = true;
          },
          error: () => {
            this.snack.open('Image bhej nahi saka', 'OK', { duration: 3000 });
            this.uploadingImage.set(false);
          },
        });
      },
      error: () => {
        this.snack.open('Image upload fail ho gaya', 'OK', { duration: 3000 });
        this.uploadingImage.set(false);
      },
    });
  }

  // ── Video Sharing ─────────────────────────────────────────────────────────
  uploadingVideo = signal(false);

  triggerVideoPicker(fileInput: HTMLInputElement): void {
    this.closeAttachMenu();
    fileInput.click();
  }

  onVideoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    input.value = '';
    if (!file) return;

    const convId = this.activeConversationId();
    if (!convId) return;

    if (file.size > 50 * 1024 * 1024) {
      this.snack.open('Video 50MB se zyada nahi honi chahiye', 'OK', { duration: 3000 });
      return;
    }

    this.uploadingVideo.set(true);
    this.chatSvc.uploadChatVideo(file).subscribe({
      next: (up: any) => {
        const videoUrl      = up?.data?.url;
        const videoPublicId = up?.data?.publicId;
        const videoThumbUrl = up?.data?.thumbUrl;
        const videoDuration = up?.data?.duration;

        this.chatSvc.send({ conversationId: convId, videoUrl, videoPublicId, videoThumbUrl, videoDuration }).subscribe({
          next: (res) => {
            this.messages.update(msgs => [...msgs, res.data.message]);
            this.uploadingVideo.set(false);
            this.shouldScroll = true;
          },
          error: () => {
            this.snack.open('Video bhej nahi saka', 'OK', { duration: 3000 });
            this.uploadingVideo.set(false);
          },
        });
      },
      error: () => {
        this.snack.open('Video upload fail ho gaya', 'OK', { duration: 3000 });
        this.uploadingVideo.set(false);
      },
    });
  }

  // ── Location Sharing ─────────────────────────────────────────────────────
  sendingLocation = signal(false);

  shareLocation(): void {
    this.closeAttachMenu();
    const convId = this.activeConversationId();
    if (!convId) return;

    if (!navigator.geolocation) {
      this.snack.open('Location is browser mein available nahi hai', 'OK', { duration: 3000 });
      return;
    }

    // Geolocation requires a secure context (HTTPS) — except on
    // localhost/127.0.0.1, which browsers always treat as secure.
    const isSecure = window.isSecureContext ||
      ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (!isSecure) {
      this.snack.open('Location ke liye HTTPS chahiye (localhost ke siwa)', 'OK', { duration: 4000 });
      return;
    }

    this.sendingLocation.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const locationLat = pos.coords.latitude;
        const locationLng = pos.coords.longitude;

        this.chatSvc.send({ conversationId: convId, locationLat, locationLng }).subscribe({
          next: (res) => {
            this.messages.update(msgs => [...msgs, res.data.message]);
            this.sendingLocation.set(false);
            this.shouldScroll = true;
          },
          error: () => {
            this.snack.open('Location bhej nahi saka', 'OK', { duration: 3000 });
            this.sendingLocation.set(false);
          },
        });
      },
      (err: GeolocationPositionError) => {
        console.error('[geolocation] error code:', err.code, err.message);
        let msg = 'Location unavailable hai';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Location permission denied — browser settings mein site ko location access dein';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'Location currently unavailable hai — GPS/WiFi on karein';
        } else if (err.code === err.TIMEOUT) {
          msg = 'Location lene mein zyada waqt lag gaya — dobara try karein';
        }
        this.snack.open(msg, 'OK', { duration: 4000 });
        this.sendingLocation.set(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  openLocationInMaps(msg: any): void {
    if (msg.locationLat == null || msg.locationLng == null) return;
    const url = `https://www.google.com/maps?q=${msg.locationLat},${msg.locationLng}`;
    window.open(url, '_blank');
  }

  // ── Image Lightbox (in-page preview, like WhatsApp) ──────────────────────
  lightboxUrl = signal<string | null>(null);

  openLightbox(url: string): void {
    if (url) this.lightboxUrl.set(url);
  }

  closeLightbox(): void {
    this.lightboxUrl.set(null);
  }

  // ── Video / Voice Call (ZegoCloud) ──────────────────────────────────────
  // NOTE: the call UI itself (incoming popup / active call screen) is
  // rendered globally by main-layout.component — NOT here — to avoid two
  // modal instances both calling joinRoom() for the same call.
  startVideoCall(): void { this.startCall('video'); }
  startVoiceCall(): void { this.startCall('voice'); }

  /** Jump back to the listing this conversation is about — the single
   *  "return to context" link, instead of duplicating a separate inline
   *  chat experience on the listing page itself. */
  goToListing(listing: any): void {
    const id = listing?._id || listing?.id;
    if (id) this.router.navigate(['/listings', id]);
  }

  getPriceUnitLabel(unit: string): string {
    return PRICE_UNIT_LABELS[unit as keyof typeof PRICE_UNIT_LABELS] || '';
  }

  private startCall(callType: 'video' | 'voice'): void {
    const conv = this.activeConv();
    if (!conv) return;

    const roomId      = 'rentify-' + conv._id;
    const otherUserId = conv.otherParticipant?._id || conv.otherParticipant?.id;
    const myName      = this.myUserName();

    this.socketSvc.callState.set({
      active    : true,
      incoming  : false,
      roomId,
      callerName: myName,
      callType,
    });

    // Persist the call attempt to MongoDB first, then invite — including
    // the resulting callLogId so the receiver's accept/decline updates
    // the SAME record (rather than each side creating its own row).
    this.socketSvc.startCallLog(otherUserId, roomId, callType, conv._id).subscribe({
      next: (res: any) => {
        const callLogId = res?.data?.callLogId || null;
        this.socketSvc.callState.update(s => s ? { ...s, callLogId } : s);
        this.socketSvc.emitVideoCallInvite({ toUserId: otherUserId, roomId, callerName: myName, callType, callLogId });
      },
      error: () => {
        // Even if logging fails, don't block the call itself.
        this.socketSvc.emitVideoCallInvite({ toUserId: otherUserId, roomId, callerName: myName, callType });
      },
    });
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
