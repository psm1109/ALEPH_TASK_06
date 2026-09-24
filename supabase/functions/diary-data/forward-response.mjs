const nullBodyStatuses = new Set([204, 205, 304]);

export async function forwardResponse(upstream, headers) {
  // Fetch rejects even an empty body for these statuses, so preserve the null body.
  const body = nullBodyStatuses.has(upstream.status) ? null : await upstream.arrayBuffer();
  return new Response(body, { status: upstream.status, headers });
}
