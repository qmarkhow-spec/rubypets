import { importPKCS8, SignJWT } from "jose";

type Env = {
  FCM_SERVICE_ACCOUNT_JSON: string;
  FCM_PROJECT_ID: string;
};

let cached: { token: string; expMs: number } | null = null;

const nowSec = () => Math.floor(Date.now() / 1000);

export async function getFcmAccessToken(env: Env): Promise<string> {
  if (cached && Date.now() < cached.expMs - 60_000) return cached.token;

  const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON);
  const clientEmail: string = sa.client_email;
  const privateKeyPem: string = sa.private_key;
  const tokenUri: string = sa.token_uri || "https://oauth2.googleapis.com/token";

  const iat = nowSec();
  const exp = iat + 3600;

  const pk = await importPKCS8(privateKeyPem, "RS256");

  const jwt = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setSubject(clientEmail)
    .setAudience(tokenUri)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(pk);

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt
  });

  const resp = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  if (!resp.ok) throw new Error(`FCM token exchange failed: ${resp.status} ${await resp.text()}`);

  const json = (await resp.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expMs: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

export async function fcmSend(env: Env, message: any): Promise<Response> {
  const accessToken = await getFcmAccessToken(env);
  const url = `https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`;
  return fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ message })
  });
}
