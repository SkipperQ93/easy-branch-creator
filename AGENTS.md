# AGENTS.md

Azure DevOps extension that creates Git branches from work items, plus the Azure DevOps pipelines
(`AZD-Pipelines/`) that enforce and clean up the resulting branch hierarchy. The branch naming in
`src/branch-creator.tsx` and the regexes in `AZD-Pipelines/` are a contract — change them together.

## Commands

- Node version: see `.nvmrc` (20)
- `npm run compile` — production build into `dist/`
- `npm run compile:dev` — development build
- `npm run package` — build and create the `.vsix` in `out/` (uses `configs/release.json`)

## Branch naming (`src/branch-creator.tsx`)

All names are lowercased, and non-alphanumeric characters become `-`.

| Kind | Format | Example |
|------|--------|---------|
| Parent | `<parent-type>/<parent-id>-<parent-title>` | `user-story/123-checkout-redesign` |
| Child | `<type>/<parent-type>-<parent-id>/<id>-[<scope>-]<title (max 50)>` | `task/user-story-123/456-api-add-endpoint` |
| Unparented child | `<type>/unparented/<id>-[<scope>-]<title>` | `task/unparented/456-fix-typo` |

- The parent branch is created from the default branch the first time a child is created. The child
  is then created from the parent branch.
- Existing branches are matched by their prefix (`type/id-` for parents, `<type>/<parent>/<id>-` for
  children). Renaming a work item or changing its scope therefore reuses the existing branch instead
  of creating a new one.
- If a parent's branch name contains `enhancements-and-bug-fixes`, it is not used as a parent: the
  child goes under `unparented/` and is created from the default branch. The parent work item's
  state is still updated.

## Merge flow

```
main ──► parent (user-story/123-...) ──► child (task/user-story-123/456-...)
                                               │
child ──PR──► parent      (validate_target_branch.ps1: target must be the parent)
parent ──PR──► main       (validate_target_branch.ps1: no child branches may still exist)
parent merged to main ──► cleanup pipeline deletes the parent branch
```

1. The developer creates a branch for a work item from the extension. The parent and child branches
   are created and linked to their work items, and the work item states are updated.
2. Child PR → parent branch. Any other target, including `main`, fails validation. When the check
   passes, a comment with a "create PR from parent to main" link is posted on the PR.
3. The child branch must be deleted when its PR completes ("Delete source branch"). Nothing else
   deletes child branches.
4. Parent PR → `main`. Validation fails while any branch matching `*/<parent-type>-<parent-id>/*`
   still exists.
5. When the parent merges into `main`/`master`, the cleanup pipeline deletes the parent branch.

Unparented branches and branches that match neither pattern are not validated. They may target any
branch.

## Pipelines (`AZD-Pipelines/`)

The templates referenced as `@PipelineTemplates` live in the separate `PipelineTemplates/PipelineTemplates`
repo. The files here are copies of them — keep both in sync.

| File | Role |
|------|------|
| `pr-validation-pipeline.yaml` | Used as the PR build-validation policy (`trigger: none`). Calls `validators/main-pr-validator.yaml`. |
| `main-pr-validator.yaml` | Clones `PipelineTemplates` and runs `validators/validate_target_branch.ps1` with the PR's source and target branches. |
| `validate_target_branch.ps1` | Child pattern `^[a-zA-Z-]+/[a-zA-Z-]+-\d+/\d+-[a-zA-Z0-9-]+$` must target `<parent-type>/<parent-id>-*`. Parent pattern `^[a-zA-Z-]+/\d+-[a-zA-Z0-9-]+$` is blocked while it has child branches. |
| `cleanup-pipeline.yaml` | Triggered by pushes to `main`. Calls `utilities/delete_pr_source_branch.yaml`. |
| `delete_pr_source_branch.yaml` | Finds the PR for the merge commit. If the source matches the parent pattern and the target is `main`/`master`, it deletes the source branch. |


