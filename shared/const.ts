export const COOKIE_NAME = "app_session_id";
// Login é SSO (Google Workspace) — relogar é um clique, não precisa de
// sessão de 1 ano. 30 dias equilibra conveniência sem deixar sessão presa
// para sempre num dispositivo perdido/compartilhado.
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
