'use strict';
/**
 * CMS Seeder — Rentify PK
 * Run once to populate initial team members, testimonials & owner stories.
 *
 * Usage:
 *   cd backend
 *   node scripts/seed-cms.js
 *
 * Safe to re-run — skips entries that already exist (by name).
 */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const { TeamMember, Testimonial, OwnerStory } = require('../models/cms.model');

const TEAM = [
  { name: 'Ali Hassan',      role: 'CEO & Co-Founder',   city: 'Karachi',    avatarInitials: 'AH', order: 1, bio: 'Serial entrepreneur with 10+ years in tech. Passionate about solving Pakistan\'s rental economy gap.' },
  { name: 'Sara Khan',       role: 'CTO & Co-Founder',   city: 'Lahore',     avatarInitials: 'SK', order: 2, bio: 'Full-stack engineer and architect of Rentify\'s secure payment infrastructure.' },
  { name: 'Bilal Ahmed',     role: 'Head of Operations', city: 'Islamabad',  avatarInitials: 'BA', order: 3, bio: 'Former logistics manager. Oversees CNIC verification and dispute resolution.' },
  { name: 'Ayesha Siddiqui', role: 'Head of Marketing',  city: 'Karachi',    avatarInitials: 'AS', order: 4, bio: 'Digital marketing expert who grew Rentify from 0 to 1,200 users in 6 months.' },
  { name: 'Usman Tariq',     role: 'Lead Designer',      city: 'Lahore',     avatarInitials: 'UT', order: 5, bio: 'UX/UI designer focused on making Rentify feel intuitive for every Pakistani user.' },
  { name: 'Hina Malik',      role: 'Customer Success',   city: 'Faisalabad', avatarInitials: 'HM', order: 6, bio: 'Handles all owner and renter support in Urdu and English. Available 24/7.' },
];

const TESTIMONIALS = [
  {
    name: 'Ahmed Raza',     city: 'Karachi',   role: 'Renter', avatarInitials: 'AR', rating: 5, order: 1,
    text: 'Rented a DSLR camera for my sister\'s wedding. The owner was super helpful, delivery was on time, and the price was unbelievable. Rentify is the future!',
  },
  {
    name: 'Fatima Khan',    city: 'Lahore',    role: 'Owner',  avatarInitials: 'FK', rating: 5, order: 2,
    text: 'My Honda Civic was sitting idle. Now it earns me PKR 45,000 extra every month through Rentify. The payment system is secure and the platform is very easy to use.',
  },
  {
    name: 'Usman Siddiqui', city: 'Islamabad', role: 'Renter', avatarInitials: 'US', rating: 4, order: 3,
    text: 'Got a projector for my office presentation. Saved Rs. 80,000 compared to buying. The CNIC verification gave me full trust in the owner. Highly recommended!',
  },
];

const OWNER_STORIES = [
  { name: 'Tariq Mehmood', city: 'Karachi',   itemListed: 'Honda Civic 2020',  monthlyEarning: 45000, avatarInitials: 'TM', order: 1 },
  { name: 'Sara Raza',     city: 'Lahore',    itemListed: 'Sony A7III Camera', monthlyEarning: 28000, avatarInitials: 'SR', order: 2 },
  { name: 'Kamran Ali',    city: 'Islamabad', itemListed: 'MacBook Pro M2',    monthlyEarning: 36000, avatarInitials: 'KA', order: 3 },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/rentify');
  console.log('✓ Connected to MongoDB\n');

  // Team
  let teamAdded = 0;
  for (const member of TEAM) {
    const exists = await TeamMember.findOne({ name: member.name });
    if (!exists) { await TeamMember.create(member); teamAdded++; }
    else console.log(`  skip team: ${member.name} already exists`);
  }
  console.log(`✓ Team members: ${teamAdded} added\n`);

  // Testimonials
  let testiAdded = 0;
  for (const t of TESTIMONIALS) {
    const exists = await Testimonial.findOne({ name: t.name });
    if (!exists) { await Testimonial.create(t); testiAdded++; }
    else console.log(`  skip testimonial: ${t.name} already exists`);
  }
  console.log(`✓ Testimonials: ${testiAdded} added\n`);

  // Owner stories
  let storiesAdded = 0;
  for (const s of OWNER_STORIES) {
    const exists = await OwnerStory.findOne({ name: s.name });
    if (!exists) { await OwnerStory.create(s); storiesAdded++; }
    else console.log(`  skip owner story: ${s.name} already exists`);
  }
  console.log(`✓ Owner stories: ${storiesAdded} added\n`);

  console.log('🎉 CMS seed complete!');
  console.log('Now manage content via Admin Panel → CMS, or directly via API:');
  console.log('  POST /api/cms/team          (admin)');
  console.log('  POST /api/cms/testimonials  (admin)');
  console.log('  POST /api/cms/owner-stories (admin)');
  await mongoose.disconnect();
}

seed().catch(err => { console.error('Seed failed:', err.message); process.exit(1); });
