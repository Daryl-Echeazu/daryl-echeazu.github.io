# daryl-echeazu.github.io

Daryl's personal website.

Built in **Claude Design** and deployed to GitHub Pages. `index.html` is
generated output — edit the site in Claude Design, not here.

## Rebuilding

Download the export from Claude Design, then run the command for your branch:

```sh
# main — the public site (DarylOS included since Aug 2026)
python build.py "~/Downloads/index (1).html" --out . --hide inbox

# development — everything, including work in progress
python build.py "~/Downloads/index (1).html" --out .
```

Commit and push; Pages redeploys in under a minute.

`main` is what the public sees. `development` is the working branch and is not
served. **`--hide inbox` is the only thing keeping the Inbox off the live
site** — rebuild `main` without it and it goes public. The Inbox should stay
hidden until `formEndpoint` is set in Claude Design, because until then it
reports success and silently discards every message.

The demo page `inbox-demos.html` and its scripts live on `development` only.
