# OGC ESPORTS Portal — Fresh Setup

This is a static GitHub Pages + Supabase project. It reuses the existing bucket names:
- `ogc-player-submissions`
- `ogc-doubt-attachments`

## 1) Configure Supabase
1. Open `config.js` and replace `PASTE_YOUR_SUPABASE_PROJECT_URL_HERE` and `PASTE_YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY_HERE` with your Supabase Project URL and publishable/anon key.
2. Never paste a `service_role` key into this file.

## 2) Database SQL
1. Open Supabase → SQL Editor.
2. Back up your current database first if it contains live data.
3. Run `supabase-schema.sql`. It uses `CREATE TABLE IF NOT EXISTS` and adds the event and doubt tables plus RLS policies. Review policy names if you already have custom policies.
4. Confirm both storage buckets already exist and are private. This project expects the exact names above.

## 3) Create the owner
1. Create the owner login through Supabase → Authentication → Users (or sign up through the app as a member, then promote only the intended account).
2. After the owner has a profile row, run this SQL with the owner's actual auth UUID and email. Do not share the UUID publicly:

```sql
update public.profiles
set account_type = 'owner', status = 'approved', member_access_approved = true
where id = 'PASTE_OWNER_AUTH_USER_UUID';
```

If no profile row exists yet, first create a normal account using the site and then promote that account. Never allow public signup to choose owner status.

## 4) Publish on GitHub Pages
Upload/replace the files in this folder at the repository root: `index.html`, `style.css`, `config.js`, `app.js`. Keep `supabase-schema.sql` and this README for setup/reference. In GitHub: Settings → Pages → deploy from your chosen branch and root folder.

## Permissions in this build
- Owner: full management, including sessions and tournament schedules; can delete events.
- Member/manager: can view sessions; can create and edit tournament schedules but cannot delete them.
- Player: can submit drill proof and Lobby OS screenshots from the device gallery, and can ask doubts with optional attachments.
- Managers do not see player submission forms.

## Uploads
- Drills and Lobby OS proof: private bucket `ogc-player-submissions`.
- Doubt attachments: private bucket `ogc-doubt-attachments`.
- Proof files are opened through temporary signed URLs.

## Test before using live
Test owner login, member login, player login, event create/edit permissions, one small image upload, and a doubt with/without an attachment. RLS and Storage policy behavior depends on the policies already present in your Supabase project.
