import DOMPurify from 'dompurify';
import { marked } from 'marked';

// Every Markdown surface, including model output, uses the same policy.
export function renderMarkdown(value) {
  return DOMPurify.sanitize(marked.parse(String(value || '')), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe'],
    FORBID_ATTR: ['style'],
  });
}
