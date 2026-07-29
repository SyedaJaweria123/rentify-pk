import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/services/api.service';

export interface SendMessagePayload {
  content: string;
  recipientId?: string;
  conversationId?: string;
  bookingId?: string;
  listingId?: string;
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

  deleteMessage(messageId: string): Observable<any> {
    return this.api.delete(`/messages/${messageId}`);
  }
}
