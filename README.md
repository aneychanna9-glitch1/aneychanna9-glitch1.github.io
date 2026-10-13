# StudyHub

StudyHub is a static student workspace with Netlify-hosted community features.
The deployed frontend lives in `public/`; only that directory is published.

## Community features

- **Chats** is a dedicated sidebar page for existing friends. Messages and optional
  file attachments are saved on Netlify. Existing Firebase chat history remains
  readable in conversations.
- **Notifications** lists new messages and shared files, with an unread badge and
  controls to mark notifications as read. Open conversations and notification
  counts refresh every eight seconds while the browser tab is visible.
- **Notes & Posts** lets every signed-in student publish subject-tagged notes,
  questions, or study tips. The board shows the latest 50 posts, and authors can
  delete their own posts.

Existing Firebase accounts, profiles, and friendships remain unchanged. The
community API verifies Firebase ID tokens and checks existing friendships on the
server before allowing message access or file sharing. New messages, notifications,
and posts use Netlify Database with Drizzle ORM; file contents use private Netlify
Blobs. Downloads require authentication and conversation membership. Shared files
are limited to 3 MB and supported document, image, or ZIP extensions; files are
downloaded as attachments rather than rendered inline. Files are not malware-scanned,
so only open attachments from people you trust.

## Copying the complete code

Open **Copy Code** in the sidebar, or visit `/code.html`. **Copy this file** copies
the selected source file; **Copy complete code** copies a Node.js restoration script
containing every project source file. Paste that script into `create-studyhub.cjs`
inside an empty folder and run `node create-studyhub.cjs`, then `npm ci`. A ZIP
download is also available. The exported code is public and replaces Firebase
configuration with placeholders; environment files and deployment credentials are
never included. The working website's configuration is not changed.

After changing project source, run `npm run export:code` to refresh the source viewer
and ZIP. This export command requires the `zip` utility. After restoring a copied
project, also run it to recreate the downloadable source assets. Fill the Firebase
configuration placeholders locally; when changing Firebase projects, update the
matching project ID in `netlify/functions/community.mts` too.

## Development and deployment

The Focus Timer supports custom session lengths from 1 to 1440 whole minutes.
Enter a duration and select **Set duration** or **Start**. Pause before changing
an active session; **Reset** returns to the selected duration rather than 25 minutes.
The selected duration applies to the current page session.

Install dependencies with `npm ci`. Run `npm run typecheck` to check server-side
TypeScript. Run `netlify dev --port 8889` with the Netlify CLI for local development.
The site requires its existing Firebase project and Netlify Database/Blobs services.

Database tables are defined in `db/schema.ts`. Generate new migrations with
`npx drizzle-kit generate --name <descriptive_name>`. Netlify applies migrations
automatically during deployment; do not apply them manually. A fresh site database
is provisioned when the feature first connects after deployment.
