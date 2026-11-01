// Asmita's 24/7 AI voice helpline (Sarvam). It speaks Indian languages and
// walks callers through filing a complaint; under-18 callers are sent to
// child helplines instead.
export const HELPLINE = {
  display: "+91 80654 80788",
  tel: "+918065480788",
} as const;

// The same Sarvam agent answers in the browser on /talk. The web pins the
// committed version the phone line serves, so both say the same thing. These
// ids are not secret; the API key is (SARVAM_API_KEY, a Worker secret).
export const VOICE_AGENT = {
  orgId: "01a03e5c-f137-750c-a7f6-3f79f4c3af72",
  workspaceId: "01a03e5c-f13c-7cba-8ecf-0decc2f61e58",
  appId: "Conversatio-9ebc9fc7-c519",
  version: 4,
} as const;

// The path the browser SDK requests under its baseUrl to get a signed,
// single-use WebSocket URL. Our route answers only this exact path.
export const VOICE_AGENT_PATH = `orgs/${VOICE_AGENT.orgId}/workspaces/${VOICE_AGENT.workspaceId}/apps/${VOICE_AGENT.appId}/url`;
