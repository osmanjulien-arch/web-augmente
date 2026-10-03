const DEFAULT_TOKEN_URL = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire';
const DEFAULT_EVENTS_URL = 'https://api.francetravail.io/partenaire/evenements/v1/mee/evenements';
const DEFAULT_EVENTS_SCOPE = 'api_evenementsv1 evenements';
const ALLOWED_API_HOST = 'api.francetravail.io';
const TOKEN_SAFETY_MARGIN_MS = 60_000;

const EVENT_FILTER_KEYS = new Set([
  'modalite',
  'dateDebut',
  'dateFin',
  'objectifs',
  'publicCible',
  'operations',
  'typeEvenement',
  'beneficeParticipations',
  'codePostal',
  'departements',
  'secteurActivite',
  'longitude',
  'latitude',
  'rayon'
]);

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

function configuredScope(env) {
  return normalizedEnv(env.FRANCE_TRAVAIL_EVENTS_SCOPE) || DEFAULT_EVENTS_SCOPE;
}

function configuredEventsUrl(env) {
  return normalizedEnv(env.FRANCE_TRAVAIL_EVENTS_URL) || DEFAULT_EVENTS_URL;
}

export function franceTravailEventsStatus(env) {
  const clientId = normalizedEnv(env.FRANCE_TRAVAIL_CLIENT_ID);
  const clientSecret = normalizedEnv(env.FRANCE_TRAVAIL_CLIENT_SECRET);
  const scope = configuredScope(env);
  const eventsUrl = configuredEventsUrl(env);
  const missing = [];
  if (!clientId) missing.push('FRANCE_TRAVAIL_CLIENT_ID');
  if (!clientSecret) missing.push('FRANCE_TRAVAIL_CLIENT_SECRET');

  let endpoint = null;
  let endpointValid = false;
  try {
    const url = new URL(eventsUrl);
    endpointValid = url.protocol === 'https:' && url.hostname === ALLOWED_API_HOST;
    if (endpointValid) endpoint = url.toString();
  } catch {
    endpointValid = false;
  }
  if (!endpointValid) missing.push('FRANCE_TRAVAIL_EVENTS_URL_VALID');

  return {
    configured: missing.length === 0,
    missing,
    endpoint,
    scope,
    method: 'POST',
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
  return `${normalizedEnv(env.FRANCE_TRAVAIL_CLIENT_ID)}|${configuredScope(env)}`;
}

function extractTokenPayload(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.access_token) return payload;
  if (Array.isArray(payload)) {
    const candidate = payload.find((item) => item && typeof item === 'object' && item.access_token);
    if (candidate) return candidate;
  }
  return null;
}

async function parseResponsePayload(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 4000) };
  }
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
    scope: configuredScope(env)
  });

  const response = await fetch(DEFAULT_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  });

  const payload = await parseResponsePayload(response);

  if (!response.ok) {
    const errorCode = payload?.error || 'token_request_failed';
    const description = payload?.error_description || payload?.message || 'France Travail a refusé la création du jeton OAuth.';
    throw new FranceTravailApiError(
      errorCode === 'invalid_client' ? 'france_travail_invalid_client' : 'france_travail_token_failed',
      String(description),
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

function normalizePagination(input = {}) {
  const rawPage = Number(input.page ?? 0);
  const rawSize = Number(input.size ?? 20);
  const page = Number.isInteger(rawPage) && rawPage >= 0 ? rawPage : 0;
  const size = Number.isInteger(rawSize) ? Math.min(100, Math.max(1, rawSize)) : 20;
  const rawSort = typeof input.sort === 'string' && input.sort.trim() ? input.sort.trim() : 'dateEvenement';
  const sort = /^[A-Za-z0-9_.-]{1,80}$/.test(rawSort) ? rawSort : 'dateEvenement';
  return { page, size, sort };
}

function normalizeFilters(filters = {}) {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) return {};
  const output = {};
  for (const [key, value] of Object.entries(filters)) {
    if (!EVENT_FILTER_KEYS.has(key) || value === undefined || value === null || value === '') continue;

    if (Array.isArray(value)) {
      const cleaned = value
        .filter((item) => ['string', 'number', 'boolean'].includes(typeof item))
        .map((item) => typeof item === 'string' ? item.trim() : item)
        .filter((item) => item !== '');
      if (cleaned.length) output[key] = cleaned;
      continue;
    }

    if (['string', 'number', 'boolean'].includes(typeof value)) {
      output[key] = typeof value === 'string' ? value.trim() : value;
    }
  }
  return output;
}

function buildEventsRequest(env, input = {}) {
  const status = requireConfiguration(env);
  const { page, size, sort } = normalizePagination(input);
  const url = new URL(status.endpoint);
  url.searchParams.set('page', String(page));
  url.searchParams.set('size', String(size));
  url.searchParams.set('sort', sort);
  const filters = normalizeFilters(input.filters);
  return { url, filters, page, size, sort };
}

async function fetchEventsOnce(env, input, token) {
  const request = buildEventsRequest(env, input);
  const response = await fetch(request.url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(request.filters)
  });

  const payload = await parseResponsePayload(response);
  return {
    response,
    payload,
    url: request.url.toString(),
    filters: request.filters,
    page: request.page,
    size: request.size,
    sort: request.sort
  };
}

export async function searchFranceTravailEvents(env, input = {}) {
  let token = await requestAccessToken(env);
  let result = await fetchEventsOnce(env, input, token);

  if (result.response.status === 401) {
    tokenCache = { cacheKey: '', accessToken: '', expiresAt: 0 };
    token = await requestAccessToken(env);
    result = await fetchEventsOnce(env, input, token);
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
    request: {
      page: result.page,
      size: result.size,
      sort: result.sort,
      filters: result.filters
    },
    fetched_at: new Date().toISOString(),
    data: result.payload
  };
}

export function resetFranceTravailTokenCacheForTests() {
  tokenCache = { cacheKey: '', accessToken: '', expiresAt: 0 };
}

export {
  DEFAULT_EVENTS_SCOPE,
  DEFAULT_EVENTS_URL,
  EVENT_FILTER_KEYS
};
