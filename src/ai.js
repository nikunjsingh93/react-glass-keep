/**
 * AI Assistant Module (Server-side implementation)
 * This calls the backend AI endpoint instead of running inference in the browser.
 */

const API_BASE = "/api";
const AUTH_KEY = "glass-keep-auth";

const getAuthToken = () => {
  try {
    const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    return auth?.token;
  } catch (e) {
    return null;
  }
};

export async function initAI(onProgress) {
  // No-op for server-side AI as server handles initialization
  if (onProgress) onProgress({ status: 'ready' });
  return Promise.resolve();
}

/**
 * Ask the AI assistant a question.
 * @param {string} question 
 * @param {Array} notes 
 * @param {Function} onProgress 
 */
export async function askAI(question, notes, onProgress) {
  const token = getAuthToken();
  if (!token) {
    throw new Error("You must be logged in to use the AI Assistant.");
  }

  // We can still simulate "starting" if we want, or just call the API
  if (onProgress) onProgress({ status: 'init' });

  try {
    const response = await fetch(`${API_BASE}/ai/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        question,
        notes: notes.map(n => ({
          title: n.title,
          content: n.content
        }))
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Server responded with ${response.status}`);
    }

    const data = await response.json();

    if (onProgress) onProgress({ status: 'ready' });

    return data.answer;
  } catch (err) {
    console.error("AI Assistant API Error:", err);
    throw err;
  }
}
