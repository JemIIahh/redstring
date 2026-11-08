// Test-process preload only. It never forwards external requests or uses real keys.
const fs = require('node:fs');
const dns = require('node:dns');
const realFetch = globalThis.fetch;
const local = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const modelHost = 'api.deepseek.com';
const log = require('node:path').resolve('.offline-network.jsonl');
let sequence = 0;
const record = (kind, url, extra = {}) => {
  if (log) fs.appendFileSync(log, JSON.stringify({ kind, host: url.hostname, path: url.pathname, ...extra }) + '\n');
};
const json = (data) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const publicAddress = [{ address: '93.184.216.34', family: 4 }];
const lookup = dns.promises.lookup.bind(dns.promises);
dns.promises.lookup = async (host, options) => host === modelHost
  ? (options?.all ? publicAddress : publicAddress[0]) : lookup(host, options);
const callbackLookup = dns.lookup.bind(dns);
dns.lookup = (host, options, callback) => {
  if (host !== modelHost) return callbackLookup(host, options, callback);
  if (typeof options === 'function') { callback = options; options = {}; }
  queueMicrotask(() => options?.all ? callback(null, publicAddress) : callback(null, publicAddress[0].address, 4));
};

function completion(body) {
  const messages = body.messages ?? [];
  const text = messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
  const lastDeny = text.lastIndexOf('OFFLINE_DENY');
  const lastApprove = text.lastIndexOf('OFFLINE_APPROVE');
  const marker = Math.max(lastDeny, lastApprove);
  const caseId = [...text.matchAll(/Case ([a-f0-9-]{36})/g)].at(-1)?.[1];
  const tools = body.tools?.map(t => t.function?.name) ?? [];
  let content;
  let call;
  if (!tools.includes('export-brief') || marker < 0) {
    content = 'Offline approval test'; // Also answers the automatic chat-title request.
  } else {
    if (!caseId) throw new Error('Offline approval fixture needs the case context');
    const calls = new Map();
    let result;
    for (const message of messages) {
      for (const tool of message.tool_calls ?? []) calls.set(tool.id, tool.function?.name);
      if (message.role === 'tool' && calls.get(message.tool_call_id) === 'export-brief') result = message.content;
    }
    let parsed;
    try { parsed = JSON.parse(result); } catch {}
    if (parsed?.markdown) content = parsed.markdown;
    else if (lastDeny > lastApprove && typeof result === 'string' && /denied|declined|not approved/i.test(result)) content = 'Offline fixture: export denied.';
    else call = { index: 0, id: `offline-call-${++sequence}`, type: 'function', function: { name: 'export-brief', arguments: JSON.stringify({ caseId }) } };
  }
  record('model-fixture', new URL('https://api.deepseek.com/v1/chat/completions'), { tool: call?.function.name ?? null });
  if (!body.stream) return json({ id: 'offline', object: 'chat.completion', created: 1, model: body.model, choices: [{ index: 0, message: { role: 'assistant', content: content ?? '' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
  const chunk = (delta, finish_reason = null) => ({ id: 'offline', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason }] });
  const chunks = [chunk(call ? { tool_calls: [call] } : { content }), { ...chunk({}, call ? 'tool_calls' : 'stop'), usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }];
  return new Response(chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (local.has(url.hostname)) return realFetch(input, init);
  if (url.hostname === modelHost && url.pathname.endsWith('/models')) {
    if (new Headers(init.headers).get('authorization') !== 'Bearer offline-fixture-key-not-a-real-credential') throw new Error('Offline fixture refuses an unexpected credential');
    record('model-catalog-fixture', url);
    return json({ object: 'list', data: [{ id: 'offline-approval-fixture', object: 'model', owned_by: 'offline-test' }] });
  }
  if (url.hostname === modelHost && url.pathname.endsWith('/chat/completions')) {
    if (new Headers(init.headers).get('authorization') !== 'Bearer offline-fixture-key-not-a-real-credential') throw new Error('Offline fixture refuses an unexpected credential');
    return completion(JSON.parse(init.body ?? await input.text()));
  }
  if (url.hostname === 'api.company-information.service.gov.uk') {
    record('register-fixture', url);
    const profile = { company_name: 'OFFLINE APPROVAL FIXTURE LLP', company_number: 'OC900001', company_status: 'active', type: 'llp', registered_office_address: { address_line_1: '1 Fixture Lane', locality: 'Test Town' } };
    if (url.pathname === '/search/companies') return json({ total_results: 1, items: [{ title: profile.company_name, company_number: profile.company_number, company_status: profile.company_status, company_type: profile.type, address: profile.registered_office_address }] });
    if (url.pathname === '/company/OC900001') return json(profile);
  }
  record('blocked', url);
  throw new Error('Offline test blocks external requests');
};
for (const name of ['node:http', 'node:https']) {
  const mod = require(name);
  for (const method of ['request', 'get']) {
    const original = mod[method];
    mod[method] = function(input, ...args) {
      const host = typeof input === 'string' || input instanceof URL ? new URL(input).hostname : (input?.hostname || input?.host || 'localhost');
      if (!local.has(host)) throw new Error('Offline test blocks external HTTP requests');
      return original.call(this, input, ...args);
    };
  }
}
