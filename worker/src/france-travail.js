// Client France Travail — version générique multi-API.
//
// Le Worker Cloudflare `web-augmente-api` peut consulter plusieurs APIs
// officielles France Travail en lecture seule (Mes Evènements Emploi, Offres
// d'emploi v2, …). Chacune est décrite une fois dans API_DEFINITIONS et
// exposée via deux fonctions de haut niveau :
//   - une fonction `*_status` qui vérifie la configuration côté Worker sans
//     exposer aucun secret ;
//   - une fonction `search_*` qui interroge l'API officielle via OAuth 2.0
//     `client_credentials`, avec un jeton mis en cache par couple
//     (client_id, scope) dans l'isolate Cloudflare.
//
// L'endpoint de jeton OAuth est figé côté code ; chaque endpoint d'API est
// verrouillé sur HTTPS et `api.francetravail.io`. La Bonne Boîte peut suivre
// uniquement sa redirection officielle vers `labonneboite.francetravail.fr`.

const DEFAULT_TOKEN_URL = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire';
const ALLOWED_API_HOST = 'api.francetravail.io';
const ALLOWED_LBB_REDIRECT_HOST = 'labonneboite.francetravail.fr';
const TOKEN_SAFETY_MARGIN_MS = 60_000;
const TOKEN_REQUEST_TIMEOUT_MS = 12_000;

// ---------------------------------------------------------------------------
// Définitions des APIs France Travail supportées.
//
// Chaque entrée encapsule :
//   - l'étiquette affichée à l'utilisateur ;
//   - les variables d'environnement Cloudflare (scope, URL) et leurs valeurs
//     par défaut ;
//   - la méthode HTTP et le content-type attendus par l'API ;
//   - la liste blanche des filtres acceptés ;
//   - la stratégie de pagination (query params vs header Range).
// ---------------------------------------------------------------------------

const DEFAULT_EVENTS_URL = 'https://api.francetravail.io/partenaire/evenements/v1/mee/evenements';
const DEFAULT_EVENTS_SCOPE = 'api_evenementsv1 evenements';

const DEFAULT_OFFRES_URL = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';
const DEFAULT_OFFRES_SCOPE = 'api_offresdemploiv2 o2dsoffre';

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

const OFFRE_FILTER_KEYS = new Set([
  'sort',
  'domaine',
  'codeROME',
  'theme',
  'appellation',
  'secteurActivite',
  'experience',
  'typeContrat',
  'natureContrat',
  'origineOffre',
  'qualification',
  'tempsPlein',
  'commune',
  'distance',
  'departement',
  'inclureLimitrophes',
  'region',
  'paysContinent',
  'niveauFormation',
  'permis',
  'motsCles',
  'salaireMin',
  'periodeSalaire',
  'accesTravailleurHandicape',
  'offresMRS',
  'grandDomaine',
  'experienceExigence',
  'publieeDepuis',
  'minCreationDate',
  'maxCreationDate',
  'partenaires',
  'modeSelectionPartenaires',
  'dureeHebdo',
  'dureeHebdoMin',
  'dureeHebdoMax',
  'dureeContratMin',
  'dureeContratMax',
  'offresManqueCandidats',
  'entreprisesAdaptees'
]);

const EVENT_SORT_PATTERN = /^[A-Za-z0-9_.-]{1,80}$/;

const HIGH_LEVEL_SCOPES = Object.freeze({
  OFFERS: 'api_offresdemploiv2 o2dsoffre',
  ROME_SHEETS: 'api_rome-fiches-metiersv1 nomenclatureRome',
  ROMEO: 'api_romeov2',
  MARKET: 'api_stats-offres-demandes-emploiv1 offresetdemandesemploi',
  ACCESS_EMPLOYMENT: 'api_stats-perspectives-retour-emploiv1 retouremploi',
  TRAINING_OUTCOMES: 'api_stats-entrees-sorties-formationsv1 accesemploiDEformes',
  ANOTEA: 'api_anoteav1',
  LBB: 'api_labonneboitev2 search office'
});

const HIGH_LEVEL_ENDPOINTS = Object.freeze({
  OFFERS_SEARCH: 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search',
  OFFERS_DETAIL: 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/',
  ROME_JOB_SHEET: 'https://api.francetravail.io/partenaire/rome-fiches-metiers/v1/fiches-rome/fiche-metier/',
  ROMEO_JOBS: 'https://api.francetravail.io/partenaire/romeo/v2/predictionMetiers',
  MARKET_OFFERS: 'https://api.francetravail.io/partenaire/stats-offres-demandes-emploi/v1/indicateur/stat-offres',
  MARKET_DIFFICULTY: 'https://api.francetravail.io/partenaire/stats-offres-demandes-emploi/v1/indicateur/stat-perspective-employeur',
  MARKET_SALARY: 'https://api.francetravail.io/partenaire/stats-offres-demandes-emploi/v1/indicateur/salaire-rome-fap/',
  ACCESS_EMPLOYMENT: 'https://api.francetravail.io/partenaire/stats-perspectives-retour-emploi/v1/indicateur/stat-acces-emploi',
  TRAINING_ACCESS: 'https://api.francetravail.io/partenaire/stats-entrees-sorties-formations/v1/indicateur/stat-acces-emploi-sorties-formation',
  TRAINING_EXITS: 'https://api.francetravail.io/partenaire/stats-entrees-sorties-formations/v1/indicateur/stat-demandeurs-sorties-formation',
  ANOTEA_REVIEWS: 'https://api.francetravail.io/partenaire/anotea/v1/avis',
  LBB_SEARCH: 'https://api.francetravail.io/partenaire/labonneboite/v2/recherche'
});

const responseCache = new Map();
const rateNextAt = new Map();
const rateQueues = new Map();

const API_DEFINITIONS = {
  events: {
    label: 'France Travail - Mes Evènements Emploi',
    shortName: 'events',
    scopeEnv: 'FRANCE_TRAVAIL_EVENTS_SCOPE',
    urlEnv: 'FRANCE_TRAVAIL_EVENTS_URL',
    defaultScope: DEFAULT_EVENTS_SCOPE,
    defaultUrl: DEFAULT_EVENTS_URL,
    method: 'POST',
    contentType: 'application/json',
    filterKeys: EVENT_FILTER_KEYS,
    pagination: {
      kind: 'query',
      pageParam: 'page',
      sizeParam: 'size',
      sortParam: 'sort',
      defaultPage: 0,
      defaultSize: 20,
      maxSize: 100,
      defaultSort: 'dateEvenement',
      sortPattern: EVENT_SORT_PATTERN
    }
  },
  offres: {
    label: "France Travail - Offres d'emploi v2",
    shortName: 'offres',
    scopeEnv: 'FRANCE_TRAVAIL_OFFRES_SCOPE',
    urlEnv: 'FRANCE_TRAVAIL_OFFRES_URL',
    defaultScope: DEFAULT_OFFRES_SCOPE,
    defaultUrl: DEFAULT_OFFRES_URL,
    method: 'GET',
    contentType: null,
    filterKeys: OFFRE_FILTER_KEYS,
    pagination: {
      kind: 'range-header',
      headerName: 'Range',
      defaultPage: 0,
      defaultSize: 50,
      maxSize: 150
    }
  }
};

// Tokens OAuth mis en cache par couple (client_id, scope) : events et offres
// possèdent des scopes distincts et ne partagent jamais un même jeton.
const tokenCaches = new Map();

// ---------------------------------------------------------------------------
// Erreur spécialisée et helpers génériques.
// ---------------------------------------------------------------------------

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

function getDefinition(id) {
  return API_DEFINITIONS[id] || null;
}

function configuredScope(env, def) {
  return normalizedEnv(env[def.scopeEnv]) || def.defaultScope;
}

function configuredUrl(env, def) {
  return normalizedEnv(env[def.urlEnv]) || def.defaultUrl;
}

function buildApiStatus(env, def) {
  const clientId = normalizedEnv(env.FRANCE_TRAVAIL_CLIENT_ID);
  const clientSecret = normalizedEnv(env.FRANCE_TRAVAIL_CLIENT_SECRET);
  const scope = configuredScope(env, def);
  const endpointUrl = configuredUrl(env, def);
  const missing = [];
  if (!clientId) missing.push('FRANCE_TRAVAIL_CLIENT_ID');
  if (!clientSecret) missing.push('FRANCE_TRAVAIL_CLIENT_SECRET');

  let endpoint = null;
  let endpointValid = false;
  try {
    const url = new URL(endpointUrl);
    endpointValid = url.protocol === 'https:' && url.hostname === ALLOWED_API_HOST;
    if (endpointValid) endpoint = url.toString();
  } catch {
    endpointValid = false;
  }
  if (!endpointValid) missing.push(`${def.urlEnv}_VALID`);

  return {
    api: def.shortName,
    label: def.label,
    configured: missing.length === 0,
    missing,
    endpoint,
    scope,
    method: def.method,
    content_type: def.contentType,
    pagination: def.pagination.kind,
    api_host: ALLOWED_API_HOST,
    authentication: 'oauth2_client_credentials'
  };
}

function requireConfiguration(env, def) {
  const status = buildApiStatus(env, def);
  if (!status.configured) {
    throw new FranceTravailApiError(
      `france_travail_${def.shortName}_not_configured`,
      `Configuration France Travail incomplète pour ${def.label} : ${status.missing.join(', ')}.`,
      503,
      status
    );
  }
  return status;
}

function tokenCacheKey(env, scope) {
  return `${normalizedEnv(env.FRANCE_TRAVAIL_CLIENT_ID)}|${scope}`;
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

async function requestAccessToken(env, scope, shortName, preflight) {
  // Préserve le comportement historique : la configuration est vérifiée avant
  // toute consultation du cache, pour faire remonter immédiatement les erreurs
  // de configuration côté MCP plutôt qu'à l'expiration du jeton.
  if (preflight) preflight(env);
  const cacheKey = tokenCacheKey(env, scope, shortName);
  const cached = tokenCaches.get(cacheKey);
  if (cached && cached.accessToken && cached.expiresAt - TOKEN_SAFETY_MARGIN_MS > Date.now()) {
    return cached.accessToken;
  }

  const form = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: normalizedEnv(env.FRANCE_TRAVAIL_CLIENT_ID),
    client_secret: normalizedEnv(env.FRANCE_TRAVAIL_CLIENT_SECRET),
    scope
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TOKEN_REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(DEFAULT_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form.toString(),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new FranceTravailApiError(
        'france_travail_token_timeout',
        'France Travail n’a pas répondu à la demande de jeton dans le délai prévu.',
        504,
        { api: shortName }
      );
    }
    throw new FranceTravailApiError(
      'france_travail_token_network_error',
      'Impossible de joindre le service OAuth France Travail.',
      502,
      { api: shortName }
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await parseResponsePayload(response);

  if (!response.ok) {
    const errorCode = payload?.error || 'token_request_failed';
    const description = payload?.error_description || payload?.message || 'France Travail a refusé la création du jeton OAuth.';
    throw new FranceTravailApiError(
      errorCode === 'invalid_client' ? 'france_travail_invalid_client' : 'france_travail_token_failed',
      String(description),
      response.status,
      { upstream_error: errorCode, api: shortName }
    );
  }

  const tokenPayload = extractTokenPayload(payload);
  if (!tokenPayload?.access_token) {
    throw new FranceTravailApiError(
      'france_travail_token_invalid',
      'La réponse OAuth France Travail ne contient pas de jeton exploitable.',
      502,
      { api: shortName }
    );
  }

  const expiresIn = Number(tokenPayload.expires_in || 1200);
  const entry = {
    accessToken: String(tokenPayload.access_token),
    expiresAt: Date.now() + Math.max(60, expiresIn) * 1000
  };
  tokenCaches.set(cacheKey, entry);
  return entry.accessToken;
}

function normalizeFilters(filters, def) {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) return {};
  const output = {};
  for (const [key, value] of Object.entries(filters)) {
    if (!def.filterKeys.has(key) || value === undefined || value === null || value === '') continue;

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

// ---------------------------------------------------------------------------
// API : Mes Evènements Emploi (pagination via query params).
// ---------------------------------------------------------------------------

function normalizeEventsPagination(input = {}) {
  const pagination = API_DEFINITIONS.events.pagination;
  const rawPage = Number(input.page ?? pagination.defaultPage);
  const rawSize = Number(input.size ?? pagination.defaultSize);
  const page = Number.isInteger(rawPage) && rawPage >= 0 ? rawPage : pagination.defaultPage;
  const size = Number.isInteger(rawSize) ? Math.min(pagination.maxSize, Math.max(1, rawSize)) : pagination.defaultSize;
  const rawSort = typeof input.sort === 'string' && input.sort.trim() ? input.sort.trim() : pagination.defaultSort;
  const sort = pagination.sortPattern.test(rawSort) ? rawSort : pagination.defaultSort;
  return { page, size, sort };
}

function buildEventsRequest(env, input = {}) {
  const def = API_DEFINITIONS.events;
  const status = requireConfiguration(env, def);
  const { page, size, sort } = normalizeEventsPagination(input);
  const url = new URL(status.endpoint);
  url.searchParams.set(def.pagination.pageParam, String(page));
  url.searchParams.set(def.pagination.sizeParam, String(size));
  url.searchParams.set(def.pagination.sortParam, sort);
  const filters = normalizeFilters(input.filters, def);
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

// ---------------------------------------------------------------------------
// API : Offres d'emploi v2 (pagination via header Range + query params).
// ---------------------------------------------------------------------------

function normalizeOffresPagination(input = {}) {
  const pagination = API_DEFINITIONS.offres.pagination;
  const rawPage = Number(input.page ?? pagination.defaultPage);
  const rawSize = Number(input.size ?? pagination.defaultSize);
  const page = Number.isInteger(rawPage) && rawPage >= 0 ? rawPage : pagination.defaultPage;
  const size = Number.isInteger(rawSize) ? Math.min(pagination.maxSize, Math.max(1, rawSize)) : pagination.defaultSize;
  return { page, size };
}

function buildOffresRequest(env, input = {}) {
  const def = API_DEFINITIONS.offres;
  const status = requireConfiguration(env, def);
  const { page, size } = normalizeOffresPagination(input);
  const url = new URL(status.endpoint);
  const filters = normalizeFilters(input.filters, def);
  // Les filtres officiels de l'API Offres d'emploi v2 sont transportés en
  // query string ; la pagination est doublée en query (`range`) et en header
  // Range (RFC 7233) pour suivre la convention de l'API.
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  const start = page * size;
  const end = start + size - 1;
  const range = `${start}-${end}`;
  url.searchParams.set('range', range);
  return { url, filters, page, size, range };
}

async function fetchOffresOnce(env, input, token) {
  const request = buildOffresRequest(env, input);
  const url = request.url;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      Range: `items=${request.range}`
    }
  });

  const payload = await parseResponsePayload(response);
  const contentRange = response.headers.get('Content-Range') || response.headers.get('content-range');
  return {
    response,
    payload,
    url: url.toString(),
    filters: request.filters,
    page: request.page,
    size: request.size,
    range: request.range,
    contentRange
  };
}

// ---------------------------------------------------------------------------
// Exécution générique d'une recherche.
// ---------------------------------------------------------------------------

function buildRequestSummary(def, result) {
  const summary = { filters: result.filters };
  if (def.shortName === 'events') {
    summary.page = result.page;
    summary.size = result.size;
    summary.sort = result.sort;
  } else if (def.shortName === 'offres') {
    summary.page = result.page;
    summary.size = result.size;
    summary.range = result.range;
    if (result.contentRange) summary.content_range = result.contentRange;
  }
  return summary;
}

async function performSearch(env, input, def, fetchFn) {
  const scope = configuredScope(env, def);
  let token = await requestAccessToken(env, scope, def.shortName, (envRef) => requireConfiguration(envRef, def));
  let result = await fetchFn(env, input, token);

  if (result.response.status === 401) {
    tokenCaches.delete(tokenCacheKey(env, scope, def.shortName));
    token = await requestAccessToken(env, scope, def.shortName, (envRef) => requireConfiguration(envRef, def));
    result = await fetchFn(env, input, token);
  }

  if (!result.response.ok) {
    const upstreamMessage = result.payload?.message
      || result.payload?.error_description
      || result.payload?.error
      || `Erreur HTTP ${result.response.status} renvoyée par France Travail.`;
    throw new FranceTravailApiError(
      `france_travail_${def.shortName}_failed`,
      String(upstreamMessage),
      result.response.status,
      {
        endpoint: result.url,
        upstream_status: result.response.status,
        api: def.shortName
      }
    );
  }

  return {
    source: def.label,
    endpoint: result.url,
    request: buildRequestSummary(def, result),
    content_range: result.contentRange ?? null,
    fetched_at: new Date().toISOString(),
    data: result.payload
  };
}

// ---------------------------------------------------------------------------
// API publique : 4 fonctions de haut niveau.
// ---------------------------------------------------------------------------

export function franceTravailEventsStatus(env) {
  return buildApiStatus(env, API_DEFINITIONS.events);
}

export function franceTravailOffresStatus(env) {
  return buildApiStatus(env, API_DEFINITIONS.offres);
}

export async function searchFranceTravailEvents(env, input = {}) {
  return performSearch(env, input, API_DEFINITIONS.events, fetchEventsOnce);
}

export async function searchFranceTravailOffres(env, input = {}) {
  return performSearch(env, input, API_DEFINITIONS.offres, fetchOffresOnce);
}

export function resetFranceTravailTokenCacheForTests() {
  tokenCaches.clear();
  responseCache.clear();
  rateNextAt.clear();
  rateQueues.clear();
}

// ---------------------------------------------------------------------------
// Client générique réutilisable FranceTravailClient.
//
// Les exports haut niveau (searchFranceTravailEvents / searchFranceTravailOffres)
// reposent sur performSearch et n'utilisent pas cette classe : elle est destinée
// aux modules externes qui doivent interroger n'importe quel endpoint officiel
// (par exemple pour un nouveau scénario MCP) en bénéficiant gratuitement de :
//   - la mise en cache OAuth2 client_credentials dans `tokenCaches` (clé
//     `clientId|scope`) avec invalidation et renouvellement sur 401 ;
//   - la validation stricte de l'hôte initial (`https://api.francetravail.io`) ;
//   - une allowlist explicite pour les rares redirections documentées ;
//   - un timeout AbortController configurable (par défaut 15 s) ;
//   - des retries exponentiels avec jitter sur 429 / 5xx / erreurs réseau.
// ---------------------------------------------------------------------------

const CLIENT_DEFAULT_TIMEOUT_MS = 15_000;
const CLIENT_DEFAULT_MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 250;
const RETRY_MAX_DELAY_MS = 2_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoff(attempt) {
  const base = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * RETRY_BASE_DELAY_MS;
  return Math.min(RETRY_MAX_DELAY_MS, Math.round(base + jitter));
}

function combineSignals(signals) {
  const controller = new AbortController();
  for (const signal of signals) {
    if (!signal) continue;
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    if (typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    }
  }
  return controller.signal;
}

function isAbortLikeError(error) {
  if (!error) return false;
  if (error.name === 'AbortError') return true;
  return /aborted|aborted due to timeout/i.test(String(error.message || ''));
}

function safeParseUrl(url, label) {
  try {
    const parsed = new URL(url);
    const isValid = parsed.protocol === 'https:' && parsed.hostname === ALLOWED_API_HOST;
    if (!isValid) {
      throw new FranceTravailApiError(
        'france_travail_invalid_endpoint',
        `Endpoint ${label} doit utiliser https://${ALLOWED_API_HOST} (reçu : ${parsed.protocol}//${parsed.hostname}).`,
        503,
        { endpoint: url }
      );
    }
    return parsed;
  } catch (error) {
    if (error instanceof FranceTravailApiError) throw error;
    throw new FranceTravailApiError(
      'france_travail_invalid_endpoint',
      `Endpoint ${label} invalide : ${error.message}`,
      503,
      { endpoint: url }
    );
  }
}

function mapUpstreamError(response, payload, url) {
  // Do not return arbitrary upstream bodies: they may echo request credentials.
  const code = response.status === 403 ? 'france_travail_forbidden'
    : response.status === 401 ? 'france_travail_unauthorized'
    : 'france_travail_request_failed';
  const message = response.status === 403
    ? 'Accès refusé par France Travail (HTTP 403). Vérifier la souscription à cette API, les scopes et les droits de l’application.'
    : `Erreur HTTP ${response.status} renvoyée par France Travail.`;
  return new FranceTravailApiError(
    code,
    message,
    response.status,
    { endpoint: url, upstream_status: response.status }
  );
}

function defaultPreflight(env) {
  const clientId = normalizedEnv(env.FRANCE_TRAVAIL_CLIENT_ID);
  const clientSecret = normalizedEnv(env.FRANCE_TRAVAIL_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    const missing = [];
    if (!clientId) missing.push('FRANCE_TRAVAIL_CLIENT_ID');
    if (!clientSecret) missing.push('FRANCE_TRAVAIL_CLIENT_SECRET');
    throw new FranceTravailApiError(
      'france_travail_not_configured',
      `Identifiants France Travail manquants : ${missing.join(', ')}.`,
      503,
      { missing }
    );
  }
}

export class FranceTravailClient {
  constructor(env, options = {}) {
    this.env = env && typeof env === 'object' ? env : {};
    this.tokenUrl = options.tokenUrl || DEFAULT_TOKEN_URL;
    this.allowedHost = options.allowedHost || ALLOWED_API_HOST;
    this.fetchImpl = typeof options.fetch === 'function' ? options.fetch : null;
    this.timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : CLIENT_DEFAULT_TIMEOUT_MS;
    this.maxRetries = Number.isFinite(options.maxRetries) && options.maxRetries >= 0
      ? Math.floor(options.maxRetries)
      : CLIENT_DEFAULT_MAX_RETRIES;
    this.logger = typeof options.logger === 'function' ? options.logger : null;
    this.preflight = typeof options.preflight === 'function' ? options.preflight : defaultPreflight;
    this.tokenShortName = options.tokenShortName || 'generic';
  }

  _log(level, message, extra) {
    if (typeof this.logger === 'function') {
      try { this.logger(level, message, extra); } catch { /* ignore logging failures */ }
    }
  }

  _doFetch(url, init) {
    return this.fetchImpl ? this.fetchImpl(url, init) : fetch(url, init);
  }

  invalidateTokenCache() {
    tokenCaches.clear();
  }

  async getAccessToken(scope, { preflight } = {}) {
    if (!scope || typeof scope !== 'string') {
      throw new FranceTravailApiError(
        'france_travail_invalid_scope',
        'Un scope OAuth France Travail est requis pour obtenir un jeton.',
        500
      );
    }
    return requestAccessToken(
      this.env,
      scope,
      this.tokenShortName,
      preflight || this.preflight
    );
  }

  async request({
    method = 'GET',
    url,
    scope,
    headers = {},
    body,
    query,
    signal,
    timeoutMs,
    preflight,
    allowedRedirectHosts = []
  } = {}) {
    if (!url || typeof url !== 'string') {
      throw new FranceTravailApiError(
        'france_travail_invalid_request',
        'URL France Travail manquante pour la requête.',
        500
      );
    }
    if (!scope || typeof scope !== 'string') {
      throw new FranceTravailApiError(
        'france_travail_invalid_scope',
        'Scope OAuth France Travail requis pour la requête.',
        500
      );
    }

    const parsedUrl = safeParseUrl(url, scope);
    if (query && typeof query === 'object' && !Array.isArray(query)) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
          for (const item of value) {
            if (item === undefined || item === null) continue;
            parsedUrl.searchParams.append(key, String(item));
          }
        } else {
          parsedUrl.searchParams.set(key, String(value));
        }
      }
    }

    const upperMethod = String(method).toUpperCase();
    const effectiveTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : this.timeoutMs;

    const token = await this.getAccessToken(scope, { preflight });
    const finalHeaders = {
      Accept: 'application/json',
      ...(body !== undefined && body !== null
        ? { 'Content-Type': 'application/json' }
        : {}),
      Authorization: `Bearer ${token}`,
      ...headers
    };

    const redirectHosts = new Set(
      (Array.isArray(allowedRedirectHosts) ? allowedRedirectHosts : [])
        .map((host) => String(host || '').trim().toLowerCase())
        .filter(Boolean)
    );
    const init = {
      method: upperMethod,
      headers: finalHeaders,
      ...(redirectHosts.size ? { redirect: 'manual' } : {})
    };
    if (body !== undefined && body !== null) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    let attempt = 0;
    let lastError = null;

    while (attempt <= this.maxRetries) {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(new Error('timeout')),
        effectiveTimeout
      );
      init.signal = signal
        ? combineSignals([signal, controller.signal])
        : controller.signal;

      this._log('debug', 'france_travail.client.request', {
        url: parsedUrl.toString(),
        method: upperMethod,
        attempt
      });

      let response;
      let payload;
      let effectiveUrl = parsedUrl.toString();
      try {
        response = await this._doFetch(effectiveUrl, init);
        if (redirectHosts.size && [301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('Location') || response.headers.get('location');
          if (!location) {
            throw new FranceTravailApiError(
              'france_travail_redirect_missing',
              'France Travail a renvoyé une redirection sans destination.',
              502,
              { endpoint: effectiveUrl }
            );
          }
          const redirected = new URL(location, effectiveUrl);
          if (redirected.protocol !== 'https:' || !redirectHosts.has(redirected.hostname.toLowerCase())) {
            throw new FranceTravailApiError(
              'france_travail_redirect_refused',
              'Redirection France Travail refusée par la liste blanche.',
              502,
              { endpoint: effectiveUrl, redirect_host: redirected.hostname }
            );
          }
          const redirectHeaders = { ...finalHeaders };
          delete redirectHeaders.Authorization;
          delete redirectHeaders.authorization;
          const redirectInit = {
            ...init,
            method: response.status === 303 ? 'GET' : upperMethod,
            headers: redirectHeaders,
            redirect: 'error'
          };
          if (response.status === 303) delete redirectInit.body;
          effectiveUrl = redirected.toString();
          response = await this._doFetch(effectiveUrl, redirectInit);
        }
        payload = await parseResponsePayload(response);
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error;
        if (isAbortLikeError(error)) {
          if (attempt < this.maxRetries) {
            const delay = computeBackoff(attempt);
            this._log('warn', 'france_travail.client.timeout_retry', { delay, attempt });
            await sleep(delay);
            attempt += 1;
            continue;
          }
          throw new FranceTravailApiError(
            'france_travail_timeout',
            `La requête France Travail a dépassé ${effectiveTimeout}ms.`,
            504,
            { endpoint: parsedUrl.toString(), timeout_ms: effectiveTimeout }
          );
        }
        if (attempt < this.maxRetries) {
          const delay = computeBackoff(attempt);
          this._log('warn', 'france_travail.client.network_retry', {
            delay, attempt, message: error?.message
          });
          await sleep(delay);
          attempt += 1;
          continue;
        }
        if (error instanceof FranceTravailApiError) throw error;
        throw new FranceTravailApiError(
          'france_travail_network_error',
          error?.message || 'Erreur réseau vers France Travail.',
          502,
          { endpoint: parsedUrl.toString() }
        );
      }

      clearTimeout(timeoutId);

      if (response.status === 401 && attempt === 0) {
        tokenCaches.delete(tokenCacheKey(this.env, scope));
        const refreshedToken = await this.getAccessToken(scope, { preflight });
        finalHeaders.Authorization = `Bearer ${refreshedToken}`;
        attempt += 1;
        lastError = new FranceTravailApiError(
          'france_travail_unauthorized',
          'Authentification France Travail rejetée (401).',
          401,
          { endpoint: parsedUrl.toString() }
        );
        continue;
      }

      if ((response.status === 429 || response.status >= 500) && attempt < this.maxRetries) {
        const delay = computeBackoff(attempt);
        this._log('warn', 'france_travail.client.upstream_retry', {
          status: response.status, delay, attempt
        });
        lastError = new FranceTravailApiError(
          'france_travail_upstream_error',
          `Réponse upstream ${response.status} - nouvelle tentative.`,
          response.status,
          { endpoint: parsedUrl.toString() }
        );
        attempt += 1;
        await sleep(delay);
        continue;
      }

      return {
        status: response.status,
        ok: response.ok,
        headers: response.headers,
        url: effectiveUrl,
        data: payload
      };
    }

    throw lastError || new FranceTravailApiError(
      'france_travail_request_failed',
      'La requête France Travail a échoué après plusieurs tentatives.',
      502,
      { endpoint: parsedUrl.toString() }
    );
  }

  async getJson(options = {}) {
    const result = await this.request({ ...options, method: 'GET' });
    if (!result.ok) throw mapUpstreamError(result, result.data, result.url);
    return result;
  }

  async postJson(options = {}) {
    const result = await this.request({ ...options, method: 'POST' });
    if (!result.ok) throw mapUpstreamError(result, result.data, result.url);
    return result;
  }
}


// ---------------------------------------------------------------------------
// Outils haut niveau pour le MCP Recherche France Travail.
// Les caches et limites sont "best effort" par isolate Cloudflare : ils évitent
// les fan-outs inutiles mais ne constituent pas un rate limiter global.
// ---------------------------------------------------------------------------

function highLevelCacheKey(method, url, query, body) {
  return JSON.stringify([method, url, query || null, body || null]);
}

function readHighLevelCache(key) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return entry.value;
}

function writeHighLevelCache(key, value, ttlMs) {
  if (ttlMs > 0) responseCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

async function throttleHighLevel(rateKey, requestsPerSecond) {
  const interval = Math.ceil(1000 / Math.max(1, requestsPerSecond));
  const previous = rateQueues.get(rateKey) || Promise.resolve();
  const current = previous.then(async () => {
    const nextAt = rateNextAt.get(rateKey) || 0;
    const waitMs = Math.max(0, nextAt - Date.now());
    if (waitMs) await sleep(waitMs);
    rateNextAt.set(rateKey, Date.now() + interval);
  });
  rateQueues.set(rateKey, current.catch(() => {}));
  await current;
}

async function highLevelRequest(env, {
  endpoint,
  scope,
  method = 'GET',
  query,
  body,
  rateKey,
  requestsPerSecond,
  cacheTtlMs,
  allowedRedirectHosts = [],
  repeatQueryArrays = false
}) {
  const parsed = safeParseUrl(endpoint, rateKey || 'high-level');
  const queryObject = query && typeof query === 'object' ? query : null;
  if (queryObject) {
    for (const [key, value] of Object.entries(queryObject)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value) && repeatQueryArrays) {
        for (const item of value) {
          if (item === undefined || item === null || item === '') continue;
          parsed.searchParams.append(key, String(item));
        }
      } else {
        parsed.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
      }
    }
  }
  const finalUrl = parsed.toString();
  const upperMethod = String(method || 'GET').toUpperCase();
  const cacheKey = highLevelCacheKey(upperMethod, finalUrl, null, body);
  const cached = readHighLevelCache(cacheKey);
  if (cached) return cached;

  await throttleHighLevel(rateKey || 'high-level', requestsPerSecond || 10);
  const client = new FranceTravailClient(env, {
    tokenShortName: rateKey || 'high-level',
    timeoutMs: 12_000,
    maxRetries: 1
  });
  const result = upperMethod === 'POST'
    ? await client.postJson({ url: finalUrl, scope, body, allowedRedirectHosts })
    : await client.getJson({ url: finalUrl, scope, allowedRedirectHosts });
  const value = {
    data: result.data,
    status: result.status,
    content_range: result.headers?.get?.('Content-Range') || result.headers?.get?.('content-range') || null,
    endpoint: result.url
  };
  writeHighLevelCache(cacheKey, value, cacheTtlMs || 0);
  return value;
}

function uniqueStrings(values) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function extractOffers(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.resultats)) return payload.resultats;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.offres)) return payload.offres;
  return [];
}

async function predictRomeJobs(env, query, context, maxResults = 3) {
  const identifiant = crypto.randomUUID();
  const body = {
    appellations: [{
      intitule: String(query).trim(),
      identifiant,
      ...(context ? { contexte: String(context).trim() } : {})
    }],
    options: {
      nomAppelant: 'job-radar-local',
      nbResultats: Math.min(10, Math.max(1, Number(maxResults) || 3))
    }
  };
  const result = await highLevelRequest(env, {
    endpoint: HIGH_LEVEL_ENDPOINTS.ROMEO_JOBS,
    scope: HIGH_LEVEL_SCOPES.ROMEO,
    method: 'POST',
    body,
    rateKey: 'romeo',
    requestsPerSecond: 3,
    cacheTtlMs: 60 * 60 * 1000
  });
  const first = Array.isArray(result.data) ? result.data[0] : result.data;
  const predictions = Array.isArray(first?.metiersRome) ? first.metiersRome : [];
  return {
    predictions,
    codes: uniqueStrings(predictions.map((item) => item?.codeRome))
  };
}

function buildHighLevelOfferFilters(input = {}) {
  const filters = {};
  if (input.filters && typeof input.filters === 'object' && !Array.isArray(input.filters)) {
    for (const [key, value] of Object.entries(input.filters)) {
      if (OFFRE_FILTER_KEYS.has(key) && value !== undefined && value !== null && value !== '') {
        filters[key] = Array.isArray(value) ? value.join(',') : value;
      }
    }
  }
  const aliases = {
    commune: input.commune,
    distance: input.distance,
    departement: input.departement,
    region: input.region,
    typeContrat: input.type_contrat,
    experience: input.experience,
    experienceExigence: input.experience_exigence,
    publieeDepuis: input.publiee_depuis,
    salaireMin: input.salaire_min,
    periodeSalaire: input.periode_salaire,
    dureeHebdo: input.duree_hebdo,
    dureeHebdoMin: input.duree_hebdo_min,
    dureeHebdoMax: input.duree_hebdo_max,
    sort: input.sort
  };
  for (const [key, value] of Object.entries(aliases)) {
    if (value !== undefined && value !== null && value !== '') {
      filters[key] = Array.isArray(value) ? value.join(',') : value;
    }
  }
  return filters;
}

async function resolveCommunes(env, value) {
  if (value === undefined || value === null) return value;
  const entries = (Array.isArray(value) ? value : String(value).split(',')).map(v => String(v).trim());
  if (entries.every(v => /^[0-9A-B]{5}$/i.test(v))) return entries;
  const response = await highLevelRequest(env, {
    endpoint: 'https://api.francetravail.io/partenaire/offresdemploi/v2/referentiel/communes',
    scope: HIGH_LEVEL_SCOPES.OFFERS, rateKey: 'offers', requestsPerSecond: 10,
    cacheTtlMs: 24 * 60 * 60 * 1000
  });
  const communes = Array.isArray(response.data) ? response.data : response.data?.communes;
  if (!Array.isArray(communes)) throw new FranceTravailApiError('france_travail_geography_unavailable', 'Référentiel des communes indisponible.', 502);
  const normalize = v => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return entries.map(value => {
    if (/^[0-9A-B]{5}$/i.test(value)) return value.toUpperCase();
    const matches = communes.filter(c => normalize(c.libelle) === normalize(value));
    if (matches.length !== 1) throw new FranceTravailApiError('france_travail_invalid_commune', matches.length ? 'Commune ambiguë : fournir son code INSEE.' : 'Commune inconnue : vérifier son nom ou fournir son code INSEE.', 400);
    return matches[0].code;
  });
}

export async function franceTravailJobsSearch(env, input = {}) {
  defaultPreflight(env);
  const query = String(input.query || '').trim();
  const context = String(input.context || '').trim();
  const requestedRomeCodes = uniqueStrings([
    ...(Array.isArray(input.rome_codes) ? input.rome_codes : []),
    input.code_rome
  ]);
  let resolvedRomeCodes = requestedRomeCodes;
  let romeoPredictions = [];
  const warnings = [];

  if (!resolvedRomeCodes.length && query) {
    try {
      const prediction = await predictRomeJobs(env, query, context, 3);
      resolvedRomeCodes = prediction.codes.slice(0, 3);
      romeoPredictions = prediction.predictions;
      if (!resolvedRomeCodes.length) warnings.push('ROMEO n’a retourné aucun code ROME exploitable ; recherche par mots-clés utilisée.');
    } catch (error) {
      warnings.push(`ROMEO indisponible : ${error instanceof FranceTravailApiError ? error.code : 'erreur_inconnue'} ; recherche par mots-clés utilisée.`);
    }
  }

  const communes = await resolveCommunes(env, input.commune_code ?? input.commune);
  const filters = buildHighLevelOfferFilters({ ...input, commune: communes });
  if (resolvedRomeCodes.length) filters.codeROME = resolvedRomeCodes.join(',');
  else if (query) filters.motsCles = query;
  if (!Object.keys(filters).length) {
    throw new FranceTravailApiError('france_travail_jobs_query_missing', 'Une requête, un code ROME ou au moins un filtre est requis.', 400);
  }

  const maxResults = Math.min(150, Math.max(1, Number(input.max_results) || 25));
  filters.range = `0-${maxResults - 1}`;
  const result = await highLevelRequest(env, {
    endpoint: HIGH_LEVEL_ENDPOINTS.OFFERS_SEARCH,
    scope: HIGH_LEVEL_SCOPES.OFFERS,
    query: filters,
    rateKey: 'offers',
    requestsPerSecond: 10,
    cacheTtlMs: 45_000
  });

  return {
    source: "France Travail - Offres d'emploi v2",
    fetched_at: new Date().toISOString(),
    query_normalization: {
      original_query: query || null,
      context: context || null,
      requested_rome_codes: requestedRomeCodes,
      resolved_rome_codes: resolvedRomeCodes,
      romeo_predictions: romeoPredictions
    },
    request: { max_results: maxResults, filters },
    content_range: result.content_range,
    offers: extractOffers(result.data),
    data: result.data,
    warnings
  };
}


function normalizeStringList(value) {
  if (Array.isArray(value)) return uniqueStrings(value);
  const normalized = String(value || '').trim();
  return normalized ? [normalized] : [];
}

function buildLbbSearchParams(input, romeCodes, fallbackJob) {
  const params = {};
  if (romeCodes.length) params.rome = romeCodes;
  else if (input.job) params.job = String(input.job).trim();
  else if (fallbackJob) params.job = fallbackJob;

  const listFields = [
    'domain',
    'granddomain',
    'naf',
    'city',
    'citycode',
    'postcode',
    'department',
    'department_number',
    'region',
    'region_number'
  ];
  for (const field of listFields) {
    const values = normalizeStringList(input[field]);
    if (values.length) params[field] = values;
  }

  if (input.location) params.location = String(input.location).trim();
  if (input.latitude !== undefined) params.latitude = input.latitude;
  if (input.longitude !== undefined) params.longitude = input.longitude;
  if (input.bbox) params.bbox = String(input.bbox).trim();
  if (input.distance !== undefined) params.distance = input.distance;
  params.page = Math.max(1, Number(input.page) || 1);
  params.page_size = Math.min(100, Math.max(1, Number(input.page_size) || 20));
  if (input.sort_by) params.sort_by = String(input.sort_by);
  if (input.sort_direction) params.sort_direction = String(input.sort_direction);
  return params;
}

function validateLbbSearchInput(input, hasJobCriterion) {
  if (!hasJobCriterion) {
    throw new FranceTravailApiError(
      'france_travail_lbb_job_missing',
      'La Bonne Boîte requiert un métier : query, code ROME, job, domain, granddomain ou naf.',
      400
    );
  }
  const hasLatitude = input.latitude !== undefined && input.latitude !== null;
  const hasLongitude = input.longitude !== undefined && input.longitude !== null;
  const hasDistance = input.distance !== undefined && input.distance !== null;
  const hasCityCode = normalizeStringList(input.citycode).length > 0;
  const hasDepartment = normalizeStringList(input.department).length > 0
    || normalizeStringList(input.department_number).length > 0;

  if (hasLatitude !== hasLongitude) {
    throw new FranceTravailApiError(
      'france_travail_lbb_coordinates_incomplete',
      'latitude et longitude doivent être fournies ensemble.',
      400
    );
  }
  if ((hasLatitude || hasLongitude) && !hasDistance) {
    throw new FranceTravailApiError(
      'france_travail_lbb_distance_missing',
      'Une recherche par coordonnées nécessite aussi distance.',
      400
    );
  }
  if (hasDistance && !(hasCityCode || (hasLatitude && hasLongitude))) {
    throw new FranceTravailApiError(
      'france_travail_lbb_distance_without_origin',
      'distance doit être associée à citycode ou au couple latitude/longitude.',
      400
    );
  }
  if (hasDistance && hasDepartment) {
    throw new FranceTravailApiError(
      'france_travail_lbb_distance_with_department',
      'La Bonne Boîte ne permet pas de combiner distance avec une liste de départements.',
      400
    );
  }
}

export async function franceTravailCompanyProspects(env, input = {}) {
  defaultPreflight(env);
  const query = String(input.query || '').trim();
  const context = String(input.context || '').trim();
  const requestedRomeCodes = uniqueStrings([
    ...normalizeStringList(input.rome_codes),
    input.code_rome
  ]);
  let resolvedRomeCodes = requestedRomeCodes;
  let romeoPredictions = [];
  const warnings = [];

  const explicitJobCriterion = Boolean(
    input.job
    || normalizeStringList(input.domain).length
    || normalizeStringList(input.granddomain).length
    || normalizeStringList(input.naf).length
    || requestedRomeCodes.length
  );

  if (!explicitJobCriterion && query) {
    try {
      const prediction = await predictRomeJobs(env, query, context, 3);
      resolvedRomeCodes = prediction.codes.slice(0, 3);
      romeoPredictions = prediction.predictions;
      if (!resolvedRomeCodes.length) {
        warnings.push('ROMEO n’a retourné aucun code ROME exploitable ; La Bonne Boîte utilisera la recherche libre job.');
      }
    } catch (error) {
      warnings.push(`ROMEO indisponible : ${error instanceof FranceTravailApiError ? error.code : 'erreur_inconnue'} ; La Bonne Boîte utilisera la recherche libre job.`);
    }
  }

  const hasJobCriterion = Boolean(
    resolvedRomeCodes.length
    || input.job
    || query
    || normalizeStringList(input.domain).length
    || normalizeStringList(input.granddomain).length
    || normalizeStringList(input.naf).length
  );
  validateLbbSearchInput(input, hasJobCriterion);

  const params = buildLbbSearchParams(
    input,
    resolvedRomeCodes,
    resolvedRomeCodes.length ? '' : query
  );

  const result = await highLevelRequest(env, {
    endpoint: HIGH_LEVEL_ENDPOINTS.LBB_SEARCH,
    scope: HIGH_LEVEL_SCOPES.LBB,
    query: params,
    rateKey: 'la-bonne-boite',
    requestsPerSecond: 2,
    cacheTtlMs: 6 * 60 * 60 * 1000,
    allowedRedirectHosts: [ALLOWED_LBB_REDIRECT_HOST],
    repeatQueryArrays: true
  });

  const data = result.data && typeof result.data === 'object' ? result.data : {};
  const companies = Array.isArray(data.items) ? data.items : [];
  return {
    source: 'France Travail - La Bonne Boîte v2',
    fetched_at: new Date().toISOString(),
    update_frequency: 'monthly',
    query_normalization: {
      original_query: query || null,
      context: context || null,
      requested_rome_codes: requestedRomeCodes,
      resolved_rome_codes: resolvedRomeCodes,
      romeo_predictions: romeoPredictions
    },
    request: {
      page: params.page,
      page_size: params.page_size,
      filters: params
    },
    hits: Number.isFinite(Number(data.hits)) ? Number(data.hits) : null,
    companies,
    resolved_params: data.resolved_params || null,
    data,
    warnings
  };
}

function findRomeCode(offer) {
  return [
    offer?.romeCode,
    offer?.codeRome,
    offer?.rome?.code,
    offer?.rome?.codeRome
  ].map((value) => String(value || '').trim()).find(Boolean) || null;
}

async function fetchRomeJobSheet(env, romeCode) {
  const code = String(romeCode || '').trim();
  if (!code) throw new FranceTravailApiError('france_travail_rome_code_missing', 'Code ROME absent.', 400);
  const result = await highLevelRequest(env, {
    endpoint: HIGH_LEVEL_ENDPOINTS.ROME_JOB_SHEET + encodeURIComponent(code),
    scope: HIGH_LEVEL_SCOPES.ROME_SHEETS,
    rateKey: 'rome-sheets',
    requestsPerSecond: 1,
    cacheTtlMs: 24 * 60 * 60 * 1000
  });
  return result.data;
}

export async function franceTravailJobAnalyze(env, input = {}) {
  defaultPreflight(env);
  const offerId = String(input.offer_id || '').trim();
  if (!offerId) throw new FranceTravailApiError('france_travail_offer_id_missing', "Identifiant d'offre absent.", 400);

  const detail = await highLevelRequest(env, {
    endpoint: HIGH_LEVEL_ENDPOINTS.OFFERS_DETAIL + encodeURIComponent(offerId),
    scope: HIGH_LEVEL_SCOPES.OFFERS,
    rateKey: 'offers',
    requestsPerSecond: 10,
    cacheTtlMs: 5 * 60 * 1000
  });
  const offer = detail.data;
  const romeCode = findRomeCode(offer);
  const warnings = [];
  let rome = null;
  if (romeCode) {
    try {
      rome = await fetchRomeJobSheet(env, romeCode);
    } catch (error) {
      warnings.push(`Fiche ROME indisponible : ${error instanceof FranceTravailApiError ? error.code : 'erreur_inconnue'}.`);
    }
  } else {
    warnings.push("Aucun code ROME n'a été trouvé dans le détail de l'offre.");
  }

  return {
    source: "France Travail - analyse d'offre",
    fetched_at: new Date().toISOString(),
    offer_id: offerId,
    rome_code: romeCode,
    offer,
    rome,
    requirements: {
      competences: Array.isArray(offer?.competences) ? offer.competences : [],
      formations: Array.isArray(offer?.formations) ? offer.formations : [],
      permis: Array.isArray(offer?.permis) ? offer.permis : [],
      langues: Array.isArray(offer?.langues) ? offer.langues : [],
      experience: offer?.experienceExige || offer?.experienceLibelle || offer?.experience || null,
      salary: offer?.salaire || null,
      contract: offer?.typeContratLibelle || offer?.typeContrat || null
    },
    warnings
  };
}

function statsCodeList(value) {
  return uniqueStrings(Array.isArray(value) ? value : String(value ?? '').split(','));
}

function buildStatsCriteria(input = {}) {
  const romeCode = String(input.rome_code || input.code_rome || '').trim();
  if (!romeCode) throw new FranceTravailApiError('france_travail_rome_code_missing', 'Code ROME requis.', 400);
  const criteria = {
    codeTypeActivite: 'ROME',
    codeActivite: romeCode,
    codeTypePeriode: 'TRIMESTRE',
    codeTypeTerritoire: 'NAT',
    codeTerritoire: 'FR',
    dernierePeriode: true
  };
  if (input.territory && typeof input.territory === 'object') {
    const type = String(input.territory.type || '').trim();
    const code = String(input.territory.code || '').trim();
    if ((type && !code) || (!type && code)) {
      throw new FranceTravailApiError('france_travail_invalid_territory', 'Le type et le code du territoire doivent être fournis ensemble.', 400);
    }
    if (type && code) {
      const aliases = { DEPARTEMENT: 'DEP', REGION: 'REG', NATIONAL: 'NAT' };
      criteria.codeTypeTerritoire = aliases[type.toUpperCase()] || type.toUpperCase();
      criteria.codeTerritoire = code;
    }
  }
  const periods = statsCodeList(input.period_codes);
  if (periods.length) {
    criteria.listeCodePeriode = periods;
    criteria.dernierePeriode = false;
  }
  if (typeof input.without_characteristics === 'boolean') criteria.sansCaracteristiques = input.without_characteristics;
  return criteria;
}

function withStatsNomenclature(criteria, type, codes) {
  const result = { ...criteria, codeTypeNomenclature: type };
  const list = statsCodeList(codes);
  if (list.length) result.listeCodeNomenclature = list;
  return result;
}

export async function franceTravailStatsReference(env, input = {}) {
  defaultPreflight(env);
  const apis = {
    market: { base: 'stats-offres-demandes-emploi', scope: HIGH_LEVEL_SCOPES.MARKET, rateKey: 'market' },
    access: { base: 'stats-perspectives-retour-emploi', scope: HIGH_LEVEL_SCOPES.ACCESS_EMPLOYMENT, rateKey: 'access-employment' },
    training: { base: 'stats-entrees-sorties-formations', scope: HIGH_LEVEL_SCOPES.TRAINING_OUTCOMES, rateKey: 'training-outcomes' }
  };
  const resources = {
    indicator_catalogue: 'details-indicateurs',
    activity_types: 'type-activites', activities: 'activites',
    nomenclature_types: 'type-nomenclatures', nomenclatures: 'nomenclatures',
    period_types: 'type-periodes', periods: 'periodes',
    territory_types: 'type-territoires', territories: 'territoires'
  };
  if (!Object.hasOwn(apis, input.api) || !Object.hasOwn(resources, input.resource)) {
    throw new FranceTravailApiError('france_travail_invalid_reference', 'API ou ressource de référentiel inconnue.', 400);
  }
  const typeCode = String(input.type_code || '').trim();
  const indicatorCode = String(input.indicator_code || '').trim();
  if ((typeCode && !/^[A-Za-z0-9_-]{1,40}$/.test(typeCode)) || (indicatorCode && !/^[A-Za-z0-9_-]{1,40}$/.test(indicatorCode))) {
    throw new FranceTravailApiError('france_travail_invalid_reference', 'Code de référentiel invalide.', 400);
  }
  if (typeCode && !['activities', 'nomenclatures', 'periods', 'territories'].includes(input.resource)) {
    throw new FranceTravailApiError('france_travail_invalid_reference', 'type_code ne s’applique pas à cette ressource.', 400);
  }
  if (indicatorCode && input.resource !== 'indicator_catalogue') {
    throw new FranceTravailApiError('france_travail_invalid_reference', 'indicator_code requiert indicator_catalogue.', 400);
  }
  const api = apis[input.api];
  const endpoint = `https://api.francetravail.io/partenaire/${api.base}/v1/referentiel/${resources[input.resource]}${typeCode ? '/' + encodeURIComponent(typeCode) : ''}`;
  const result = await highLevelRequest(env, {
    endpoint, scope: api.scope,
    query: indicatorCode ? { codeIndicateur: indicatorCode } : undefined,
    rateKey: api.rateKey, requestsPerSecond: 10,
    cacheTtlMs: 12 * 60 * 60 * 1000
  });
  return { source: 'France Travail - référentiel statistique', fetched_at: new Date().toISOString(), api: input.api, resource: input.resource, endpoint: result.endpoint, data: result.data };
}

function settledData(name, settled, warnings, sectionErrors) {
  if (settled.status === 'fulfilled') return settled.value.data;
  const error = settled.reason;
  const known = error instanceof FranceTravailApiError;
  const diagnostic = {
    code: known ? error.code : 'france_travail_internal_error',
    status: known ? error.status : 500,
    upstream_status: known ? error.details?.upstream_status ?? null : null,
    endpoint: known ? error.details?.endpoint?.split('?')[0] ?? null : null
  };
  sectionErrors[name] = diagnostic;
  warnings.push(`${name} indisponible : ${diagnostic.code} (HTTP ${diagnostic.status}).`);
  return null;
}

function analysisStatus(sections, sectionErrors) {
  const available = Object.values(sections).some(value => value !== null && value !== undefined);
  if (!available) return 'unavailable';
  return Object.keys(sectionErrors).length ? 'partial' : 'ok';
}

export async function franceTravailMarketAnalysis(env, input = {}) {
  defaultPreflight(env);
  const criteria = buildStatsCriteria(input);
  // Each indicator has a distinct contract. A nomenclature cannot be reused
  // across offers, access to employment, and annual recruitment tensions.
  const offersCriteria = withStatsNomenclature(criteria, input.nomenclature_type || 'ORIGINEOFF', input.nomenclature_codes);
  const accessCriteria = withStatsNomenclature(criteria, input.access_nomenclature_type || 'DUREEEMP', input.access_nomenclature_codes);
  const sectionCriteria = { offers_statistics: offersCriteria, access_to_employment: accessCriteria };
  const calls = [
    ['offers_statistics', highLevelRequest(env, {
      endpoint: HIGH_LEVEL_ENDPOINTS.MARKET_OFFERS,
      scope: HIGH_LEVEL_SCOPES.MARKET,
      method: 'POST',
      body: offersCriteria,
      rateKey: 'market',
      requestsPerSecond: 10,
      cacheTtlMs: 6 * 60 * 60 * 1000
    })],
    ['access_to_employment', highLevelRequest(env, {
      endpoint: HIGH_LEVEL_ENDPOINTS.ACCESS_EMPLOYMENT,
      scope: HIGH_LEVEL_SCOPES.ACCESS_EMPLOYMENT,
      method: 'POST',
      body: accessCriteria,
      rateKey: 'access-employment',
      requestsPerSecond: 10,
      cacheTtlMs: 6 * 60 * 60 * 1000
    })]
  ];
  if (input.include_difficulty) {
    const difficultyCriteria = withStatsNomenclature({ ...criteria, codeTypePeriode: 'ANNEE', dernierePeriode: true }, 'TYPE_TENSION');
    delete difficultyCriteria.listeCodePeriode;
    const years = statsCodeList(input.difficulty_period_codes);
    if (years.length) {
      difficultyCriteria.listeCodePeriode = years;
      difficultyCriteria.dernierePeriode = false;
    }
    sectionCriteria.recruitment_difficulty = difficultyCriteria;
    calls.push(['recruitment_difficulty', highLevelRequest(env, {
      endpoint: HIGH_LEVEL_ENDPOINTS.MARKET_DIFFICULTY,
      scope: HIGH_LEVEL_SCOPES.MARKET,
      method: 'POST',
      body: difficultyCriteria,
      rateKey: 'market',
      requestsPerSecond: 10,
      cacheTtlMs: 6 * 60 * 60 * 1000
    })]);
  }
  if (input.include_salary) {
    const salaryCriteria = { codeTypeTerritoire: criteria.codeTypeTerritoire, codeTerritoire: criteria.codeTerritoire, codeRome: criteria.codeActivite };
    sectionCriteria.salary_statistics = salaryCriteria;
    calls.push(['salary_statistics', highLevelRequest(env, {
      endpoint: HIGH_LEVEL_ENDPOINTS.MARKET_SALARY + encodeURIComponent(salaryCriteria.codeTypeTerritoire) + '/' + encodeURIComponent(salaryCriteria.codeTerritoire),
      scope: HIGH_LEVEL_SCOPES.MARKET,
      query: { codeRome: salaryCriteria.codeRome },
      rateKey: 'market',
      requestsPerSecond: 10,
      cacheTtlMs: 6 * 60 * 60 * 1000
    })]);
  }

  const results = await Promise.allSettled(calls.map(([, promise]) => promise));
  const warnings = [];
  const sections = {};
  const sectionErrors = {};
  results.forEach((result, index) => {
    sections[calls[index][0]] = settledData(calls[index][0], result, warnings, sectionErrors);
  });
  return {
    source: "France Travail - Marché du travail et accès à l'emploi",
    status: analysisStatus(sections, sectionErrors),
    fetched_at: new Date().toISOString(),
    rome_code: criteria.codeActivite,
    criteria,
    section_criteria: sectionCriteria,
    sections,
    section_errors: sectionErrors,
    warnings
  };
}

function buildAnoteaQuery(input = {}) {
  const query = {};
  for (const [key, value] of Object.entries({
    organisme_formateur: input.organisme_formateur,
    formacode: input.formacode,
    certif_info: input.certif_info,
    lieu_de_formation: input.postcode
  })) {
    const normalized = String(value ?? '').trim();
    if (normalized) query[key] = normalized;
  }
  query.page = Math.max(0, Number(input.page) || 0);
  query.items_par_page = Math.min(200, Math.max(1, Number(input.items_per_page) || 50));
  return query;
}

export async function franceTravailTrainingAnalysis(env, input = {}) {
  defaultPreflight(env);
  const criteria = buildStatsCriteria(input);
  const exitsCriteria = { ...criteria };
  const sectionCriteria = { training_exits: exitsCriteria };
  const notRequested = {};
  let accessCriteria = null;
  if (input.training_activity) {
    const type = String(input.training_activity.type || '').trim();
    const code = String(input.training_activity.code || '').trim();
    if (!type || !code) throw new FranceTravailApiError('france_travail_invalid_training_activity', 'training_activity requiert type et code issus du référentiel formation.', 400);
    accessCriteria = withStatsNomenclature({ ...criteria, codeTypeActivite: type, codeActivite: code }, input.nomenclature_type || 'ACCESEMP', input.nomenclature_codes);
    sectionCriteria.training_access_to_employment = accessCriteria;
  }
  const calls = [
    ['training_exits', highLevelRequest(env, {
      endpoint: HIGH_LEVEL_ENDPOINTS.TRAINING_EXITS,
      scope: HIGH_LEVEL_SCOPES.TRAINING_OUTCOMES,
      method: 'POST',
      body: exitsCriteria,
      rateKey: 'training-outcomes',
      requestsPerSecond: 10,
      cacheTtlMs: 6 * 60 * 60 * 1000
    })]
  ];

  if (accessCriteria) {
    calls.push(['training_access_to_employment', highLevelRequest(env, {
      endpoint: HIGH_LEVEL_ENDPOINTS.TRAINING_ACCESS,
      scope: HIGH_LEVEL_SCOPES.TRAINING_OUTCOMES,
      method: 'POST',
      body: accessCriteria,
      rateKey: 'training-outcomes',
      requestsPerSecond: 10,
      cacheTtlMs: 6 * 60 * 60 * 1000
    })]);
  } else {
    notRequested.training_access_to_employment = 'training_activity_required';
  }

  const anoteaQuery = buildAnoteaQuery(input);
  const { page, items_par_page, ...anoteaFilters } = anoteaQuery;
  const hasAnoteaFilter = Object.keys(anoteaFilters).length > 0;
  const anoteaContext = {
    filters: anoteaFilters,
    rome_filter_applied: false,
    scope: anoteaFilters.certif_info || anoteaFilters.formacode ? 'formation'
      : anoteaFilters.organisme_formateur ? 'organisme'
      : anoteaFilters.lieu_de_formation ? 'geographique' : null
  };
  if (hasAnoteaFilter) {
    calls.push(['anotea_reviews', highLevelRequest(env, {
      endpoint: HIGH_LEVEL_ENDPOINTS.ANOTEA_REVIEWS,
      scope: HIGH_LEVEL_SCOPES.ANOTEA,
      query: anoteaQuery,
      rateKey: 'anotea',
      requestsPerSecond: 8,
      cacheTtlMs: 6 * 60 * 60 * 1000
    })]);
  }

  const results = await Promise.allSettled(calls.map(([, promise]) => promise));
  const warnings = [];
  const sections = {};
  const sectionErrors = {};
  results.forEach((result, index) => {
    sections[calls[index][0]] = settledData(calls[index][0], result, warnings, sectionErrors);
  });
  if (!input.training_activity) {
    sections.training_access_to_employment = null;
    warnings.push('L’accès à l’emploi après formation requiert training_activity (type et code du référentiel formation). Consulter france_travail_stats_reference, api=training, resource=activities, type_code=FORM14. Aucun domaine de formation n’est déduit du ROME.');
  }
  if (!hasAnoteaFilter) {
    sections.anotea_reviews = null;
    warnings.push('Anotéa non interrogé : fournir certif_info, formacode, postcode ou organisme_formateur.');
  } else {
    warnings.push('Les avis Anotéa sont filtrés par les critères de anotea_context, jamais par code ROME. Leur lien avec le métier demandé n’est pas établi.');
    if (anoteaContext.scope !== 'formation') {
      warnings.push('Sans certif_info ou formacode, les avis couvrent plusieurs domaines de formation : ne pas les utiliser pour évaluer ce métier.');
    }
  }

  let market = null;
  if (input.include_market !== false) {
    try {
      market = await franceTravailMarketAnalysis(env, {
        rome_code: criteria.codeActivite,
        territory: input.territory,
        include_difficulty: Boolean(input.include_difficulty),
        include_salary: Boolean(input.include_salary),
        period_codes: input.period_codes,
        without_characteristics: input.without_characteristics
      });
      if (market.status !== 'ok') warnings.push(`Analyse marché ${market.status} : consulter market.section_errors.`);
    } catch (error) {
      settledData('market', { status: 'rejected', reason: error }, warnings, sectionErrors);
    }
  }

  const combinedSections = market ? { ...sections, ...market.sections } : sections;
  const combinedErrors = market ? { ...sectionErrors, ...market.section_errors } : sectionErrors;

  return {
    source: "France Travail - formation, débouchés et avis",
    status: analysisStatus(combinedSections, combinedErrors),
    fetched_at: new Date().toISOString(),
    rome_code: criteria.codeActivite,
    criteria,
    section_criteria: sectionCriteria,
    not_requested: notRequested,
    sections,
    section_errors: sectionErrors,
    anotea_context: anoteaContext,
    market,
    warnings
  };
}

export {
  ALLOWED_API_HOST,
  API_DEFINITIONS,
  DEFAULT_EVENTS_SCOPE,
  DEFAULT_EVENTS_URL,
  DEFAULT_OFFRES_SCOPE,
  DEFAULT_OFFRES_URL,
  EVENT_FILTER_KEYS,
  EVENT_SORT_PATTERN,
  OFFRE_FILTER_KEYS,
  getDefinition
};
