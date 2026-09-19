# Manual tests as code

Every Markdown file in this directory is a test case. The required frontmatter
keys are `id`, `title`, `priority`, `component`, `platforms`, and `tags`.

`platforms` accepts `desktop` and/or `ipad`. The GitHub sync workflow upserts
these files into `qa_test_cases`; staging runs expand them into one result per
applicable platform.
