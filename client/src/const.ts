export const getLoginUrl = () => {
  // O servidor cuida de gerar state/PKCE e montar a URL de autorização do
  // Google (server/_core/googleAuth.ts) — o client só precisa redirecionar
  // para o endpoint que inicia o fluxo.
  return "/api/auth/google/start";
};
