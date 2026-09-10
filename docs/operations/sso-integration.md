# SSO & OIDC Integration Guide

AndJoy GitOps supports single sign-on (SSO) via OpenID Connect (OIDC). You can connect enterprise identity providers directly or via an identity broker:
- **Direct Mode**: Connecting directly to **Keycloak** or **Microsoft Entra ID (Azure AD)**.
- **Broker Mode (Recommended)**: Connecting to **Keycloak**, which in turn brokers authentication to **Microsoft Entra ID**.

---

## Architecture & Endpoints Contract

- **Protocol**: OpenID Connect (OIDC 1.0 / OAuth 2.0 Authorization Code flow)
- **Registration ID**: `oidc`
- **Initiate Login Route**: `/oauth2/authorization/oidc`
- **Callback URL (Redirect URI)**:
  - Local development: `http://localhost:8090/login/oauth2/code/oidc`
  - Production: `https://<gitops-domain>/login/oauth2/code/oidc` (e.g. `https://gitops.example.com/login/oauth2/code/oidc`)
- **Required OIDC Scopes**: `openid`, `profile`, `email`
- **Reverse Proxy Header Support**: Spring Boot automatically respects `X-Forwarded-Proto` and `X-Forwarded-Host` via `server.forward-headers-strategy: framework`.

---

## 1. Verified Working Setup: Keycloak with Microsoft Entra ID Broker (Localhost)

This configuration reflects the live-tested, verified end-to-end setup:

```
Browser (localhost:8090)
  │
  ▼
AndJoy GitOps (/oauth2/authorization/oidc)
  │
  ▼
Keycloak (https://<keycloak-domain>/realms/<realm-name>)
  │
  ▼
Microsoft Entra ID (https://login.microsoftonline.com/...)
```

### A. Reverse Proxy / Nginx Proxy Manager Settings for Keycloak
> [!IMPORTANT]
> In your reverse proxy (e.g. Nginx Proxy Manager) for your Keycloak host (`kc.example.com`):
> - **"Block Common Exploits" MUST be OFF**.
>   When enabled, anti-SSRF/RFI rules block any query parameter matching `redirect_uri=http://...` with an HTTP 403 Forbidden error.
> - **Websockets Support**: `ON`.

### B. Keycloak Realm & Client Settings
1. **Realm**: `gitops` (or your chosen realm)
2. **Client ID**: `gitops` *(case-sensitive)*
3. **Capability Config**:
   - Client authentication: `ON` (Confidential)
   - Authentication flow: `Standard flow` checked
4. **Login Settings**:
   - **Valid redirect URIs**:
     ```text
     http://localhost:8090/login/oauth2/code/oidc
     ```
   - **Web origins**: `+` (or `http://localhost:8090`)
5. **Credentials**: Copy the Client Secret from the **Credentials** tab.

### C. Keycloak &rarr; Microsoft Entra ID Broker Setup
1. In Keycloak realm settings, go to **Identity providers** &rarr; select **OpenID Connect v1.0** (or **Microsoft**):
   - **Alias**: `oidc`
   - **Display name**: `Microsoft Entra ID`
   - **Discovery endpoint**: `https://login.microsoftonline.com/<your-tenant-id>/v2.0/.well-known/openid-configuration`
   - **Client ID**: Azure App (client) ID
   - **Client Secret**: Azure App Secret value
   - **Hide on login page**: `OFF` *(ensures button renders on Keycloak login)*
2. In **Microsoft Entra Admin Center** &rarr; **App registrations** &rarr; select application &rarr; **Authentication** &rarr; **Web**:
   - Add this Redirect URI:
     ```text
     https://<keycloak-domain>/realms/<realm-name>/broker/oidc/endpoint
     ```
     *(Example: `https://kc.example.com/realms/gitops/broker/oidc/endpoint`)*.
   *(Note: The `/oidc/` path corresponds to the Keycloak IdP Alias configured above).*

### D. AndJoy GitOps Configuration (Authentications Page)
Navigate to **Authentications** in AndJoy GitOps:

| Field | Value |
| :--- | :--- |
| **Enable SSO** | `ON` |
| **Enable Local Login** | `ON` *(safe fallback)* |
| **SSO Provider Name** | `Keycloak` |
| **Issuer URI** | `https://<keycloak-domain>/realms/<realm-name>` |
| **Client ID** | `gitops` |
| **Client Secret** | `<Client Secret from Keycloak Credentials tab>` |
| **Group Claim Name** | `roles` *(or `groups`)* |
| **Admin Group Value** | `admin` |

---

## 2. Deploying to Real Domain (Production)

When pointing a production domain (e.g. `https://gitops.example.com`) to AndJoy GitOps through Nginx Proxy Manager, follow these steps:

### Step 1: Configure Nginx Proxy Manager for the Dashboard Domain
1. Open Nginx Proxy Manager Admin.
2. Go to **Proxy Hosts** &rarr; click **Add Proxy Host**:
   - **Domain Names**: `gitops.example.com`
   - **Scheme**: `http`
   - **Forward Hostname / IP**: `andjoy-gitops` *(if in same Docker network)* or container host IP
   - **Forward Port**: `8090`
   - **Cache Assets**: `OFF`
   - **Block Common Exploits**: `ON` *(safe to enable because the redirect URI uses `https://`)*
   - **Websockets Support**: `ON`
3. In the **SSL** tab:
   - Select or request a new **Let's Encrypt Certificate**
   - **Force SSL**: `ON`
   - **HTTP/2 Support**: `ON`
   - **HSTS Enabled**: `ON`
4. Click **Save**.

### Step 2: Update Keycloak Client
1. Log in to Keycloak Admin Console (`https://<keycloak-domain>/admin/`).
2. Select your Realm &rarr; **Clients** &rarr; click your client (e.g. `gitops`).
3. Under **Login settings**, add the production URLs:
   - **Valid redirect URIs**:
     ```text
     https://gitops.example.com/login/oauth2/code/oidc
     http://localhost:8090/login/oauth2/code/oidc
     ```
     *(Keep localhost if you also develop locally).*
   - **Valid post logout redirect URIs**:
     ```text
     https://gitops.example.com/login
     http://localhost:8090/login
     ```
   - **Web origins**:
     ```text
     https://gitops.example.com
     http://localhost:8090
     ```
4. Click **Save**.

### Step 3: Microsoft Entra ID
> [!NOTE]
> **No changes needed in Azure Entra ID!**
> Because Entra ID only communicates directly with Keycloak (`https://<keycloak-domain>/realms/<realm-name>/broker/oidc/endpoint`), the change in frontend domain to `https://gitops.example.com` does not alter Entra ID's registered redirect URI.

### Step 4: Verification
1. Open a new private browser window.
2. Navigate to `https://gitops.example.com/login`.
3. Click **Sign in with Keycloak**.
4. You will be redirected to Keycloak &rarr; click **Microsoft Entra ID**.
5. Authenticate with your Microsoft credentials.
6. Keycloak completes authentication and redirects back to `https://gitops.example.com/dashboard`.

---

## 3. Environment Variable Fallback (Optional)

In addition to configuring SSO via the **Authentications** UI, credentials can be specified in `.env` or Docker environment:

```env
SSO_OIDC_ISSUER_URI=https://kc.example.com/realms/gitops
SSO_OIDC_CLIENT_ID=gitops
SSO_OIDC_CLIENT_SECRET=your-keycloak-client-secret
```

Values stored in the database (`app_global_settings`) take precedence over environment variables.

---

## 4. User Provisioning & Role Mapping

1. **User Identity Linking**:
   - Matches existing local user by provider subject (`sub`) or `email`.
   - Automatically creates a new user (`oidc_<display_name>`) if no match exists.
2. **Role Mapping**:
   - Checks the claim specified in **Group Claim Name** (`roles` or `groups`).
   - If the claim contains **Admin Group Value** (`admin`), the user is assigned the `admin` role.
   - Otherwise, the user is assigned the `editor` role (viewer privileges).
3. **Session Cookie**:
   - Creates a standard secure `gcd_session` HTTP cookie.
   - When deployed with HTTPS (`SESSION_SECURE=true`), cookies are strictly sent over encrypted connections.

---

## 5. Troubleshooting & FAQ

### Issue: "Redirect URI mismatch" (AADSTS50011) in Microsoft Entra ID
- Make sure Azure App Registration &rarr; Authentication &rarr; Web Redirect URIs contains:
  `https://<keycloak-domain>/realms/<realm-name>/broker/oidc/endpoint`
  *(The path `/oidc/` must match the IdP Alias configured in Keycloak).*

### Issue: 403 Forbidden from OpenResty / Nginx Proxy Manager
- If using `http://localhost`, ensure "Block Common Exploits" is **disabled** in NPM for your Keycloak host.
- With production HTTPS (`https://gitops.example.com`), "Block Common Exploits" can safely be re-enabled.

### Issue: Accidentally locked out after disabling local login
- If SSO credentials fail and local login was toggled off, re-enable local login directly in PostgreSQL:
  ```sql
  UPDATE app_global_settings SET local_login_enabled = true;
  ```
