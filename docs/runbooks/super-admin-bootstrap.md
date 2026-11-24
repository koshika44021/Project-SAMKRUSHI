# Runbook: first super_admin bootstrap and recovery

ADR-0005 §9. There is no public staff registration. The first `super_admin` is created once, from the environment. All later staff are created in **Staff / Users**.

## Bootstrap (new environment)

1. Apply migrations to the target project. Locally: `pnpm db:reset`.
2. Provide credentials **only through the environment**: a shell session, or the git-ignored `apps/admin-web/.env.local`. Never commit them and never paste them into tickets or chat.

   ```bash
   export SUPABASE_URL=...                # project API URL
   export SUPABASE_SECRET_KEY=...         # secret/service-role key (server-only)
   export BOOTSTRAP_ADMIN_EMAIL=...
   export BOOTSTRAP_ADMIN_PASSWORD=...    # ≥12 chars, upper+lower+digit (Auth policy)
   export BOOTSTRAP_ADMIN_NAME="..."
   pnpm bootstrap:super-admin
   ```

3. The script:
   - refuses if any `super_admin` exists;
   - creates the Auth user (email confirmed);
   - calls `bootstrap_first_super_admin`, which is service-role only, serialized by an advisory lock and audited with source `bootstrap`;
   - rolls back the Auth user if the database step fails.
4. Clear the shell history or variables. Store the password in the team password manager.
5. Sign in at `/login` and create the other staff accounts from **Staff / Users**.

## Hosted project checklist

- Auth password policy matches local `supabase/config.toml`: minimum length 12, lower/upper/digits, secure password change.
- Public sign-ups: customer auth is a Phase 5 decision. Staff access never comes from a sign-up, because staff roles require a staff profile created by a super_admin.

## Recovery: locked out (no usable super_admin)

The database never allows the last active super_admin to be demoted or deactivated, so a lockout means lost credentials:

1. A project owner sets a temporary password in the Supabase dashboard (Auth → Users → the super_admin).
2. Set `app_metadata.password_change_required = true` on that user, so the dashboard forces a new password at sign-in.
3. Record the action in the incident log. Auth-dashboard changes don't appear in `audit_logs`.

## Staff password reset (dev default: admin-assisted)

A super_admin uses **Staff / Users → Reset password**. This sets a temporary password, audited as `staff_auth.password_reset`, and the user must change it at next sign-in. Whether to switch to email-based reset is an open founder decision.
