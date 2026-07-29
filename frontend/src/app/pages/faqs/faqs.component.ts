import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-faqs',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './faqs.component.html',
  styleUrls: ['./faqs.component.css'],
})
export class FaqsComponent {
  searchQuery   = '';
  openKey: number | null = null;
  activeCategory = 'all';

  readonly faqCategories = [
    {
      id: 'general', label: 'General',
      items: [
        { q: 'What is Rentify?', a: "Rentify is Pakistan's peer-to-peer rental marketplace. Rent items from verified owners near you, or list your own items to earn." },
        { q: 'Is Rentify free to use?', a: 'Browsing and renting is free. Owners pay a 5% platform fee only when a booking completes — no upfront cost.' },
        { q: 'Which cities are covered?', a: 'Rentify is available in Karachi, Lahore, Islamabad, Rawalpindi, Faisalabad, Multan, and more.' },
        { q: 'How do I create an account?', a: 'Click Get Started and sign up with email, or use Google / Facebook login. It is free.' },
      ],
    },
    {
      id: 'account', label: 'Account',
      items: [
        { q: 'How do I verify my CNIC?', a: 'Go to Profile → CNIC Verification. Upload front, back and selfie. Admin verifies within 24 hours.' },
        { q: 'Can I have multiple roles?', a: 'Yes. You can be a Renter and request to become an Owner or Rider from your dashboard.' },
        { q: 'How do I reset my password?', a: 'Click Forgot Password on login page. Enter your email and follow OTP instructions sent to your email.' },
        { q: 'How do I update my profile?', a: 'Go to My Profile. You can update your name, phone, avatar and password anytime.' },
      ],
    },
    {
      id: 'earnings', label: 'Earnings',
      items: [
        { q: 'How do I earn on Rentify?', a: 'List your items as an Owner. Every completed booking earns you the rental amount minus the 5% platform fee.' },
        { q: 'When do earnings appear in wallet?', a: 'Earnings are added to your wallet after admin releases the escrow when rental period ends (within 24h grace period).' },
        { q: 'What is the platform fee?', a: 'A 5% service fee is deducted from your rental earnings. There are no other hidden charges.' },
      ],
    },
    {
      id: 'withdrawals', label: 'Withdrawals',
      items: [
        { q: 'How can I withdraw my earnings?', a: 'Go to Wallet → Withdraw. Enter amount, select JazzCash/Easypaisa/Bank Transfer, and enter account number.' },
        { q: 'How long does withdrawal take?', a: 'Admin processes withdrawal requests manually within 1-3 business days.' },
        { q: 'Is there any withdrawal fee?', a: 'No withdrawal fee. You receive the full requested amount.' },
        { q: 'Which accounts can I use?', a: 'JazzCash, Easypaisa, or any Pakistani bank account (provide IBAN).' },
      ],
    },
    {
      id: 'renting', label: 'Renting',
      items: [
        { q: 'How do I book an item?', a: 'Browse listings, select dates, click Book Now. Owner confirms, then pay via JazzCash/Easypaisa/Bank Transfer.' },
        { q: 'Can I cancel a booking?', a: 'Yes. Pending = 100% refund. 48h+ before start = 50%. 24–48h = 25%. Under 24h = no refund.' },
        { q: 'How does delivery work?', a: 'Choose Doorstep Delivery at booking. Rider picks from owner, delivers to you. Track live on map.' },
      ],
    },
  ];

  get totalCount(): number {
    return this.faqCategories.reduce((s, c) => s + c.items.length, 0);
  }

  get visibleItems(): { q: string; a: string }[] {
    const q = this.searchQuery.toLowerCase().trim();

    // While searching — always search across ALL categories
    if (q) {
      return this.faqCategories
        .flatMap(c => c.items)
        .filter(i => i.q.toLowerCase().includes(q) || i.a.toLowerCase().includes(q));
    }

    // No search — show by active category
    const cats = this.activeCategory === 'all'
      ? this.faqCategories
      : this.faqCategories.filter(c => c.id === this.activeCategory);
    return cats.flatMap(c => c.items);
  }

  setCategory(id: string): void { this.activeCategory = id; this.openKey = null; }
  toggle(i: number): void { this.openKey = this.openKey === i ? null : i; }
}
