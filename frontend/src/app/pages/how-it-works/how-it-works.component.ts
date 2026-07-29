import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

interface Step  { num: string; icon: string; title: string; desc: string; }
interface Trust { icon: string; title: string; desc: string; }
interface Faq   { q: string; a: string; }

@Component({
  selector: 'app-how-it-works',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './how-it-works.component.html',
  styleUrls: ['./how-it-works.component.css'],
})
export class HowItWorksComponent {

  activeTab: 'renters' | 'owners' | 'riders' = 'renters';
  setTab(tab: 'renters' | 'owners' | 'riders'): void { this.activeTab = tab; }

  /* ── Steps for Renters (icon = SVG key) ── */
  readonly renterSteps: Step[] = [
    { num: '01', icon: 'search',  title: 'Search & Discover',      desc: 'Browse listings across Pakistan. Filter by city, category, and price to find exactly what you need.' },
    { num: '02', icon: 'calendar',title: 'Send a Booking Request', desc: 'Pick your rental dates on the calendar, review the price breakdown, and send a request to the verified owner.' },
    { num: '03', icon: 'check',   title: 'Owner Confirms',         desc: 'The owner reviews and confirms your request. You get notified instantly inside the app.' },
    { num: '04', icon: 'wallet',  title: 'Pay Securely',           desc: 'Pay through your Rentify wallet. Funds are held safely until the rental is complete.' },
    { num: '05', icon: 'box',     title: 'Pick Up & Enjoy',        desc: 'Collect the item from the owner, enjoy your rental, and return it on time.' },
    { num: '06', icon: 'star',    title: 'Leave a Review',         desc: 'Share your experience. Honest reviews help the community and reward great owners.' },
  ];

  /* ── Steps for Owners ── */
  readonly ownerSteps: Step[] = [
    { num: '01', icon: 'edit',    title: 'Create Your Listing',    desc: 'Upload photos, set your price, choose your city, and describe your item — it takes just a few minutes.' },
    { num: '02', icon: 'shield',  title: 'Verify Your CNIC',       desc: 'One-time CNIC verification builds trust with renters and unlocks owner features including withdrawals.' },
    { num: '03', icon: 'bell',    title: 'Receive Requests',       desc: 'Get notified when someone wants to rent your item. Review the renter and accept or decline.' },
    { num: '04', icon: 'wallet',  title: 'Earn & Get Paid',        desc: 'Earnings are released to your Rentify wallet after the rental ends. Withdraw to your bank anytime.' },
    { num: '05', icon: 'repeat',  title: 'Keep Earning',           desc: 'Your listing stays active around the clock, ready for the next booking.' },
  ];

  /* ── Steps for Riders ── */
  readonly riderSteps: Step[] = [
    { num: '01', icon: 'signup',   title: 'Register as Rider',      desc: 'Sign up with your details and select Rider role. Or upgrade from your existing account dashboard.' },
    { num: '02', icon: 'cnic',     title: 'Verify Your Identity',   desc: 'Complete CNIC verification — upload front, back and selfie. Admin approves within 24 hours.' },
    { num: '03', icon: 'duty',     title: 'Go On Duty',             desc: 'Open your Rider Dashboard and toggle "On Duty". Your GPS goes live and you become available for assignments.' },
    { num: '04', icon: 'assign',   title: 'Get Assignment',         desc: 'When a renter books with delivery, system automatically assigns the nearest available rider. You get a notification instantly.' },
    { num: '05', icon: 'qr',       title: 'Scan QR & Pick Up',      desc: "Go to owner's location. Scan the QR code shown by the owner to confirm pickup. Item details and delivery address appear." },
    { num: '06', icon: 'deliver',  title: 'Deliver & Earn',         desc: 'Deliver to the renter, upload proof photo. Earning is added to your wallet after each delivery.' },
  ];

  /* ── Trust badges ── */
  readonly trustItems: Trust[] = [
    { icon: 'lock',   title: 'Secure Wallet',     desc: 'Payments are held safely until the item is received. No risk for either party.' },
    { icon: 'shield', title: 'CNIC Verified',     desc: 'Every owner is verified with their CNIC before they can list or withdraw funds.' },
    { icon: 'support',title: '24/7 Support',      desc: 'Our team is available around the clock in Urdu and English via chat.' },
    { icon: 'guard',  title: 'Damage Protection', desc: 'Security deposits protect owners. Renters are liable for damage during the rental.' },
    { icon: 'star',   title: 'Verified Reviews',  desc: 'Only completed bookings can leave reviews — no fake ratings on Rentify.' },
    { icon: 'pin',    title: 'Across Pakistan',   desc: 'Available in major cities from Karachi to Islamabad, with more added regularly.' },
  ];

  /* ── FAQ ── */
  readonly faqs: Faq[] = [
    { q: 'Is Rentify free to use?', a: 'Browsing and renting is free. Owners pay a small platform fee only when a booking completes — no upfront charges.' },
    { q: 'How do I know the owner is trustworthy?', a: 'Every owner completes CNIC verification before listing. You can also check their rating, reviews, and member-since date.' },
    { q: 'What happens if the item is damaged?', a: 'A security deposit set by the owner is collected at booking. If damage occurs, the owner files a dispute and the deposit covers costs.' },
    { q: 'Can I cancel a booking?', a: 'Yes. Refund depends on timing: pending = full refund, 48h+ before start = 50%, 24–48h = 25%, under 24h = none.' },
    { q: 'How do I receive payments as an owner?', a: 'Earnings go to your Rentify wallet automatically after a booking completes, and you can withdraw to your bank.' },
    { q: 'Is my personal information safe?', a: 'Yes. We use encryption for all data. CNIC images are stored securely and only reviewed by our verification team.' },
  ];

  openFaqIndex: number | null = null;
  toggleFaq(i: number): void { this.openFaqIndex = this.openFaqIndex === i ? null : i; }
}
