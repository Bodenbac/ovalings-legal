# ovalings.app

Website ovalings.app (Spielführer, Ovaling ansehen, Rechtstexte). Ausgeliefert von Cloudflare (Worker ovalings-legal,
`wrangler.jsonc`), jeder Push auf main geht nach rund einer Minute online.

Hier nichts von Hand bearbeiten. Die Quelle liegt im privaten App-Repo unter `tool/site`, gebaut mit
`python tool/site/build_site.py`, veröffentlicht mit `python tool/site/publish_site.py`. Dieses Repo ist nur der Spiegel
des Baus.

Stand: 2026-10-16T14:28:21+00:00, Commit 17e73b9 im App-Repo.
