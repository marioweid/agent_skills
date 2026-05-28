# agent_skills

Install skills from this repository with the Agent Skills CLI:

```bash
npx skills add marioweid/agent_skills --list
npx skills add marioweid/agent_skills --skill py4gw
```

Install all skills:

```bash
npx skills add marioweid/agent_skills --skill '*'
```

Available skill names are taken from each `SKILL.md` frontmatter:

- `gwa2-bot`
- `karpathy-guidelines`
- `py4gw`
- `python-pro`

Use the exact skill name. For example, the Py4GW skill is `py4gw`, not `pygw2`.
