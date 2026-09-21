export const getLoginUrl = () => {
  // Login por e-mail/senha é inline — DashboardLayout já mostra o formulário
  // quando não há sessão (ver LoginScreen). Isto só existe para o redirect de
  // "sessão expirou no meio do uso" (client/src/main.tsx): volta pra raiz, que
  // renderiza o formulário sozinha.
  return "/";
};
