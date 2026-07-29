'use strict';
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const User = require('../models/User');

const BACKEND = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;

// ── Shared OAuth user handler ─────────────────────────────────────────────────
const handleOAuthUser = async ({ email, socialId, socialField, name, avatar, provider }) => {
  // 1. Find by social ID
  let user = await User.findOne({ [socialField]: socialId });
  if (user) {
    // Sync verification + reactivate — social login = verified & active
    let changed = false;
    if (!user.isEmailVerified) { user.isEmailVerified = true; changed = true; }
    if (!user.isActive)        { user.isActive = true;        changed = true; }
    if (changed) await user.save({ validateBeforeSave: false });
    return user;
  }

  // 2. Find by email — link social account
  if (email) {
    user = await User.findOne({ email });
    if (user) {
      user[socialField] = socialId;
      user.isEmailVerified = true; // Social login verifies email
      user.isActive = true;        // reactivate on social login
      if (!user.avatar) user.avatar = avatar;
      await user.save({ validateBeforeSave: false });
      return user;
    }
  }

  // 3. Create new user — DO NOT set phone (avoids null index conflict)
  user = new User({
    name:            name || (email ? email.split('@')[0] : 'User'),
    email:           email || `${provider}_${socialId}@oauth.rentanything.pk`,
    [socialField]:   socialId,
    avatar:          avatar || null,
    provider,
    isEmailVerified: true,  // Social = verified
    isActive:        true,
    role:            'renter', // Default role — user can upgrade to owner
  });

  // Explicitly unset phone — prevents sparse index null conflict
  user.set('phone', undefined);
  await user.save();
  return user;
};

module.exports = () => {

  // ── Google ──────────────────────────────────────────────────────────────────
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID') {
    passport.use(new GoogleStrategy({
      clientID:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:  `${BACKEND}/api/auth/google/callback`,
    }, async (_at, _rt, profile, done) => {
      try {
        const email  = profile.emails?.[0]?.value?.toLowerCase();
        const avatar = profile.photos?.[0]?.value || null;
        const name   = profile.displayName;

        const user = await handleOAuthUser({
          email, socialId: profile.id,
          socialField: 'googleId',
          name, avatar, provider: 'google'
        });
        done(null, user);
      } catch (err) {
        console.error('Google OAuth error:', err.message);
        done(err, null);
      }
    }));
  }

  // ── Facebook ────────────────────────────────────────────────────────────────
  if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_ID !== 'YOUR_FACEBOOK_APP_ID') {
    passport.use(new FacebookStrategy({
      clientID:      process.env.FACEBOOK_APP_ID,
      clientSecret:  process.env.FACEBOOK_APP_SECRET,
      callbackURL:   `${BACKEND}/api/auth/facebook/callback`,
      profileFields: ['id', 'displayName', 'email', 'picture.type(large)']
    }, async (_at, _rt, profile, done) => {
      try {
        const email  = profile.emails?.[0]?.value?.toLowerCase();
        const avatar = profile.photos?.[0]?.value || null;
        const name   = profile.displayName;

        const user = await handleOAuthUser({
          email, socialId: profile.id,
          socialField: 'facebookId',
          name, avatar, provider: 'facebook'
        });
        done(null, user);
      } catch (err) {
        console.error('Facebook OAuth error:', err.message);
        done(err, null);
      }
    }));
  }

  passport.serializeUser((user, done) => done(null, user._id));
  passport.deserializeUser(async (id, done) => {
    try { done(null, await User.findById(id)); } catch (e) { done(e, null); }
  });
};
