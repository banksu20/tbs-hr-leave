// LINE Login channel used by the employee LIFF app 2008617589-89gR1Y3Y.
export async function verifyLineIdentity(authorization: string | undefined): Promise<string> {
  const token = authorization?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!token || token.length > 4096) throw new Error('Open the employee app in LINE and sign in again.');
  const verified = await fetch(`https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) });
  if (!verified.ok) throw new Error('Your LINE session expired. Sign in again.');
  const claims = await verified.json() as {client_id?:unknown;expires_in?:unknown};
  if (claims.client_id !== '2008617589' || !(Number(claims.expires_in) > 0)) throw new Error('Invalid LINE session.');
  const profile = await fetch('https://api.line.me/v2/profile', { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
  if (!profile.ok) throw new Error('Cannot verify your LINE identity.');
  const identity = await profile.json() as {userId?:unknown};
  if (typeof identity.userId !== 'string' || !/^U[0-9a-f]{32}$/.test(identity.userId)) throw new Error('Invalid LINE identity.');
  return identity.userId;
}
