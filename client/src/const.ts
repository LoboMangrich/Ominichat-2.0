export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;

  if (!oauthPortalUrl) {
    console.warn("VITE_OAUTH_PORTAL_URL não configurado — login indisponível.");
    return "/";
  }

  // Deliberadamente NÃO usa client/src/lib/publicUrl.ts aqui: este redirectUri
  // precisa bater exatamente com o valor cadastrado no provedor OAuth. Torná-lo
  // configurável via VITE_PUBLIC_BASE_URL abriria um jeito de quebrar o login
  // sem ninguém perceber. Tratar junto da migração de autenticação própria.
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};