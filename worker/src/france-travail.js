const DEFAULT_TOKEN_URL = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire';
const ALLOWED_API_HOST = 'api.francetravail.io';
const TOKEN_SAFETY_MARGIN_MS = 60_000;

let tokenCache = {
  cacheKey: '',
  accessToken: '',
  expiresAt: 0
};

export class FranceTravailApiError extends Error {
  constructor(code, message, status = 500, details = null) {
    super(message);
    this.name = 'FranceTravailApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function normalizedEnv(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function franceTravailEventsStatus(env) {
  const clientId = normalizedEnv(env.FRANCE_TRAVAIL_CLIENT_ID);
  const clientSecret = normalizedEnv(env.FRANCE_TRAVAIL_CLIENT_SECRET);
  const scope = normalizedEnv(env.FRANCE_TRAVAIL_EVENTS_SCOPE);
  const eventsUrl = normalizedEnv(env.FRANCE_TRAVAIL_EVENTS_URL);
  const missing = [];
  if (!clientId) missing.push('FRANCE_TRAVAIL_CLIENT_ID');
  if (!clientSecret) missing.push('FRANCE_TRAVAIL_CLIENT_SECRET');
  if (!scope) missing.push('FRANCE_TRAVAIL_EVENTS_SCOPE');
  if (!eventsUrl) missing.push('FRANCE_TRAVAIL_EVENTS_URL');

  let endpoint = null;
  let endpointValid = false;
  if (eventsUrl) {
    try {
      const url = new URL(eventsUrl);
      endpointValid = url.protocol === 'https:' && url.hostname === ALLOWED_API_HOST;
      if (endpointValid) endpoint = url.toString();
    } catch {
      endpointValid = false;
    }
    if (!endpointValid) missing.push('FRANCE_TRAVAIL_EVENTS_URL_VALID');
  }

  return {
    configured: missing.length === 0,
    missing,
    endpoint,
    api_host: ALLOWED_API_HOST,
    authentication: 'oauth2_client_credentials'
  };
}

function requireConfiguration(env) {
  const status = franceTravailEventsStatus(env);
  if (!status.configured) {
    throw new FranceTravailApiError(
      'france_travail_not_configured',
      `Configuration France Travail incomplète : ${status.missing.join(', ')}.`,
      503,
      status
    );
  }
  return status;
}

function tokenCacheKey(env) {
  return `${normalizedEnv(env.FRANCE_TRAVAIL_CLIENT_ID)}|${normalizedEnv(env.FRANCE_TRAVAIL_EVENTS_SCOPE)}`;
}

function extractTokenPayload(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.access_token) return payload;
  if (Array.isArray(payload)) {
    const candidate = payload.find((item) => item && typeof item === 'object' && item.access_token);
    if (candidate) return candidate;
  }
  return null;
}

async function requestAccessToken(env) {
  requireConfiguration(env);
  const cacheKey = tokenCacheKey(env);
  if (
    tokenCache.cacheKey === cacheKey
    && tokenCache.accessToken
    && tokenCache.expiresAt - TOKEN_SAFETY_MARGIN_MS > Date.now()
  ) {
    return tokenCache.accessToken;
  }

  const form = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: normalizedEnv(env.FRANCE_TRAVAIL_CLIENT_ID),
    client_secret: normalizedEnv(env.FRANCE_TRAVAIL_CLIENT_SECRET),
    scope: normalizedEnv(env.FRANCE_TRAVAIL_EVENTS_SCOPE)
  });

  const response = await fetch(DEFAULT_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorCode = payload?.error || 'token_request_failed';
    const description = payload?.error_description || 'France Travail a refusé la création du jeton OAuth.';
    throw new FranceTravailApiError(
      errorCode === 'invalid_client' ? 'france_travail_invalid_client' : 'france_travail_token_failed',
      description,
      response.status,
      { upstream_error: errorCode }
    );
  }

  const tokenPayload = extractTokenPayload(payload);
  if (!tokenPayload?.access_token) {
    throw new FranceTravailApiError(
      'france_travail_token_invalid',
      'La réponse OAuth France Travail ne contient pas de jeton exploitable.',
      502
    );
  }

  const expiresIn = Number(tokenPayload.expires_in || 1200);
  tokenCache = {
    cacheKey,
    accessToken: String(tokenPayload.access_token),
    expiresAt: Date.now() + Math.max(60, expiresIn) * 1000
  };
  return tokenCache.accessToken;
}

function buildEventsUrl(env, params = {}) {
  const status = requireConfiguration(env);
  const url = new URL(status.endpoint);
  if (!params || typeof params !== 'object' || Array.isArray(params)) return url;

  for (const [key, rawValue] of Object.entries(params)) {
    if (!key || rawValue === null || rawValue === undefined || rawValue === '') continue;
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      if (!['string', 'number', 'boolean'].includes(typeof value)) continue;
      url.searchParams.append(key, String(value));
    }
  }
  return url;
}

async function fetchEventsOnce(env, params, token) {
  const url = buildEventsUrl(env, params);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`
    }
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    const text = await response.text().catch(() => '');
    payload = text ? { raw: text.slice(0, 4000) } : null;
  }

  return { response, payload, url: url.toString() };
}

export async function searchFranceTravailEvents(env, params = {}) {
  let token = await requestAccessToken(env);
  let result = await fetchEventsOnce(env, params, token);

  if (result.response.status === 401) {
    tokenCache = { cacheKey: '', accessToken: '', expiresAt: 0 };
    token = await requestAccessToken(env);
    result = await fetchEventsOnce(env, params, token);
  }

  if (!result.response.ok) {
    const upstreamMessage = result.payload?.message
      || result.payload?.error_description
      || result.payload?.error
      || `Erreur HTTP ${result.response.status} renvoyée par France Travail.`;
    throw new FranceTravailApiError(
      'france_travail_events_failed',
      String(upstreamMessage),
      result.response.status,
      {
        endpoint: result.url,
        upstream_status: result.response.status
      }
    );
  }

  return {
    source: 'France Travail - Mes Evènements Emploi',
    endpoint: result.url,
    fetched_at: new Date().toISOString(),
    data: result.payload
  };
}

export function resetFranceTravailTokenCacheForTests() {
  tokenCache = { cacheKey: '', accessToken: '', expiresAt: 0 };
}
