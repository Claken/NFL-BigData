# Production deployment

Live report: **https://nflbuddy.nix.zone/**.

Nginx on `oci-main` serves static files from `/var/www/nflbuddy/current`. The existing Cloudflare Tunnel forwards this hostname to `http://127.0.0.1:8080`; the Nginx virtual host selects the report by its Host header. HTTPS terminates at Cloudflare and the tunnel encrypts traffic to the VPS. No new public origin port is required.

## Infrastructure

- Nginx configuration: [`nginx.conf`](nginx.conf), installed at `/etc/nginx/conf.d/nflbuddy.conf`.
- Cloudflare DNS: proxied CNAME `nflbuddy.nix.zone` → `0ba7099e-d211-4b50-9a3b-9796bdb1f561.cfargotunnel.com`.
- Tunnel `main`: one ingress rule for `nflbuddy.nix.zone` → `http://127.0.0.1:8080`, before the catch-all. Preserve the other hosts when updating its configuration.
- Use the authenticated `cf` CLI for Cloudflare changes and `ssh oci-main` for origin changes. Credentials and CLI caches are not committed.

## Update the report

Build and review the report first; see [`REPRODUCE.md`](../REPRODUCE.md). Commit the reviewed source and outputs, then stage only these public files from `outputs/multigame/`:

```text
report.html
findings.md
film_review_queue.csv
third_down_review_queue.csv
routes.csv
matched_pair.png
analysis.json
```

Use a new release directory named after the source commit, for example `/var/www/nflbuddy/releases/1e40b1530d90/`. Keep source files, raw datasets, credentials and the Git checkout out of this directory.

1. Create a local staging folder with the seven files above. Add `release.json` with the source commit, file sizes and SHA-256 hashes. Precompress text files to `.gz` beside the originals; Nginx serves these when supported. Generate `SHA256SUMS` for the staged files.
2. Create the release directory with `sudo install -d -m 0755`, then upload the staging folder:

   ```bash
   rsync -a --partial --info=progress2 --chown=root:root --chmod=D755,F644 \
     --rsync-path='sudo -n rsync' STAGING_FOLDER/ \
     oci-main:/var/www/nflbuddy/releases/RELEASE_ID/
   ```

3. On the VPS, run `sha256sum -c SHA256SUMS` inside the new release. On this SELinux-enabled host, run `sudo restorecon -RF /var/www/nflbuddy` after uploading.
4. Atomically switch the symlink, replacing `RELEASE_ID` with the new directory name:

   ```bash
   sudo ln -s releases/RELEASE_ID /var/www/nflbuddy/current.next
   sudo mv -Tf /var/www/nflbuddy/current.next /var/www/nflbuddy/current
   ```

5. When changing Nginx configuration, install `nginx.conf`, run `sudo nginx -t`, and only reload after it passes: `sudo systemctl reload nginx`. A report-only update needs no reload or tunnel change.
6. Verify HTTPS, HTTP redirection, the six companion downloads, failed-third-down review, playback, grouped-play filters, plain-language situation/outcome, copying play details, measured post-release motion, the full conditional cone and continuous shared timeline and the insufficient-sample fallback at the public URL. Compare downloaded companion files with the local SHA-256 hashes. `/release.json` identifies the deployed build.

Cloudflare may add script-loading and security scripts to public HTML. The origin report remains byte-identical to the reviewed file; use the repository copy for the fully self-contained offline artifact.

## Rollback

Keep previous release directories. Point `current.next` at the previous release and repeat the atomic `mv` above; verify the public report and `/release.json`. Do not replace the tunnel's other routes or change zone-wide settings to roll back this static site.

## Initial release verification

Deployed on 2026-10-21 from commit `1e40b1530d90d3174f624a88858d47b0765d46a0`. All uploaded file checksums passed, the origin returned the exact report bytes, public HTTPS returned 200, HTTP redirected to HTTPS, all five original companion files matched local hashes, and `/.git/config` returned 404. Public browser checks covered playback, the release endpoint, formatted play/frame details and receiver filtering.
