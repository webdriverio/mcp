# MCP Resources — Notes

## Template resources are not discoverable via ListResources

The `session-steps` resource uses a URI template (`wdio://session/{sessionId}/steps`) and does
not appear in `ListMcpResourcesTool` output. Only fixed-URI resources (`wdio://sessions`,
`wdio://session/current/steps`) are listed.

Template resources must be read directly by constructing the URI — clients cannot discover them
through the standard list call. If client discoverability matters, consider documenting the
template pattern in the fixed `wdio://sessions` index response, or exposing a separate resource
that advertises available URI templates.
