# dougborg.org

Jekyll site built by GitHub Pages and served at <https://dougborg.org>.

To publish a post, add `_posts/YYYY-MM-DD-slug.md` with front matter and push
to `main`. The post appears at `/slug`, and the Atom feed is at `/feed.xml`.

To preview locally, use Ruby 3.1: GitHub Pages pins Jekyll 3.9, which calls
`String#untaint` and does not run on Ruby 3.2 or later.

```bash
docker run --rm -it -p 4000:4000 -v "$PWD":/srv/jekyll -w /srv/jekyll \
  -v dougborg-site-gems:/usr/local/bundle ruby:3.1 \
  sh -c 'bundle install && bundle exec jekyll serve --host 0.0.0.0'
```
