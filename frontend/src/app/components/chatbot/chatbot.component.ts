import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
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

  isOpen = false;
  isMinimized = false;
  input = '';
  loading = false;
  messages: Message[] = [];
  unreadCount = 0;
  hasGreeted = false;

  private api = environment.apiUrl;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    setTimeout(() => {
      if (!this.hasGreeted) this.addWelcomeMessage();
    }, 2000);
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  addWelcomeMessage() {
    this.hasGreeted = true;
    this.messages.push({
      role: 'ai',
      text: `Assalam-o-Alaikum! 👋 Main **RentBot** hoon — RentAnything PK ka AI assistant!\n\nMain aapki help kar sakta hoon:\n• 🏠 Items rent karna ya list karna\n• 🪪 CNIC verification\n• 🔐 Login / Registration issues\n• 💬 Koi bhi sawal!\n\nAap kya jaanna chahte hain?`,
      time: new Date()
    });
  }

  toggleChat() {
    this.isOpen = !this.isOpen;
    this.isMinimized = false;
    if (this.isOpen) {
      this.unreadCount = 0;
      if (!this.hasGreeted) this.addWelcomeMessage();
      setTimeout(() => this.scrollToBottom(), 100);
    }
  }

  minimizeChat() { this.isMinimized = !this.isMinimized; }
  closeChat() { this.isOpen = false; this.isMinimized = false; }

  async sendMessage() {
    const text = this.input.trim();
    if (!text || this.loading) return;

    this.input = '';
    this.messages.push({ role: 'user', text, time: new Date() });

    const loadingMsg: Message = { role: 'ai', text: '', time: new Date(), loading: true };
    this.messages.push(loadingMsg);
    this.loading = true;

    // Build message history for context
    const history = this.messages
      .filter(m => !m.loading && m.text)
      .slice(-8)
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));

    this.http.post<any>(`${this.api}/chat`, { messages: history }).subscribe({
      next: (res) => {
        this.loading = false;
        const idx = this.messages.indexOf(loadingMsg);
        if (idx !== -1) {
          this.messages[idx] = { role: 'ai', text: res.reply, time: new Date(), loading: false };
        }
        if (!this.isOpen) this.unreadCount++;
      },
      error: (err) => {
        this.loading = false;
        const idx = this.messages.indexOf(loadingMsg);
        let errMsg = 'Koi masla aa gaya. Thodi der baad try karein. 🙏';

        if (err.status === 429) {
          errMsg = '⏳ Bahut zyada requests — 1 minute baad try karein.';
        } else if (err.status === 503) {
          errMsg = '🔄 AI service thodi der ke liye unavailable hai. 30 second baad try karein.';
        } else if (err.status === 400) {
          errMsg = '⚠️ GEMINI_API_KEY backend .env mein set karein.';
        }

        if (idx !== -1) {
          this.messages[idx] = { role: 'ai', text: errMsg, time: new Date(), loading: false };
        }
        if (!this.isOpen) this.unreadCount++;
      }
    });
  }

  onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  scrollToBottom() {
    try {
      if (this.msgContainer) {
        this.msgContainer.nativeElement.scrollTop = this.msgContainer.nativeElement.scrollHeight;
      }
    } catch {}
  }

  quickReplies = [
    'Register kaise karein?',
    'CNIC verify kaise hogi?',
    'Item kaise list karein?',
    'Password bhool gaya',
  ];

  quickReply(text: string) {
    this.input = text;
    this.sendMessage();
  }

  formatText(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }
}
