# 🎁 Wish List

A free, simple wish-list website for Christmas, birthdays, or anything else.

- **`index.html`**: the page you send to family. It's read-only and shows your list as cards with pictures, prices, notes, and a "View item" button.
- **`admin.html`**: your editor, for use on your phone or computer. You can:
  - **Paste a link** from any store. It fills in the name, picture, description, and sometimes the price.
  - **Scan a barcode** with your phone camera. It looks up the product name and picture.
  - **Snap a photo** of an item, for example something you saw in a store.
  - Edit, delete, reorder, mark items as "Top pick", and switch between lists.
- **`data.json`**: where your list is stored. The editor updates it for you.

Hosting is free with GitHub Pages. There's no server, database, or monthly cost.

---

## One-time setup (about 10 minutes)

### 1. Put the files on GitHub
1. Create a free account at <https://github.com> if you don't have one.
2. Click **+ → New repository**. Name it something like `wishlist`, set it to **Public** (Pages is free for public repos), and click **Create**.
3. On the new repo page, click **uploading an existing file**, then drag in everything from this folder (`index.html`, `admin.html`, `data.json`, `assets/`, `images/`, `README.md`). Click **Commit changes**.

### 2. Turn on the website
1. In the repo, open **Settings → Pages**.
2. Under **Build and deployment**, set Source to **Deploy from a branch**. Choose branch **main** and folder **/ (root)**, then click **Save**.
3. After a minute or two, your site is live at:
   **`https://YOUR-USERNAME.github.io/wishlist/`** ← send this link to family.
   Your editor is at **`https://YOUR-USERNAME.github.io/wishlist/admin.html`** (bookmark it).

### 3. Create a key so the editor can save
1. Go to **GitHub → your profile picture → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Name it `wishlist editor`. For **Expiration**, choose the longest option (or "No expiration").
3. For **Repository access**, choose **Only select repositories** and pick `wishlist`.
4. Under **Permissions → Repository permissions**, set **Contents** to **Read and write**.
5. Click **Generate token** and copy it. It starts with `github_pat_`.

### 4. Connect each device
Open `admin.html` on your phone and on your computer. Your username and repo name are usually filled in already. Paste the token and tap **Connect**. Each device remembers the token on its own. Nobody else sees it.

> **Phone tip:** open the editor in Safari or Chrome, then use **Share → Add to Home Screen**. It then opens like an app.

---

## Everyday use
- Changes save straight to GitHub. **Family sees updates in about a minute.**
- **Settings** lets you change your name, rename lists ("Christmas 2026", "Birthday"…), pick the colors (Christmas, Birthday, or Simple), add a message for family, and choose which list family sees first.
- To share a particular list, add `?list=birthday` to the link, e.g. `https://you.github.io/wishlist/?list=birthday`.
- To start next year fresh, rename the list in Settings and delete or edit the old items.

## Good to know
- **Link previews** use the free [microlink.io](https://microlink.io) service, which allows about 50 lookups a day. Some stores, Amazon especially, block automatic previews. When that happens, type the name, then either snap a photo or long-press the product image on the store's site, choose **Copy image address**, and paste it into the image box.
- **Barcode lookup** uses the free UPCitemdb trial (about 100 lookups a day) and Open Food Facts. Not every product is in these databases. When it isn't found, the barcode number is still saved in the description and the link goes to a Google Shopping search. Scanning needs camera permission. On iPhone, if the live camera doesn't work, tap **Use a photo of the barcode instead**.
- The repo is public, so anyone with the link can see the list (the page asks search engines not to index it). Your token is **not** stored in the repo.
- If a token expires, make a new one (step 3) and paste it into the editor again.
