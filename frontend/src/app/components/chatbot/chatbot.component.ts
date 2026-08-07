import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface Message {
  role: 'user' | 'ai';
  text: string;
  time: Date;
  loading?: boolean;
}

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.css']
})
export class ChatbotComponent implements OnInit, AfterViewChecked {
  @ViewChild('msgContainer') msgContainer!: ElementRef;

  isOpen      = false;
  isMinimized = false;
  input       = '';
  loading     = false;
  messages: Message[] = [];
  unreadCount = 0;
  hasGreeted  = false;

  // Only scroll when a new message has been added — not on every
  // change-detection cycle. Firing scrollToBottom() every cycle meant it
  // ran while the chat window was still hidden (scrollHeight = 0) and the
  // conversation appeared stuck at the top.
  private shouldScroll = false;

  private api = environment.apiUrl;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    setTimeout(() => {
      if (!this.hasGreeted) this.addWelcomeMessage();
    }, 2000);
  }

  ngAfterViewChecked() {
    if (this.shouldScroll) {
      this.shouldScroll = false;
      this.doScroll();
    }
  }

  private doScroll() {
    try {
      const el = this.msgContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch {}
  }

  private triggerScroll() {
    // Small timeout lets Angular finish rendering the new bubble before we
    // read scrollHeight, so the scroll lands at the true bottom.
    this.shouldScroll = true;
    setTimeout(() => this.doScroll(), 60);
  }

  addWelcomeMessage() {
    this.hasGreeted = true;
    this.messages.push({
      role: 'ai',
      text: `Hello! 👋 I'm **RentBot** — the official AI assistant for **Rentify PK**.\n\nI can help you with:\n• 🔍 How to browse and book items\n• 🏠 How to list your items and earn\n• 🪪 CNIC verification process\n• 💳 Payments, wallet & refunds\n• 🤝 Disputes and damage claims\n• ❓ Any other question!\n\nHow can I help you today?`,
      time: new Date()
    });
    this.triggerScroll();
  }

  toggleChat() {
    this.isOpen = !this.isOpen;
    this.isMinimized = false;
    if (this.isOpen) {
      this.unreadCount = 0;
      if (!this.hasGreeted) this.addWelcomeMessage();
      // Wait for CSS open-transition to finish, then scroll to bottom
      setTimeout(() => this.doScroll(), 150);
    }
  }

  minimizeChat() { this.isMinimized = !this.isMinimized; }
  closeChat()    { this.isOpen = false; this.isMinimized = false; }

  sendMessage() {
    const text = this.input.trim();
    if (!text || this.loading) return;

    this.input = '';
    this.messages.push({ role: 'user', text, time: new Date() });
    this.triggerScroll();

    const loadingMsg: Message = { role: 'ai', text: '', time: new Date(), loading: true };
    this.messages.push(loadingMsg);
    this.loading = true;
    this.triggerScroll();

    const history = this.messages
      .filter(m => !m.loading && m.text)
      .slice(-10)
      .map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));

    this.http.post<any>(`${this.api}/chat`, { messages: history }).subscribe({
      next: (res) => {
        this.loading = false;
        const idx = this.messages.indexOf(loadingMsg);
        if (idx !== -1) {
          this.messages[idx] = { role: 'ai', text: res.reply, time: new Date(), loading: false };
        }
        if (!this.isOpen) this.unreadCount++;
        this.triggerScroll();
      },
      error: (err) => {
        this.loading = false;
        const idx = this.messages.indexOf(loadingMsg);
        let errMsg = 'Something went wrong. Please try again in a moment. 🙏';
        if (err.status === 429) errMsg = '⏳ Too many requests — please wait 1 minute and try again.';
        else if (err.status === 503) errMsg = '🔄 AI service is temporarily unavailable. Please try again shortly.';
        else if (err.status === 400) errMsg = '⚠️ Configuration issue. Please contact support.';
        if (idx !== -1) {
          this.messages[idx] = { role: 'ai', text: errMsg, time: new Date(), loading: false };
        }
        if (!this.isOpen) this.unreadCount++;
        this.triggerScroll();
      }
    });
  }

  onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
  }

  scrollToBottom() { this.doScroll(); }

  quickReplies = [
    'How do I rent an item?',
    'How to list an item for rent?',
    'CNIC verification help',
    'Refund & cancellation policy',
  ];

  quickReply(text: string) { this.input = text; this.sendMessage(); }

  formatText(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }
}
