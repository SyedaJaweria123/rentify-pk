import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/services/api.service';

export interface SendMessagePayload {
  content?: string;
  recipientId?: string;
  conversationId?: string;
  bookingId?: string;
  listingId?: string;
  // Voice message fields
  audioUrl?: string;
  audioPublicId?: string;
  audioDuration?: number;
  // Image message fields
  imageUrl?: string;
  imagePublicId?: string;
  // Video message fields
  videoUrl?: string;
  videoPublicId?: string;
  videoThumbUrl?: string;
  videoDuration?: number;
  // Location message fields
  locationLat?: number;
  locationLng?: number;
  locationLabel?: string;
  // Reply (quote a previous message)
  replyTo?: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  constructor(private api: ApiService) {}

  getConversations(): Observable<any> {
    return this.api.get('/messages/conversations');
  }

  /**
   * Start or get an existing conversation with a user about a listing.
   * No duplicates for the same renter+owner+listing combo.
   */
  startConversation(recipientId: string, listingId?: string): Observable<any> {
    return this.api.post('/messages/conversation/start', { recipientId, listingId });
  }

  getMessages(conversationId: string, page = 1, limit = 30): Observable<any> {
    return this.api.get(`/messages/conversations/${conversationId}`, { page, limit });
  }

  send(payload: SendMessagePayload): Observable<any> {
    return this.api.post('/messages/send', payload);
  }

  /**
   * mode: 'me' (default) hides the message on this device only.
   * mode: 'everyone' performs a true delete — only allowed for messages
   * you sent yourself; the backend enforces this and returns 403 otherwise.
   */
  deleteMessage(messageId: string, mode: 'me' | 'everyone' = 'me'): Observable<any> {
    return this.api.delete(`/messages/${messageId}`, { mode });
  }

  /**
   * Upload a recorded voice note (audio Blob) to Cloudinary via the backend.
   * Returns { url, publicId, duration } — pass these into send() as
   * audioUrl/audioPublicId/audioDuration to actually post the message.
   */
  uploadVoiceNote(blob: Blob, durationSeconds: number): Observable<any> {
    const fd = new FormData();
    const ext = blob.type.includes('webm') ? 'webm' : 'm4a';
    fd.append('audio', blob, `voice-note.${ext}`);
    fd.append('duration', String(Math.round(durationSeconds)));
    return this.api.upload('/uploads/voice', fd);
  }

  /**
   * Upload a chat photo. Reuses the existing generic image-upload endpoint
   * (same one used by listings/evidence/etc). Returns { url, publicId }.
   */
  uploadChatImage(file: File): Observable<any> {
    const fd = new FormData();
    fd.append('image', file);
    fd.append('folder', 'rentify/chat-images');
    return this.api.upload('/uploads/image', fd);
  }

  /**
   * Upload a chat video clip. Returns { url, publicId, thumbUrl, duration }.
   */
  uploadChatVideo(file: File): Observable<any> {
    const fd = new FormData();
    fd.append('video', file);
    return this.api.upload('/uploads/video', fd);
  }
}
