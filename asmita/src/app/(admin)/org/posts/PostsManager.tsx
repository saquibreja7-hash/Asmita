"use client";

import { useEffect, useMemo, useState } from "react";
import { csrfFetch } from "@/lib/client-csrf";
import { renderMarkdown } from "@/lib/markdown";
import { SIZES } from "@/components/Illustration";
import { apiError } from "../api-error";
import { Field } from "../Field";
import type { OrgPost, OrgPostKind, OrgPostStatus } from "@/lib/org-posts";

// /admin/org/posts (docs/org/spec.md, 56.1): list, create, edit and publish
// org posts through /api/admin/org/posts. The list is fetched from the API
// and re-fetched after every change; edits load into the same form as new
// posts, and the body editor previews the safe markdown renderer live.

const ILLUSTRATION_NAMES = Object.keys(SIZES);

const KIND_LABELS: Record<OrgPostKind, string> = {
  NEWS: "News",
  CASE_STUDY: "Case study",
  POLICY: "Policy paper",
  CAMPAIGN: "Campaign",
  RESEARCH: "Research",
  LAB_NOTE: "Lab note",
  PRESS: "Press release",
};

const STATUS_LABELS: Record<OrgPostStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

const ERRORS: Record<string, string> = {
  slug_taken: "That slug is already used.",
  case_study_checks_required: "Record consent and confirm the story is anonymised before publishing a case study, or keeping one live after an edit.",
  not_a_draft: "Only a draft can be deleted.",
  post_not_found: "This post no longer exists; load the list again.",
};

type PostForm = {
  kind: OrgPostKind;
  titleEn: string;
  titleHi: string;
  summaryEn: string;
  summaryHi: string;
  bodyEn: string;
  bodyHi: string;
  slug: string;
  authorDisplayName: string;
  tags: string;
  coverIllustration: string;
  coverImagePath: string;
  attachmentUrl: string;
  attachmentLabel: string;
  ctaLabel: string;
  ctaUrl: string;
  consentRecorded: boolean;
  anonymised: boolean;
};

const EMPTY_FORM: PostForm = {
  kind: "NEWS",
  titleEn: "",
  titleHi: "",
  summaryEn: "",
  summaryHi: "",
  bodyEn: "",
  bodyHi: "",
  slug: "",
  authorDisplayName: "",
  tags: "",
  coverIllustration: "",
  coverImagePath: "",
  attachmentUrl: "",
  attachmentLabel: "",
  ctaLabel: "",
  ctaUrl: "",
  consentRecorded: false,
  anonymised: false,
};

function formFromPost(post: OrgPost): PostForm {
  return {
    kind: post.kind,
    titleEn: post.titleEn,
    titleHi: post.titleHi ?? "",
    summaryEn: post.summaryEn,
    summaryHi: post.summaryHi ?? "",
    bodyEn: post.bodyEn,
    bodyHi: post.bodyHi ?? "",
    slug: post.slug,
    authorDisplayName: post.authorDisplayName,
    tags: post.tags.join(", "),
    coverIllustration: post.coverIllustration ?? "",
    coverImagePath: post.coverImagePath ?? "",
    attachmentUrl: post.attachmentUrl ?? "",
    attachmentLabel: post.attachmentLabel ?? "",
    ctaLabel: post.ctaLabel ?? "",
    ctaUrl: post.ctaUrl ?? "",
    consentRecorded: post.consentRecorded,
    anonymised: post.anonymised,
  };
}

function postPayload(form: PostForm): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    kind: form.kind,
    titleEn: form.titleEn.trim(),
    summaryEn: form.summaryEn.trim(),
    bodyEn: form.bodyEn,
    authorDisplayName: form.authorDisplayName.trim(),
    tags: form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 8),
    consentRecorded: form.kind === "CASE_STUDY" && form.consentRecorded,
    anonymised: form.kind === "CASE_STUDY" && form.anonymised,
  };
  if (form.titleHi.trim()) payload.titleHi = form.titleHi.trim();
  if (form.summaryHi.trim()) payload.summaryHi = form.summaryHi.trim();
  if (form.bodyHi.trim()) payload.bodyHi = form.bodyHi;
  if (form.slug.trim()) payload.slug = form.slug.trim();
  if (form.coverIllustration) payload.coverIllustration = form.coverIllustration;
  if (form.coverImagePath.trim()) payload.coverImagePath = form.coverImagePath.trim();
  if (form.attachmentUrl.trim()) payload.attachmentUrl = form.attachmentUrl.trim();
  if (form.attachmentLabel.trim()) payload.attachmentLabel = form.attachmentLabel.trim();
  if (form.ctaLabel.trim()) payload.ctaLabel = form.ctaLabel.trim();
  if (form.ctaUrl.trim()) payload.ctaUrl = form.ctaUrl.trim();
  return payload;
}

/** The slug the server makes from this title (slugifyOrgTitle in org-posts). */
function slugPreview(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

const when = (iso: string) => iso.slice(0, 16).replace("T", " ");

export function PostsManager({ kinds, statuses }: { kinds: OrgPostKind[]; statuses: OrgPostStatus[] }) {
  const [posts, setPosts] = useState<OrgPost[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"ALL" | OrgPostStatus>("ALL");
  const [kindFilter, setKindFilter] = useState<"ALL" | OrgPostKind>("ALL");
  const [sortBy, setSortBy] = useState<"updated" | "title">("updated");

  const [form, setForm] = useState<PostForm | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/org/posts", { cache: "no-store" })
      .then(async (response) => {
        const data = response.ok ? ((await response.json()) as { posts: OrgPost[] }) : null;
        if (!active) return;
        if (!data) throw new Error(String(response.status));
        setPosts(data.posts);
        setLoadError(null);
      })
      .catch(() => {
        if (active) setLoadError("The post list could not be loaded; try again in a moment.");
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const visible = useMemo(() => {
    const rows = (posts ?? []).filter(
      (post) => (statusFilter === "ALL" || post.status === statusFilter) && (kindFilter === "ALL" || post.kind === kindFilter),
    );
    rows.sort((a, b) => (sortBy === "title" ? a.titleEn.localeCompare(b.titleEn) : b.updatedAt.localeCompare(a.updatedAt)));
    return rows;
  }, [posts, statusFilter, kindFilter, sortBy]);

  function openNew() {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setFormError(null);
    setNotice(null);
    setRowError(null);
  }

  function startEdit(post: OrgPost) {
    setForm(formFromPost(post));
    setEditingId(post.id);
    setFormError(null);
    setNotice(null);
    setRowError(null);
  }

  function closeForm() {
    setForm(null);
    setEditingId(null);
    setFormError(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    setFormError(null);
    try {
      const response = await csrfFetch(editingId ? `/api/admin/org/posts/${editingId}` : "/api/admin/org/posts", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(postPayload(form)),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string; field?: string } | null;
        setFormError(apiError(data, ERRORS, "The post was not saved."));
        return;
      }
      setNotice(editingId ? "Post saved." : "Post saved as a draft.");
      closeForm();
      setReload((count) => count + 1);
    } catch {
      setFormError("The post was not saved: the request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(post: OrgPost, action: "publish" | "unpublish" | "archive") {
    setRowError(null);
    setNotice(null);
    setBusy(true);
    try {
      const response = await csrfFetch(`/api/admin/org/posts/${post.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string; field?: string } | null;
        setRowError(apiError(data, ERRORS, "The change did not go through."));
        return;
      }
      setNotice(
        action === "publish"
          ? `“${post.titleEn}” published.`
          : action === "unpublish"
            ? `“${post.titleEn}” is back to draft.`
            : `“${post.titleEn}” archived.`,
      );
      setReload((count) => count + 1);
    } catch {
      setRowError("The change did not go through: the request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(post: OrgPost) {
    if (!window.confirm(`Delete "${post.titleEn}"? This cannot be undone.`)) return;
    setRowError(null);
    setNotice(null);
    setBusy(true);
    try {
      const response = await csrfFetch(`/api/admin/org/posts/${post.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string; field?: string } | null;
        setRowError(apiError(data, ERRORS, "The post was not deleted."));
        return;
      }
      setNotice(`“${post.titleEn}” deleted.`);
      setReload((count) => count + 1);
    } catch {
      setRowError("The post was not deleted: the request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div aria-live="polite">
        {notice && (
          <p className="text-sm text-[var(--brand)]" role="status">
            {notice}
          </p>
        )}
        {rowError && (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {rowError}
          </p>
        )}
        {loadError && (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {loadError}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1 text-sm">
          <label htmlFor="post-status-filter">Status</label>
          <select
            className="field"
            id="post-status-filter"
            onChange={(event) => setStatusFilter(event.target.value as "ALL" | OrgPostStatus)}
            value={statusFilter}
          >
            <option value="ALL">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1 text-sm">
          <label htmlFor="post-kind-filter">Kind</label>
          <select
            className="field"
            id="post-kind-filter"
            onChange={(event) => setKindFilter(event.target.value as "ALL" | OrgPostKind)}
            value={kindFilter}
          >
            <option value="ALL">All kinds</option>
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>
        <div aria-label="Sort posts" className="flex gap-2" role="group">
          <button
            aria-pressed={sortBy === "updated"}
            className={`btn px-4 py-1 text-sm ${sortBy === "updated" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setSortBy("updated")}
            type="button"
          >
            Newest updated
          </button>
          <button
            aria-pressed={sortBy === "title"}
            className={`btn px-4 py-1 text-sm ${sortBy === "title" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setSortBy("title")}
            type="button"
          >
            Title A–Z
          </button>
        </div>
        <button className="btn btn-primary" onClick={openNew} type="button">
          New post
        </button>
      </div>

      {posts === null && !loadError ? (
        <p className="muted text-sm">Loading posts…</p>
      ) : (
        <div className="a-card overflow-hidden">
          <table className="a-table w-full min-w-[820px] text-left text-sm">
            <caption className="sr-only">Org posts</caption>
            <thead>
              <tr>
                <th className="eyebrow" scope="col">
                  Title
                </th>
                <th className="eyebrow" scope="col">
                  Kind
                </th>
                <th className="eyebrow" scope="col">
                  Status
                </th>
                <th className="eyebrow" scope="col">
                  Updated
                </th>
                <th className="eyebrow" scope="col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((post) => (
                <tr key={post.id}>
                  <td>
                    <span className="font-semibold">{post.titleEn}</span>
                    <span className="muted block font-mono text-xs">{post.slug}</span>
                  </td>
                  <td>{KIND_LABELS[post.kind]}</td>
                  <td>
                    {post.status === "PUBLISHED" ? <span className="a-count">Published</span> : STATUS_LABELS[post.status]}
                  </td>
                  <td className="a-nowrap tabular-nums">{when(post.updatedAt)}</td>
                  <td className="a-nowrap">
                    <span className="flex flex-wrap gap-2">
                      <button
                        className="btn btn-secondary px-3 py-1 text-xs"
                        disabled={busy}
                        onClick={() => startEdit(post)}
                        type="button"
                      >
                        Edit
                      </button>
                      {post.status !== "PUBLISHED" && (
                        <button
                          className="btn btn-primary px-3 py-1 text-xs"
                          disabled={busy}
                          onClick={() => runAction(post, "publish")}
                          type="button"
                        >
                          Publish
                        </button>
                      )}
                      {post.status === "PUBLISHED" && (
                        <>
                          <button
                            className="btn btn-secondary px-3 py-1 text-xs"
                            disabled={busy}
                            onClick={() => runAction(post, "unpublish")}
                            type="button"
                          >
                            Unpublish
                          </button>
                          <button
                            className="btn btn-secondary px-3 py-1 text-xs"
                            disabled={busy}
                            onClick={() => runAction(post, "archive")}
                            type="button"
                          >
                            Archive
                          </button>
                        </>
                      )}
                      {post.status === "DRAFT" && (
                        <button
                          className="btn btn-secondary px-3 py-1 text-xs"
                          disabled={busy}
                          onClick={() => remove(post)}
                          type="button"
                        >
                          Delete
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && (
            <p className="muted p-6 text-center text-sm">
              {posts !== null && posts.length === 0 ? "No posts yet." : "No posts for this filter."}
            </p>
          )}
        </div>
      )}

      {form && (
        <form className="a-card grid gap-4 p-5" noValidate onSubmit={save}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2>{editingId ? "Edit post" : "New post"}</h2>
            <button className="btn btn-secondary px-3 py-1 text-xs" onClick={closeForm} type="button">
              Close
            </button>
          </div>

          <Field id="post-kind" label="Kind">
            <select
              className="field"
              id="post-kind"
              onChange={(event) => setForm({ ...form, kind: event.target.value as OrgPostKind })}
              value={form.kind}
            >
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="post-title-en" label="Title (English)">
              <input
                className="field"
                id="post-title-en"
                maxLength={160}
                onChange={(event) => setForm({ ...form, titleEn: event.target.value })}
                value={form.titleEn}
              />
            </Field>
            <Field id="post-title-hi" label="Title (Hindi, optional)">
              <input
                className="field"
                id="post-title-hi"
                maxLength={160}
                onChange={(event) => setForm({ ...form, titleHi: event.target.value })}
                value={form.titleHi}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="post-summary-en" label="Summary (English)" hint="One or two sentences, shown in listings and at the top of the post.">
              <textarea
                className="field"
                id="post-summary-en"
                maxLength={600}
                onChange={(event) => setForm({ ...form, summaryEn: event.target.value })}
                rows={3}
                value={form.summaryEn}
              />
            </Field>
            <Field id="post-summary-hi" label="Summary (Hindi, optional)" hint="Shown when the site is in Hindi.">
              <textarea
                className="field"
                id="post-summary-hi"
                maxLength={600}
                onChange={(event) => setForm({ ...form, summaryHi: event.target.value })}
                rows={3}
                value={form.summaryHi}
              />
            </Field>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Field
              id="post-body-en"
              label="Body (English, markdown)"
              hint="Markdown: headings, lists, quotes, tables and links. Images must use this site&apos;s own paths (/…)."
            >
              <textarea
                className="field font-mono"
                id="post-body-en"
                onChange={(event) => setForm({ ...form, bodyEn: event.target.value })}
                rows={16}
                value={form.bodyEn}
              />
            </Field>
            <div className="grid gap-1 text-sm">
              <p className="eyebrow">Live preview</p>
              <div
                className="reading-body a-card max-h-[32rem] overflow-auto p-4"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(form.bodyEn) }}
              />
            </div>
          </div>

          <Field id="post-body-hi" label="Body (Hindi, markdown, optional)">
            <textarea
              className="field font-mono"
              id="post-body-hi"
              onChange={(event) => setForm({ ...form, bodyHi: event.target.value })}
              rows={8}
              value={form.bodyHi}
            />
          </Field>

          <Field
            id="post-slug"
            label="Slug"
            hint="Shown in the post address as /news/<slug>. Leave blank and the slug is made from the English title."
          >
            <input
              className="field font-mono"
              id="post-slug"
              maxLength={80}
              onChange={(event) => setForm({ ...form, slug: event.target.value })}
              placeholder={form.titleEn ? slugPreview(form.titleEn) : "made from the title"}
              value={form.slug}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="post-author" label="Author (display name)">
              <input
                className="field"
                id="post-author"
                maxLength={80}
                onChange={(event) => setForm({ ...form, authorDisplayName: event.target.value })}
                value={form.authorDisplayName}
              />
            </Field>
            <Field id="post-tags" label="Tags" hint="Comma-separated; at most 8, each 2–30 characters.">
              <input
                className="field"
                id="post-tags"
                onChange={(event) => setForm({ ...form, tags: event.target.value })}
                value={form.tags}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="post-cover-illustration" label="Cover illustration" hint="One of the ready illustrations, or none.">
              <select
                className="field"
                id="post-cover-illustration"
                onChange={(event) => setForm({ ...form, coverIllustration: event.target.value })}
                value={form.coverIllustration}
              >
                <option value="">None</option>
                {ILLUSTRATION_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id="post-cover-image"
              label="Cover image path (optional)"
              hint="A path on this site starting with /, used instead of an illustration — not both."
            >
              <input
                className="field font-mono"
                id="post-cover-image"
                maxLength={300}
                onChange={(event) => setForm({ ...form, coverImagePath: event.target.value })}
                value={form.coverImagePath}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="post-attachment-url" label="Attachment URL (optional)" hint="A file this post offers for download, for example a PDF.">
              <input
                className="field"
                id="post-attachment-url"
                maxLength={300}
                onChange={(event) => setForm({ ...form, attachmentUrl: event.target.value })}
                value={form.attachmentUrl}
              />
            </Field>
            <Field id="post-attachment-label" label="Attachment label (optional)">
              <input
                className="field"
                id="post-attachment-label"
                maxLength={120}
                onChange={(event) => setForm({ ...form, attachmentLabel: event.target.value })}
                value={form.attachmentLabel}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="post-cta-label" label="Call-to-action label (optional)" hint="Shown as a button at the end of the post.">
              <input
                className="field"
                id="post-cta-label"
                maxLength={60}
                onChange={(event) => setForm({ ...form, ctaLabel: event.target.value })}
                value={form.ctaLabel}
              />
            </Field>
            <Field
              id="post-cta-url"
              label="Call-to-action URL (optional)"
              hint="Needs the label too. An https:// address, or a path on this site."
            >
              <input
                className="field"
                id="post-cta-url"
                maxLength={500}
                onChange={(event) => setForm({ ...form, ctaUrl: event.target.value })}
                value={form.ctaUrl}
              />
            </Field>
          </div>

          {form.kind === "CASE_STUDY" && (
            <fieldset className="grid gap-2 border-t pt-4">
              <legend className="eyebrow px-1">Case study checks</legend>
              <label className="flex items-start gap-2 text-sm">
                <input
                  checked={form.consentRecorded}
                  className="mt-1"
                  onChange={(event) => setForm({ ...form, consentRecorded: event.target.checked })}
                  type="checkbox"
                />
                <span>Consent to tell this story is recorded and stored with the case file.</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  checked={form.anonymised}
                  className="mt-1"
                  onChange={(event) => setForm({ ...form, anonymised: event.target.checked })}
                  type="checkbox"
                />
                <span>The story is anonymised: no names, ages, places or details that could identify the survivor.</span>
              </label>
              <p className="muted text-xs">Publishing is blocked until both boxes are ticked.</p>
            </fieldset>
          )}

          {formError && (
            <p className="text-sm text-[var(--danger)]" role="alert">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary" disabled={busy} type="submit">
              {busy ? "Saving…" : editingId ? "Save changes" : "Create draft"}
            </button>
            <button className="btn btn-secondary" onClick={closeForm} type="button">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
