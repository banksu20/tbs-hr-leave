import { createHash } from 'node:crypto';

type LineProfile = {userId:string;pictureUrl:string|null};
const verifiedTokens = new Map<string,{profile:LineProfile;until:number}>();
const CACHE_MS = 5 * 60 * 1000;

// LINE Login channel used by the employee LIFF app 2008617589-89gR1Y3Y.
export async function verifyLineIdentity(authorization: string | undefined): Promise<string> {
  return (await verifyLineProfile(authorization)).userId;
}

export async function verifyLineProfile(authorization: string | undefined): Promise<LineProfile> {
  const token = authorization?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!token || token.length > 4096) throw new Error('Open the employee app in LINE and sign in again.');
  const key = createHash('sha256').update(token).digest('hex');
  const now = Date.now();
  const cached = verifiedTokens.get(key);
  if (cached && cached.until > now) return cached.profile;
  const verified = await fetch(`https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) });
  if (!verified.ok) throw new Error('Your LINE session expired. Sign in again.');
  const claims = await verified.json() as {client_id?:unknown;expires_in?:unknown};
  const expiresIn = Number(claims.expires_in);
  if (claims.client_id !== '2008617589' || !(expiresIn > 0)) throw new Error('Invalid LINE session.');
  const profile = await fetch('https://api.line.me/v2/profile', { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
  if (!profile.ok) throw new Error('Cannot verify your LINE identity.');
  const identity = await profile.json() as {userId?:unknown;pictureUrl?:unknown};
  if (typeof identity.userId !== 'string' || !/^U[0-9a-f]{32}$/.test(identity.userId)) throw new Error('Invalid LINE identity.');
  const picture = typeof identity.pictureUrl === 'string' && /^https:\/\/[a-z0-9.-]+\.line-scdn\.net\/[^\s"'<>]{1,500}$/.test(identity.pictureUrl) ? identity.pictureUrl : null;
  const result = { userId: identity.userId, pictureUrl: picture };
  if (verifiedTokens.size > 500) for (const [k, v] of verifiedTokens) if (v.until <= now || verifiedTokens.size > 400) verifiedTokens.delete(k);
  verifiedTokens.set(key, { profile: result, until: now + Math.min(CACHE_MS, expiresIn * 1000) });
  return result;
}
