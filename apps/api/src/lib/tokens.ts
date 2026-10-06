import { createHash, randomBytes } from 'node:crypto';

/** 256 bits of randomness, URL-safe. Used for session and sign-in tokens. */
export const randomToken = () => randomBytes(32).toString('base64url');

/** Tokens are stored hashed so a database leak doesn't hand out live sessions. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
