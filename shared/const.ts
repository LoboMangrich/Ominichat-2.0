export const COOKIE_NAME = "app_session_id";
// Não precisa de sessão de 1 ano. 30 dias equilibra conveniência sem deixar
// sessão presa para sempre num dispositivo perdido/compartilhado — e como não
// existe "esqueci minha senha", relogar depois de expirar exige o Admin de
// novo se a pessoa também esqueceu a senha.
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
// Tamanho mínimo de senha, exigido na criação de conta e na redefinição
// (usersRouter.create/resetPassword). Sem isso, senha temporária tipo
// "123456" vira senha permanente — ninguém troca sem ser forçado.
export const MIN_PASSWORD_LENGTH = 10;
