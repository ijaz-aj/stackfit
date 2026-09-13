# Deploying StackFit

Vercel for the app, Neon for Postgres, a GitHub or Google OAuth app for sign-in.
Roughly twenty minutes, most of it waiting for other people's dashboards.

Everything here was verified locally against a real Postgres before it was
written down. What could not be verified locally is marked.

## What has to exist before anything works

Three services. You create all three; none of them can be created from here.

| Thing | Where | Why |
| --- | --- | --- |
| Postgres database | [neon.tech](https://neon.tech) | Saved scoping sessions. The free tier is enough for six analysts. |
| Vercel project | [vercel.com](https://vercel.com) | Runs the app, rebuilds on every push to `main`. |
| OAuth app | GitHub or Google | Proves who is signing in. The allowlist decides who gets in. |

## 1. Database

Create a Neon project and copy the connection string. It looks like:

```
postgresql://USER:PASSWORD@ep-something.region.aws.neon.tech/neondb?sslmode=require
```

`sslmode=require` matters. Neon refuses plaintext connections and the error if
you omit it is not obvious.

**Do not paste that string into a chat, a ticket or a commit.** It contains the
database password. It belongs in exactly two places: Vercel's environment
variables, and a local file git already ignores.

```bash
cp apps/web/.env.example apps/web/.env.local   # then set DATABASE_URL in it
pnpm --filter @stackfit/web db:push            # create the schema
pnpm --filter @stackfit/web seed               # demo sessions, optional
```

`.env.local` is enough for all three tools. It did not used to be: Next reads
it, the Prisma CLI reads only `.env`, and `tsx` reads neither, so putting the
URL where the error message told you to produced a working dev server and a
`db:push` that insisted the variable was not set. `scripts/load-env.ts` is
imported first by the CLI config and by both scripts, so they now agree.

If you already had sessions in the old SQLite file:

```bash
pnpm --filter @stackfit/web db:migrate-from-sqlite
```

The seed reads its own writes back and fails loudly if they are not there, so a
success message means the rows exist.

## 2. OAuth app

GitHub is the shorter path: **Settings → Developer settings → OAuth Apps → New**.

- Homepage URL: `https://your-app.vercel.app`
- Authorization callback URL: `https://your-app.vercel.app/api/auth/callback/github`

Google works the same way, with `/api/auth/callback/google`. The callback URL
has to match exactly, including the scheme and any trailing path.

You will not know the Vercel URL until step 3, so either do step 3 first and
come back, or set a custom domain and use that from the start.

## 3. Vercel

Import the GitHub repository. Vercel detects Next.js; the only setting that
needs changing is the root directory.

| Setting | Value |
| --- | --- |
| Root Directory | `apps/web` |
| Framework Preset | Next.js (detected) |
| Build Command | leave as detected |
| Install Command | leave as detected |

Then add the environment variables, for Production and Preview both:

```
DATABASE_URL           postgresql://...?sslmode=require
NEXTAUTH_SECRET        (openssl rand -base64 32)
NEXTAUTH_URL           https://your-app.vercel.app
GITHUB_CLIENT_ID       from step 2
GITHUB_CLIENT_SECRET   from step 2
STACKFIT_ALLOWED_EMAILS  you@example.com,colleague@example.com
```

`STACKFIT_ALLOWED_EMAILS` is the one that decides access. OAuth proves identity;
this grants it. An empty or missing list admits **nobody**, deliberately: a
configuration failure reads as "no" and never as "everyone".

### Showing it to a client, without handing them an SSO account

One optional variable adds an email-and-password form beside the OAuth buttons:

```
STACKFIT_CREDENTIAL_USERS  demo@example.com:choose-something-long
```

`email:password`, comma or newline separated. Unset means no password sign-in
exists and no form is drawn. These accounts do **not** need to be in
`STACKFIT_ALLOWED_EMAILS`: whoever writes this variable is the person who would
otherwise have written that one.

It is the weakest way in and it is deliberately opt-in. The passwords are in
the deployment's configuration in the clear, not hashed in a database, so
anyone who can read the configuration can read them, and there is no rotation,
lockout or second factor. Delete the variable and redeploy when the demo is
over. See `apps/web/src/lib/credentials.ts`.

Deleting it stops new sign-ins and does **not** end the ones already issued.
Sessions are JWTs with no server-side store, on NextAuth's default 30-day
rolling window (nothing sets `maxAge`), so there is no session table to clear:
rotating `NEXTAUTH_SECRET` invalidates every existing session and is the only
way to sign everyone out. It signs out the OAuth analysts too.

## Changing the app after it is live

Push to `main`. Vercel rebuilds and the live URL updates, usually inside two
minutes. Nothing about deploying freezes the code.

- Every push to a **branch** gets its own preview URL, so a change can be looked
  at before it reaches anyone.
- **Rollback** is one click in the Vercel dashboard, to any previous deploy.
- A change to `data/` (a price, a product, a coefficient) is a normal commit and
  ships the same way. There is no separate content step.
- A change to `prisma/schema.prisma` needs `prisma db push` against the
  production database. Nothing runs it for you.

## The two things that make this deployment specific

Both were found by building and running the real artefact rather than by
reading the code, and both would have produced a broken first deploy.

**The `data/` tree has to be traced into the bundle.** The catalog, the
framework library and eleven config files are read with `readFileSync` at a path
assembled at runtime, and a serverless deployment only uploads files the build's
tracer can see. A standalone build before `outputFileTracingIncludes` was added
contained **zero** of the 35 YAML files; after, all 35. `next start` never
catches this, because it runs from a working copy where the files are on disk
regardless. To check it without deploying, add `output: 'standalone'` to
`next.config.ts`, build, and count the YAML under `.next/standalone`.

**The Prisma client connects lazily.** `next build` imports every route to
collect its configuration, so a client constructed at module scope made
`DATABASE_URL` a build-time requirement and the build failed with "Failed to
collect configuration for /". It is now created on first property access, which
is why the app builds with no database attached.

## Verified, and not

Verified locally against Postgres 17 in Docker: schema push, seed with read-back,
the production build with no `DATABASE_URL` present, the production server
booting and gating unauthenticated requests, and every page rendering real data
in dev, including the bundles computed from the catalog.

Not verified, because it needs the real thing: the OAuth round trip, and the
traced `data/` tree being read by a Vercel function rather than by a local
standalone bundle. The first deploy is the test for both. If the catalog pages
500 with an error naming the directories it searched, that is
`config.server.ts` telling you the tree was not shipped.
