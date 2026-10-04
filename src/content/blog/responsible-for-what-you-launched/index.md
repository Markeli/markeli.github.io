---
title: You Become Responsible, Forever, for What You Have Launched
description: Why a coding agent should work under its own account instead of yours, and how I put Claude Code in a Docker Sandbox as the markeli-agent bot.
pubDate: 2026-10-04
tags: [ai-agents, claude-code, security, github, gitlab, docker]
draft: false
---

Coding agents are great. They write code, run tests, open pull requests and answer review comments. But almost everyone
runs them **as themselves**: with their own SSH key, their own `gh`/`glab` token, their own git author. GitHub and GitLab
don't see an agent. They see you.

The usual guardrail is `CLAUDE.md`/`AGENTS.md`: "don't push to main", "don't merge your own PRs", "never use `--force`".
That's an instruction, not a control. The model follows it almost every time. Almost.

Once my agent decided not to wait for my approval and merged its branch into master "to see how it behaves in
production". Nothing technically stopped it: it had my permissions.

## An agent is a different identity

The first instinct is to cut its permissions: a fine-grained token, one repository, read-only, no admin. In practice that
gets in the way. The agent still needs to push branches, open PRs and reply in threads. More importantly, it's still you.

That breaks every "four eyes" mechanism GitHub and GitLab give you:

- **Code owners.** If you own the code and "you"-the-agent opened the PR, there's no one left to require a review from.
- **Approval rules.** You can't approve your own PR. A "1 approval required" rule either blocks everything or gets
  switched off.
- **Bypass.** If you're a repository admin, you usually can bypass the rules. An agent with your token can too.
- **Review.** You end up reviewing a PR you formally opened yourself. Reviewing yourself is a farce.

## The idea: run the agent as someone else

Give the agent its own account. It authors commits, pushes, opens PRs and answers comments. You're the co-author of its
commits (`Co-authored-by`) and the one who approves and merges. The usual rules work again: required approvals, code
owners, protected branches. And the bot physically can't merge its own PR.

### GitHub

| Option | How | Caveats |
|---|---|---|
| Machine user | A second regular account (mine is `markeli-agent`), invited as a collaborator | The [ToS](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service) allows one free personal account plus a machine account. 2FA is required |
| GitHub App | An app installed on the repositories | `[bot]` badge, tokens live for an hour, but you have to mint them from a private key via a JWT, so you need a wrapper |

A machine user is the simpler start. What I learned along the way:

- **Fine-grained PATs don't work for someone else's personal repositories.** GitHub
  [says so explicitly](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens):
  fine-grained tokens can't be used in repositories where the token owner is a collaborator. My bot is a collaborator in
  my repositories, so it gets a classic PAT with the `repo` scope. That's less scary than it sounds: the bot only sees
  repositories it was invited to. The boundary is the invitations, not the token. In organization repositories
  fine-grained tokens work.
- **Contribution graph.** A `Co-authored-by` commit counts towards your graph if the trailer email is verified on your
  account and the commit lands in the default branch. The PR itself counts for the bot.
- **Ruleset.** Required approval is `required_approving_review_count: 1`. Also turn on `require_last_push_approval: true`:
  without it the bot can push one more commit after your approval and merge. Keep a bypass for admins and merge your own
  PRs with "bypass rules".
- **Why not a network filter.** You could block the bot's `PUT /repos/*/*/pulls/*/merge` at the network level, but
  `gh pr merge` goes through GraphQL, and a path rule can't catch it. The control belongs in repository settings.
- **Private repositories on Free.** Branch protection and rulesets for private repositories of a personal account need
  Pro.

### GitLab.com

- **Project and group access tokens** create a bot user automatically, which is exactly what you want. On GitLab.com
  they are Premium/Ultimate, as are service accounts.
- **On Free** the same trick as on GitHub: a second account with an `api` PAT and the Developer role. A protected branch
  with "Allowed to merge: Maintainers" is free, and the bot can't merge into it.
- **Contribution calendar.** GitLab builds it from events, not commit authorship. A push counts for whoever pushed, and
  `Co-authored-by` doesn't help. Your calendar will thin out, leaving comments, approvals and merges.

### Self-hosted GitLab

On self-managed GitLab, project and group access tokens are available on every tier, so you get a bot user without a
second account. That's a conversation with your instance admins and your company policy, though.

### Pros and cons

**Pros:** the usual review and branch protection rules work; history shows what the agent did; you can revoke the bot's
access without touching your own; the agent gets exactly the repositories it needs.

**Cons:** a second account with its own 2FA; a classic PAT on GitHub; your own PRs need a bypass; your GitLab
contribution calendar thins out.

## Running it locally

It looks like a small job: swap the agent's git author and tokens. I went all the way down that road, and here's what I
found.

- **Git author.** `GIT_AUTHOR_*`/`GIT_COMMITTER_*` in the agent's environment work. A plus address like
  `you+bot@gmail.com` works only if you don't add it to your own account; otherwise the commits are yours again.
- **Tokens.** `GH_TOKEN` and `GITLAB_TOKEN` override the stored `gh`/`glab` login. But `git push` doesn't see them: over
  HTTPS it takes your token from `osxkeychain`, over SSH your key from ssh-agent. The commit is the bot's, the push is
  yours.
- **SSH.** `IdentityFile` entries in `~/.ssh/config` accumulate instead of replacing each other. If the bot's key is
  rejected, ssh silently offers yours and the push goes out as you.
- **Identity at launch.** A wrapper around the agent picks the bot by `$PWD`. Then the agent `cd`s into another
  repository, clones a new one or creates a worktree, and the identity no longer matches.
- **Hooks.** A global `core.hooksPath` for adding `Co-authored-by` disables husky, lefthook and pre-commit in
  repositories. I had 97 of those out of ~800.

All of it is solvable: `GIT_CONFIG_GLOBAL` with `includeIf hasconfig:remote.*.url`, wrappers around `gh`/`glab`, a
separate ssh config. But it gets complicated and hacky.

And above all, it isn't safe. The agent runs as your OS user: it can reach your ssh-agent, `~/.config/glab-cli` and the
Keychain. `gh` stores its token through `/usr/bin/security`, which can read it back without a prompt. An agent that hits
a 403 as the bot may well "help itself" with your credentials. The separation becomes attribution, not a boundary.

The fix is to move the agent into a sandbox where your credentials simply don't exist.

## Docker Sandboxes in a nutshell

[Docker Sandboxes](https://docs.docker.com/ai/sandboxes/) (the `sbx` CLI) runs the agent in a microVM. The old
`docker sandbox` command is already gone in Docker 29.8; it's a separate `sbx` now.

- **Network:** all outbound TCP goes through a proxy on the host, deny-by-default with an allowlist. SSH on port 22 is
  closed too until you allow it. A blocked host doesn't just fail: the request waits for your decision
  (`Approval required for ci.dot.net:443`). `sbx policy approval ls` shows pending requests, and you can allow a host
  on the fly without recreating the sandbox. My bot hit exactly that while building its own image: the .NET installer
  needs `ci.dot.net` to resolve the latest SDK version and `builds.dotnet.microsoft.com` for the binaries. It stopped,
  reported the host, and I approved it.
- **Filesystem:** only the mounted repository is visible. In clone mode the agent works on its own copy inside the VM,
  and the host repository gets a `sandbox-<name>` remote.
- **Credentials:** tokens never enter the VM. Inside there's a placeholder; the host proxy swaps in the real token in
  the request header for the right host.
- **SSH:** ssh-agent is forwarded, the private key stays on the host. You can point it at an agent socket that holds
  only the bot's key.
- **Identity:** the only identity inside is the bot. The question "how does the agent avoid becoming me" goes away.
- **MCP:** servers are registered on the host, and the agent sees a single gateway.

## My setup

Everything lives in [Markeli/ai-agents-tooling](https://github.com/Markeli/ai-agents-tooling):

```text
sandbox/
├── image/                  ghcr.io/markeli/claude-sandbox, built by CI
│   ├── Dockerfile          .NET, glab, plugins, bot git identity
│   ├── managed-settings.json
│   └── CLAUDE.md
├── kits/markeli-claude/    kit: built-in claude + network + GitLab credential
└── bin/agent-sandbox       create a sandbox for a repository and attach
```

**The image** builds on `docker/sandbox-templates:claude-code-docker`. The bot identity is pinned with environment
variables; plugins and instructions go into Claude Code's managed config:

```dockerfile
# sbx copies the host's git identity into the sandbox ~/.gitconfig; env vars override any config file
ENV GIT_AUTHOR_NAME=markeli-agent \
	GIT_AUTHOR_EMAIL=markelow.dev+agent@gmail.com \
	GIT_COMMITTER_NAME=markeli-agent \
	GIT_COMMITTER_EMAIL=markelow.dev+agent@gmail.com

# Clone anonymously over HTTPS, push over SSH with the bot's key
RUN git config --system url."git@github.com:".pushInsteadOf "https://github.com/"

# sbx regenerates ~/.claude/settings.json, but /etc/claude-code survives
COPY managed-settings.json /etc/claude-code/managed-settings.json
COPY CLAUDE.md /etc/claude-code/CLAUDE.md
```

```json
{
	"attribution": {
		"commit": "Co-authored-by: Maxim Markelow <markelow.dev@gmail.com>",
		"pr": ""
	},
	"enabledPlugins": {
		"superpowers@claude-plugins-official": true,
		"csharp-lsp@claude-plugins-official": true
	},
	"env": { "ENABLE_CLAUDEAI_MCP_SERVERS": "false" }
}
```

**The kit** extends the built-in `claude` agent, keeping its login, MCP gateway and token injection, and adds only what
I need:

```yaml
schemaVersion: "2"
kind: sandbox
name: markeli-claude
extends: claude
sandbox:
  image: ghcr.io/markeli/claude-sandbox:latest
permissions:
  network:
    allow: [github.com:22, gitlab.com:22, api.nuget.org]
credentials:
  - service: gitlab
    apiKey:
      name: GITLAB_TOKEN
      proxyManaged: true
      inject:
        - domain: gitlab.com
          header: PRIVATE-TOKEN
          format: "%s"
```

### Quick setup

1. Bot accounts on GitHub and GitLab, invited to the repositories. Create a separate browser profile for the bot
   accounts: you sign in as the bot there and stay signed in to your own accounts in your main profile.
2. A bot SSH key with a passphrase and a dedicated agent for it:

   ```bash
   ssh-agent -a ~/.ssh/markeli-agent.sock
   SSH_AUTH_SOCK=~/.ssh/markeli-agent.sock ssh-add --apple-use-keychain ~/.ssh/markeli_agent
   ```

3. The bot's tokens in the Keychain:

   ```bash
   security add-generic-password -U -s agent/personal-github -a markeli-agent -w
   security add-generic-password -U -s agent/personal-gitlab -a markeli-agent -w
   ```

4. `sbx`:

   ```bash
   brew trust docker/tap && brew install docker/tap/sbx
   sbx login
   sbx policy init balanced
   sbx settings set ssh.agentSocketPath ~/.ssh/markeli-agent.sock && sbx daemon restart
   ```

5. Run it in any repository:

   ```bash
   agent-sandbox ~/Development/Personal/<repo>
   ```

The script starts the bot's ssh-agent, gives the sandbox its secrets from the Keychain
(`sbx secret set … --command 'security …'`), creates a clone-mode sandbox and attaches. On the first run sbx asks you to
approve the kit's credentials.

I tested it on a real repository: the bot in the sandbox created a branch, committed, pushed and opened a draft PR. I
left a general comment and an inline comment; the bot read both and replied in their threads as `markeli-agent`. GitHub
linked the co-author to my account.

## Pitfalls I hit

1. **sbx copies your git identity into the sandbox.** In `~/.gitconfig` it overrides `/etc/gitconfig`. There's no
   setting to turn it off; only environment variables in the image help.
2. **`insteadOf` instead of `pushInsteadOf`** rewrites anonymous clones to SSH too. It broke the plugin marketplace
   install during the image build.
3. **The `balanced` policy allows `nuget.org` but not `api.nuget.org`.** `dotnet restore` gets a 403.
4. **claude.ai connectors arrive with a subscription login**, all of them at once: Gmail, Drive, company MCP servers.
   The network policy doesn't stop them because they go through `mcp-proxy.anthropic.com`. Turn them off with
   `ENABLE_CLAUDEAI_MCP_SERVERS=false`.
5. **Without `ssh.agentSocketPath`** sbx forwards the ssh-agent of whatever terminal you attached from. Attach from a
   regular one and your key is inside.
6. **Custom secrets are only substituted in headers.** Git over HTTPS sends the token in Basic auth, base64-encoded, so
   the proxy can't find the placeholder. SSH only.
7. **A "third-party" kit**, including your own kit extending a built-in agent, only gets credentials after explicit
   approval. Without it sbx silently starts without the token.
8. **A ruleset requiring CodeQL** blocks merges forever in a new repository: default setup can't be enabled until `main`
   has a supported language. An explicit CodeQL workflow fixed it.

## Extra benefits

- **Reproducibility.** One command, and every repository gets the same environment: .NET, Node, glab, plugins, bot
  rules.
- **The image is code.** The Dockerfile lives in the repository; CI builds and publishes the image to ghcr. Change it,
  recreate the sandbox.
- **`--dangerously-skip-permissions` stops being scary.** It's the default inside the sandbox: the worst the agent can do
  is bounded by the VM, the network allowlist and the bot's permissions.
- **Parallelism.** You can keep several sandboxes, one per repository.

## Drawbacks

- **Your `~/.claude` isn't imported.** Settings, hooks and plugins only come through the image. Skills can be imported,
  but there's one store for all sandboxes.
- **stdio MCP servers run on the host, as you.** Each one is a hole in the boundary.
- **Tool-level MCP policies** (say, "read the tracker but don't write to it") need Docker's paid organization
  subscription.
- **`ssh.agentSocketPath` is global.** One bot key for all sandboxes; a second scope (personal vs. work) needs its own
  launcher.
- **Size.** My image is 5.6 GB (the base Claude Code image alone is 2.7 GB), and each sandbox gets a 10 GB volume for
  Docker inside the VM. With three sandboxes and the template cache, sbx took 16 GB of disk on my laptop.
- **Resources.** Each sandbox is a separate microVM with its own NuGet and Docker image caches; the first restore and
  Testcontainers run are slower.
- **Updates mean recreating.** A new image, a kit change or a different set of mounts only applies to a new sandbox.
  Pulling a fresh template doesn't touch existing ones, so you `sbx rm` and create again. Everything inside the VM goes
  with it: installed packages, caches, Docker images and the agent's session history. Push your branches first.
- **IDE integration is still murky.** Docker documents VS Code and Cursor through Remote-SSH: the editor stays on the
  host while files, terminals and extensions run inside the sandbox. I haven't tried it yet, JetBrains IDEs aren't
  covered, and in clone mode your host IDE doesn't see the agent's work until you `git fetch sandbox-<name>`. The
  comfortable "the agent edits, I watch the diff in my IDE" loop needs rethinking.
- **Your own PRs need a bypass.**
- **A lot is experimental:** custom secrets, kits, shared skills. Things may change between `sbx` releases.

## Limitations

- **amd64-only images don't run.** On Apple silicon the VM is arm64 without emulation. Testcontainers with PostgreSQL
  passed; SQL Server failed with `exec format error`.
- **Platforms:** macOS 14+ on Apple silicon, Windows 11, Ubuntu 24.04+ with KVM.
- **A Docker account is required** (`sbx login`).
- **Pushes over SSH only** when the token is a custom secret.

## Links

- Repository with the image, kit and script: [Markeli/ai-agents-tooling](https://github.com/Markeli/ai-agents-tooling)
- Discuss PR with my agent:
  [Markeli/ai-agents-tooling/pull/2](https://github.com/Markeli/ai-agents-tooling/pull/2)
- [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/), [kits v2](https://docs.docker.com/ai/sandboxes/customize/kits-v2/),
  [credentials](https://docs.docker.com/ai/sandboxes/configuration/credentials/)

## What's next

Agents are becoming team members, not IDE plugins. A team member needs their own account, their own permissions and
the same rules as people: reviews, protected branches, audit.

What I'd really like is sub-identities in GitHub, GitLab and every other service: child identities that belong to you,
whose permissions you control explicitly and which can never have more than you do. An agent would act as
"you, through this agent", with its own audit trail, its own revocation and a scope you narrowed down yourself.

That would change the whole model of authentication and authorization the industry has been building for decades,
where an account is a person and a token is that person. Until it happens, a separate account per agent is the
practical way to get most of it today.
