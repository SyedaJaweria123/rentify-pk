'use strict';
/**
 * WebAuthn Service — Rentify PK
 * ─────────────────────────────────────────────────────────────────────────────
 * Device biometric login (fingerprint / Face ID / Windows Hello) layered on
 * top of the existing password login — same idea as a banking app's "log in
 * with Face ID" toggle. This proves "the same device/browser that was
 * registered is making this request" — it is NOT identity verification in
 * the CNIC sense, and never replaces the password entirely (a user can
 * always fall back to it).
 *
 * Flow:
 *   Registration (while already logged in via password):
 *     1. GET  registration options  → server generates a challenge
 *     2. Browser's navigator.credentials.create() prompts fingerprint/face
 *     3. POST verify                → server validates + stores the credential
 *
 *   Login (no password yet):
 *     1. POST login options (by email) → server generates a challenge,
 *        scoped to that user's already-registered credentials
 *     2. Browser's navigator.credentials.get() prompts fingerprint/face
 *     3. POST verify                   → server validates, issues a JWT
 *        exactly like a normal password login would
 * ─────────────────────────────────────────────────────────────────────────────
 */
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const RP_NAME = 'Rentify PK';

function getRpID() {
  const url = process.env.FRONTEND_URL || 'http://localhost:4200';
  try { return new URL(url).hostname; } catch { return 'localhost'; }
}

function getOrigin() {
  return process.env.FRONTEND_URL || 'http://localhost:4200';
}

// In-memory challenge store — short-lived (60s), keyed by userId for
// registration and by a one-time login-attempt token for login. A real
// multi-instance deployment would use Redis instead, but a single-instance
// Node process (as this project runs) doesn't need that yet, and a DB round
// trip for a 60-second value would be wasteful.
const challengeStore = new Map();
const CHALLENGE_TTL_MS = 60 * 1000;

function storeChallenge(key, challenge) {
  challengeStore.set(key, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
}
function takeChallenge(key) {
  const entry = challengeStore.get(key);
  challengeStore.delete(key); // one-time use either way
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.challenge;
}

/** Step 1 of registration — generate options for navigator.credentials.create(). */
async function getRegistrationOptions(user) {
  const existingIds = (user.webauthnCredentials || []).map(c => c.credentialId);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: getRpID(),
    userID: Buffer.from(String(user._id)),
    userName: user.email,
    userDisplayName: user.name || user.email,
    attestationType: 'none',
    excludeCredentials: existingIds.map(id => ({ id, type: 'public-key' })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required', // forces actual biometric/PIN, not just "device present"
    },
  });

  storeChallenge(`reg:${user._id}`, options.challenge);
  return options;
}

/** Step 2 of registration — verify the browser's response and return the credential to save. */
async function verifyRegistration(user, response) {
  const expectedChallenge = takeChallenge(`reg:${user._id}`);
  if (!expectedChallenge) throw new Error('Registration challenge expired — please try again.');

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: getOrigin(),
    expectedRPID: getRpID(),
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Could not verify this device. Please try again.');
  }

  const { credential } = verification.registrationInfo;
  return {
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: response.response?.transports || [],
  };
}

/** Step 1 of login — generate options scoped to this specific user's credentials. */
async function getLoginOptions(user) {
  const creds = user.webauthnCredentials || [];
  if (creds.length === 0) throw new Error('No biometric device registered for this account.');

  const options = await generateAuthenticationOptions({
    rpID: getRpID(),
    userVerification: 'required',
    allowCredentials: creds.map(c => ({ id: c.credentialId, type: 'public-key', transports: c.transports })),
  });

  // Keyed by user ID here too — a login attempt is already scoped to one
  // account (the person picked "login with biometrics" after entering their
  // email, or the app remembers their last account on this device).
  storeChallenge(`login:${user._id}`, options.challenge);
  return options;
}

/** Step 2 of login — verify the response against the matching stored credential. */
async function verifyLogin(user, response) {
  const expectedChallenge = takeChallenge(`login:${user._id}`);
  if (!expectedChallenge) throw new Error('Login challenge expired — please try again.');

  const credentialIdFromResponse = response.id; // base64url, as sent by the browser
  const stored = (user.webauthnCredentials || []).find(c => c.credentialId === credentialIdFromResponse);
  if (!stored) throw new Error('This device is not registered to this account.');

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: getOrigin(),
    expectedRPID: getRpID(),
    credential: {
      id: stored.credentialId,
      publicKey: Buffer.from(stored.publicKey, 'base64url'),
      counter: stored.counter,
      transports: stored.transports,
    },
  });

  if (!verification.verified) throw new Error('Biometric verification failed.');

  return { credentialId: stored.credentialId, newCounter: verification.authenticationInfo.newCounter };
}

module.exports = {
  getRegistrationOptions,
  verifyRegistration,
  getLoginOptions,
  verifyLogin,
};
