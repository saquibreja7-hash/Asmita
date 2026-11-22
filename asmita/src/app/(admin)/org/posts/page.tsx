import { deniedFor } from "../../page-permission";
import { ORG_POST_KINDS, ORG_POST_STATUSES } from "@/lib/org-posts";
import { PostsManager } from "./PostsManager";

// Org posts admin (docs/org/spec.md, 56.1). The manager owns the list and
// talks to /api/admin/org/posts directly: create and edit as drafts, then
// publish, unpublish, archive — or delete a draft. Case-study publishing is
// gated on consent and anonymisation by the store, and the form explains it.
export default async function OrgPostsPage() {
  const denied = await deniedFor("content:manage");
  if (denied) return denied;

  return (
    <section>
      <p className="eyebrow">Console · Organization</p>
      <h1 className="mt-3">Org posts</h1>
      <p className="muted mt-3 max-w-2xl text-sm">
        News, case studies, policy papers, campaigns, research, lab notes and press releases. Posts start as drafts; a
        case study can be published only after consent is recorded and the story is anonymised.
      </p>
      <div className="mt-6">
        <PostsManager kinds={[...ORG_POST_KINDS]} statuses={[...ORG_POST_STATUSES]} />
      </div>
    </section>
  );
}
